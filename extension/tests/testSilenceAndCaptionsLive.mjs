import { puppeteer } from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

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
  console.log('Extension installed:', extension?.id || 'ok');

  const page = await browser.newPage();
  console.log('Navigating to wide.video app...');
  await page.goto('https://wide.video/app/1.7.12/');

  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Open Temporary Project')));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Temporary Project')).click());
  console.log('Temporary project opened');

  await page.waitForSelector('.TimelinePanel');
  await new Promise(r => setTimeout(r, 1000));

  // 1. Import synthetic audio WAV
  const wavBase64 = readFileSync('tests/synthetic-audio.wav').toString('base64');
  console.log('Importing synthetic WAV (base64 length:', wavBase64.length, ')...');

  const importResult = await page.evaluate(async (base64Data) => {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes.buffer], 'synthetic-audio.wav', { type: 'audio/wav' });

    const mediaList = document.querySelector('.MediaListView');
    const dt = new DataTransfer();
    dt.items.add(file);
    mediaList.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));

    // Wait up to 10s for media to be registered and valid
    const start = Date.now();
    while (Date.now() - start < 10000) {
      await new Promise(r => setTimeout(r, 200));
      const validMedia = document.querySelector('.MediaListView .MediaView.mediaContent-valid');
      if (validMedia) return { success: true, title: validMedia.title };
    }
    return { success: false, error: 'Media validation timeout' };
  }, wavBase64);
  console.log('Audio import result:', importResult);
  if (!importResult.success) throw new Error(importResult.error);

  // 2. Inspect project structure and add audio media to timeline by dragging
  console.log('Inspecting project and adding audio to timeline...');
  const projInspection = await page.evaluate(() => {
    const p = document.querySelector('.ProjectApp')?.project;
    return {
      keys: Object.keys(p || {}),
      presentationKeys: Object.keys(p?.presentation || {}),
      layersCount: p?.presentation?.layer?.length
    };
  });
  console.log('Project inspection:', projInspection);

  // Drag the media item from MediaListView to the Timeline
  const mediaElement = await page.$('.MediaListView .MediaView');
  const layerContainer = await page.$('.TimelineLayerRow:not(.virtual) .clipsContainer') || await page.$('.TimelinePanel .TimelineLayerRow');
  const a = await mediaElement.boundingBox();
  const b = await layerContainer.boundingBox();

  console.log('Dragging from', a, 'to', b);
  await page.setDragInterception(true);
  const dragData = await page.mouse.drag({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: a.x + a.width / 2 + 10, y: a.y + a.height / 2 + 10 });
  await new Promise(r => setTimeout(r, 400));
  const dropDest = { x: b.x + 50, y: b.y + 15 };
  await page.mouse.dragEnter(dropDest, dragData);
  await page.mouse.dragOver(dropDest, dragData);
  await new Promise(r => setTimeout(r, 200));
  await page.mouse.drop(dropDest, dragData);
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 1000));

  const timelineState = await page.evaluate(() => {
    const clips = [...document.querySelectorAll('.TimelineClipContainer')].map(c => ({
      title: c.title,
      className: c.className
    }));
    return { clipsCount: clips.length, clips };
  });
  console.log('Timeline state after drop:', timelineState);


  // 3. Test opening Silence Remover with the audio clip selected
  console.log('Opening Silence Remover dialog with selected audio clip...');
  const silenceDialogInfo = await page.evaluate(async () => {
    document.body.click();
    const menu = document.querySelector('.MenuBar .SmartToolsMenu');
    menu.click();
    await new Promise(r => setTimeout(r, 100));
    const popup = document.querySelector('dialog.ContextMenu.menuBarMenu[open]');
    const silenceBtn = popup.querySelector('button.icon.silenceRemover');
    if (!silenceBtn) return { error: 'Silence button not found' };
    silenceBtn.click();
    await new Promise(r => setTimeout(r, 1200));

    const dialog = document.querySelector('dialog[open]');
    if (!dialog) return { error: 'No dialog opened' };

    // Inspect dialog contents
    const sourceSelector = dialog.querySelector('.SmartToolSourceSelector');
    const silenceView = dialog.querySelector('.SilenceRemoverView');
    const buttons = [...dialog.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim(),
      className: b.className,
      disabled: b.disabled
    }));

    return {
      dialogClass: dialog.className,
      hasSourceSelector: !!sourceSelector,
      hasSilenceView: !!silenceView,
      buttons,
      text: dialog.textContent?.slice(0, 500)
    };
  });
  console.log('Silence dialog info:', JSON.stringify(silenceDialogInfo, null, 2));
  await page.screenshot({ path: '../docs/evidence/live-silence-opened.png' });

  // 4. If SmartToolSourceSelector opened, select "Clip" or the media!
  const selectSourceResult = await page.evaluate(async () => {
    const dialog = document.querySelector('dialog[open]');
    if (!dialog) return { error: 'No dialog' };
    
    // Look for "Clip" tab or button in source selector
    const clipTab = [...dialog.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Clip');
    if (clipTab) {
      clipTab.click();
      await new Promise(r => setTimeout(r, 400));
    }

    // Look for "Remove Silence" action button in dialog
    const actionBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Remove Silence');
    if (actionBtn && !actionBtn.disabled) {
      actionBtn.click();
      await new Promise(r => setTimeout(r, 1500));
    }

    // Now check if SilenceRemoverView is rendered
    const silenceView = dialog.querySelector('.SilenceRemoverView') || document.querySelector('.SilenceRemoverView');
    const waveform = dialog.querySelector('.SilenceRemoverWaveform') || document.querySelector('.SilenceRemoverWaveform');
    const forms = [...dialog.querySelectorAll('form')].map(f => f.className);
    const buttons = [...dialog.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim(),
      className: b.className,
      disabled: b.disabled
    }));

    return {
      hasSilenceView: !!silenceView,
      hasWaveform: !!waveform,
      forms,
      buttons,
      dialogText: dialog.textContent?.slice(0, 500)
    };
  });
  console.log('Select source result:', JSON.stringify(selectSourceResult, null, 2));
  await page.screenshot({ path: '../docs/evidence/live-silence-waveform.png' });

  // 5. Inspect SilenceRemoverView controls, waveform, and silences
  console.log('Inspecting SilenceRemoverView controls...');
  const silenceViewDetails = await page.evaluate(async () => {
    const dialog = document.querySelector('dialog[open]');
    const view = dialog.querySelector('.SilenceRemoverView') || document.querySelector('.SilenceRemoverView');
    if (!view) return { error: 'SilenceRemoverView not found' };

    // Inspect inputs, buttons, sliders
    const inputs = [...view.querySelectorAll('input, select')].map(i => ({
      name: i.name,
      type: i.type,
      value: i.value,
      className: i.className
    }));

    const textButtons = [...view.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim(),
      className: b.className,
      disabled: b.disabled
    }));

    // Click "Find Signal Thresholds" if present, then click "Detect Silences"
    const findThresholdsBtn = [...view.querySelectorAll('button')].find(b => /Find Signal/i.test(b.textContent || ''));
    if (findThresholdsBtn) {
      findThresholdsBtn.click();
      await new Promise(r => setTimeout(r, 400));
    }

    const detectButtons = [...view.querySelectorAll('button')].filter(b => /Detect Silences/i.test(b.textContent || ''));
    console.log('Detect buttons found:', detectButtons.length);
    if (detectButtons[0]) {
      detectButtons[0].click();
      await new Promise(r => setTimeout(r, 1200));
    }

    // Check compose button again
    const composeBtn = [...view.querySelectorAll('button')].find(b => /Compose/i.test(b.textContent || ''));
    const composeStateAfterDetect = {
      text: composeBtn?.textContent?.trim(),
      disabled: composeBtn?.disabled
    };

    let composed = false;
    if (composeBtn && !composeBtn.disabled) {
      composeBtn.click();
      composed = true;
      await new Promise(r => setTimeout(r, 1500));
    }

    // Check project clips after compose
    const projectApp = document.querySelector('.ProjectApp');
    const project = projectApp.project;
    const finalClips = project.presentation.layer[0]?.clip.map(c => ({
      time: c.filter?.[0]?.time,
      trim: c.load?.trim
    }));

    const waveformEl = view.querySelector('.SilenceRemoverWaveform') || view.querySelector('canvas');
    return {
      inputs,
      textButtons,
      hasWaveformCanvas: !!waveformEl,
      composeStateAfterDetect,
      composed,
      finalClipsCount: finalClips?.length,
      finalClips
    };
  });
  console.log('SilenceView details & execution:', JSON.stringify(silenceViewDetails, null, 2));
  await page.screenshot({ path: '../docs/evidence/live-silence-composed.png' });

  // 6. Test Undo on the silence removal
  console.log('Testing Undo after silence removal...');
  const undoResult = await page.evaluate(async () => {
    document.body.click();
    const editMenu = document.querySelector('.MenuBar .EditMenu');
    if (!editMenu) return { error: 'EditMenu not found' };
    editMenu.click();
    await new Promise(r => setTimeout(r, 150));
    const popup = document.querySelector('dialog.ContextMenu.menuBarMenu[open]');
    const undoBtn = popup?.querySelector('button');
    const undoInfo = {
      label: undoBtn?.textContent?.trim(),
      disabled: undoBtn?.disabled
    };

    if (undoBtn && !undoBtn.disabled) {
      undoBtn.click();
      await new Promise(r => setTimeout(r, 1000));
    }

    const project = document.querySelector('.ProjectApp')?.project;
    const clipsAfterUndo = project.presentation.layer[0]?.clip.map(c => ({
      time: c.filter?.[0]?.time,
      trim: c.load?.trim
    }));

    return {
      undoInfo,
      clipsCountAfterUndo: clipsAfterUndo?.length,
      clipsAfterUndo
    };
  });
  console.log('Undo test result:', JSON.stringify(undoResult, null, 2));

  // 7. Test SRT Captions on Timeline:
  console.log('Testing SRT subtitles on the timeline...');
  const srtResult = await page.evaluate(async () => {
    const projectApp = document.querySelector('.ProjectApp');
    const project = projectApp.project;

    // Find the srt media item in MediaListView
    const srtMediaView = [...document.querySelectorAll('.MediaListView .MediaView')].find(m => m.title.includes('.srt') || m.title.includes('.vtt'));
    
    // Add captions clip via native Add Captions or by dragging
    document.body.click();
    const mediaMenu = document.querySelector('.MenuBar .MediaMenu');
    mediaMenu.click();
    await new Promise(r => setTimeout(r, 100));
    const popup = document.querySelector('dialog.ContextMenu.menuBarMenu[open]');
    const addCapBtn = popup?.querySelector('button.icon.addCaptions') || [...popup.querySelectorAll('button')].find(b => b.textContent.includes('Captions'));
    addCapBtn?.click();
    await new Promise(r => setTimeout(r, 800));

    // Inspect captions clips on timeline
    const allClips = project.presentation.layer.flatMap(l => l.clip).map(c => ({
      kind: c.load?.kind,
      hasCaptions: !!c.load?.captions,
      source: c.load?.source,
      cuesCount: c.load?.captions?.cues?.length
    }));

    // Find the CaptionsCueLineForm or inspect captions editor view
    const captionsClipsDom = [...document.querySelectorAll('.TimelineClipContainer')].map(c => ({
      title: c.title,
      className: c.className
    }));

    return {
      allClips,
      captionsClipsDom
    };
  });
  console.log('SRT Captions result:', JSON.stringify(srtResult, null, 2));
  await page.screenshot({ path: '../docs/evidence/live-captions-timeline.png' });

  // Save evidence
  const evidence = {
    importResult,
    projInspection,
    silenceDialogInfo,
    selectSourceResult,
    silenceViewDetails,
    undoResult,
    srtResult
  };
  writeFileSync('../docs/evidence/live-silence-execution.json', JSON.stringify(evidence, null, 2));
  console.log('Evidence saved to docs/evidence/live-silence-execution.json');



} catch (err) {
  console.error('Error during test:', err);
} finally {
  await browser.close();
  console.log('Browser closed.');
}
