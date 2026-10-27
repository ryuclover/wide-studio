import { puppeteer } from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const executable = resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe');
console.log('Launching browser with executable:', executable);

const browser = await puppeteer.launch({
  executablePath: executable,
  headless: true,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1440, height: 900 },
  args: ['--no-first-run']
});

try {
  const extension = await browser.installExtension(resolve('.browser/drive-test'));
  console.log('Extension installed:', extension.id);

  const page = await browser.newPage();
  console.log('Navigating to wide.video app...');
  await page.goto('https://wide.video/app/1.7.12/');

  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Open Temporary Project')));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Temporary Project')).click());
  console.log('Temporary project opened');

  await page.waitForSelector('.TimelinePanel');
  await new Promise(r => setTimeout(r, 1000));

  // 1. Inspect SmartTools menu items
  const menuInfo = await page.evaluate(async () => {
    document.body.click();
    const menu = document.querySelector('.MenuBar .SmartToolsMenu');
    if (!menu) return { error: 'SmartToolsMenu not found' };
    menu.click();
    await new Promise(r => setTimeout(r, 100));
    const popup = document.querySelector('dialog.ContextMenu.menuBarMenu[open]');
    if (!popup) return { error: 'SmartTools popup not opened' };
    const items = [...popup.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim(),
      className: b.className,
      disabled: b.disabled || b.classList.contains('disabled')
    }));
    return { items };
  });
  console.log('SmartTools menu items:', JSON.stringify(menuInfo, null, 2));

  // 2. Inspect Media menu (Add Captions / Text)
  const mediaMenuInfo = await page.evaluate(async () => {
    document.body.click();
    const menu = document.querySelector('.MenuBar .MediaMenu');
    if (!menu) return { error: 'MediaMenu not found' };
    menu.click();
    await new Promise(r => setTimeout(r, 100));
    const popup = document.querySelector('dialog.ContextMenu.menuBarMenu[open]');
    if (!popup) return { error: 'MediaMenu popup not opened' };
    const items = [...popup.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim(),
      className: b.className,
      disabled: b.disabled || b.classList.contains('disabled')
    }));
    return { items };
  });
  console.log('Media menu items:', JSON.stringify(mediaMenuInfo, null, 2));

  // 3. Test clicking "Add Captions" if present in Media menu
  const addCaptionsResult = await page.evaluate(async () => {
    document.body.click();
    const menu = document.querySelector('.MenuBar .MediaMenu');
    menu.click();
    await new Promise(r => setTimeout(r, 100));
    const popup = document.querySelector('dialog.ContextMenu.menuBarMenu[open]');
    const addCapBtn = [...popup.querySelectorAll('button')].find(b => b.textContent.includes('Captions'));
    if (!addCapBtn) return { error: 'Captions button not found in Media menu' };
    addCapBtn.click();
    await new Promise(r => setTimeout(r, 800));

    // Check media list and timeline
    const media = [...document.querySelectorAll('.MediaListView .MediaView')].map(e => e.title);
    const clips = [...document.querySelectorAll('.TimelineClipContainer')].map(e => ({
      title: e.title,
      className: e.className
    }));
    const dialogs = [...document.querySelectorAll('dialog[open]')].map(d => ({
      className: d.className,
      text: d.textContent?.slice(0, 300)
    }));
    return { media, clips, dialogs };
  });
  console.log('Add Captions result:', JSON.stringify(addCaptionsResult, null, 2));

  // Take screenshot after Add Captions
  await page.screenshot({ path: '../docs/evidence/live-add-captions.png' });

  // 4. Test opening SilenceRemover and CaptionsGenerator dialogs
  // Let's see what happens if we click SilenceRemover in SmartTools
  const silenceResult = await page.evaluate(async () => {
    document.body.click();
    const menu = document.querySelector('.MenuBar .SmartToolsMenu');
    menu.click();
    await new Promise(r => setTimeout(r, 100));
    const popup = document.querySelector('dialog.ContextMenu.menuBarMenu[open]');
    const silenceBtn = popup.querySelector('button.icon.silenceRemover') || [...popup.querySelectorAll('button')].find(b => b.textContent.includes('Silence'));
    if (!silenceBtn) return { error: 'Silence button not found' };
    silenceBtn.click();
    await new Promise(r => setTimeout(r, 800));

    const dialogs = [...document.querySelectorAll('dialog[open]')].map(d => ({
      className: d.className,
      title: d.querySelector('.header, h1, h2, h3, .title')?.textContent?.trim(),
      buttons: [...d.querySelectorAll('button')].map(b => b.textContent?.trim()),
      forms: [...d.querySelectorAll('form, .form')].map(f => f.className),
      text: d.textContent?.slice(0, 400)
    }));
    return { dialogs };
  });
  console.log('Silence remover dialog test:', JSON.stringify(silenceResult, null, 2));
  await page.screenshot({ path: '../docs/evidence/live-silence-remover.png' });

  // Close any open dialogs
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('dialog[open]')) {
      d.close?.();
    }
  });

  // 5. Test opening CaptionsGenerator in SmartTools
  const captionsGenResult = await page.evaluate(async () => {
    document.body.click();
    const menu = document.querySelector('.MenuBar .SmartToolsMenu');
    menu.click();
    await new Promise(r => setTimeout(r, 100));
    const popup = document.querySelector('dialog.ContextMenu.menuBarMenu[open]');
    const capBtn = popup.querySelector('button.icon.captionsGenerator') || [...popup.querySelectorAll('button')].find(b => b.textContent.includes('Caption'));
    if (!capBtn) return { error: 'Captions generator button not found' };
    capBtn.click();
    await new Promise(r => setTimeout(r, 800));

    const dialogs = [...document.querySelectorAll('dialog[open]')].map(d => ({
      className: d.className,
      title: d.querySelector('.header, h1, h2, h3, .title')?.textContent?.trim(),
      buttons: [...d.querySelectorAll('button')].map(b => b.textContent?.trim()),
      forms: [...d.querySelectorAll('form, .form')].map(f => f.className),
      text: d.textContent?.slice(0, 400)
    }));
    return { dialogs };
  });
  console.log('Captions generator dialog test:', JSON.stringify(captionsGenResult, null, 2));
  await page.screenshot({ path: '../docs/evidence/live-captions-generator.png' });

  // 6. Test SRT subtitle import!
  const srtContent = `1
00:00:01,000 --> 00:00:03,500
Olá, bem-vindo ao Wide Studio!

2
00:00:04,000 --> 00:00:07,000
Esta é uma legenda de teste em português.
`;

  const srtImportResult = await page.evaluate(async (srtText) => {
    const projectApp = document.querySelector('.ProjectApp');
    const project = projectApp.project;
    const file = new File([srtText], 'legendas-teste.srt', { type: 'text/plain' });

    // Use native file import through project dispatcher or input drop
    // In wide.video, files can be dropped or imported via FileAction or triggerGlobal
    // Let's test importing the file into project media directory
    const mediaDir = project.directory.input;
    const projectRoot = project.directory.root;
    
    // We can dispatch file drop / import on .MediaListView
    const mediaList = document.querySelector('.MediaListView');
    const dt = new DataTransfer();
    dt.items.add(file);

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt
    });
    mediaList.dispatchEvent(dropEvent);
    await new Promise(r => setTimeout(r, 1500));

    const media = [...document.querySelectorAll('.MediaListView .MediaView')].map(e => ({
      title: e.title,
      className: e.className
    }));

    return { media, projectFiles: Object.keys(project.media || {}) };
  }, srtContent);
  console.log('SRT Import result:', JSON.stringify(srtImportResult, null, 2));

  // Save evidence
  const evidence = {
    menuInfo,
    mediaMenuInfo,
    addCaptionsResult,
    silenceResult,
    captionsGenResult,
    srtImportResult
  };
  writeFileSync('../docs/evidence/native-audio-captions-evidence.json', JSON.stringify(evidence, null, 2));
  console.log('Evidence saved to docs/evidence/native-audio-captions-evidence.json');

} catch (err) {
  console.error('Error during live probe:', err);
} finally {
  await browser.close();
  console.log('Browser closed.');
}
