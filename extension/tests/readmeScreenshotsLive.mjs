import {puppeteer} from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe'),headless:true,pipe:true,enableExtensions:true,defaultViewport:{width:1440,height:1000},args:['--no-first-run']});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let page;
try{
 const extensionId=await browser.installExtension(resolve('.browser/drive-test'));page=await browser.newPage();page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.evaluateOnNewDocument(()=>{window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('wide-studio-history-test',{create:true});};});await page.goto('https://wide.video/app/1.7.12/');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Open Project')));await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Open Project')).click());
 await page.waitForSelector('[data-ws-marquee-toggle]');
 await page.evaluate(()=>{const files=new DataTransfer();for(const [i,color]of ['#e85454','#5389de','#d3ab44'].entries()){files.items.add(new File([`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${color}"/></svg>`],`Selection-${i+1}.svg`,{type:'image/svg+xml'}));}document.querySelector('.MediaListView').dispatchEvent(new DragEvent('drop',{dataTransfer:files,bubbles:true,cancelable:true}));});
 await page.waitForFunction(()=>document.querySelectorAll('.MediaListView .MediaView.mediaContent-valid').length===3,{timeout:45000});
 const add=async(index,time,reuseLayer)=>{
  await page.$eval('.ProjectTime .TimeView input',(input,time)=>{input.value=String(time);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));input.blur();},time);await pause(150);
  await (await page.$$('.MediaPanel .MediaView'))[index].click();await page.click('.MediaPanel .Controls .addClip');await page.waitForSelector('dialog[open]');
  if(reuseLayer)await page.evaluate(()=>{const select=[...document.querySelectorAll('dialog[open] select')].find(s=>[...s.options].some(o=>o.textContent.includes('Layer #1')));if(!select)throw new Error('Layer options: '+[...document.querySelectorAll('dialog[open] select')].map(s=>s.textContent).join('|'));select.value=[...select.options].find(o=>o.textContent.includes('Layer #1')).value;select.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.evaluate(()=>[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.includes('Create Clip From Media')).click());await pause(500);
  const modal=await page.$('dialog[open]:not(.ContextMenu)');if(modal){console.log('DIALOG',await modal.evaluate(e=>e.textContent));await page.evaluate(()=>[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()==='No')?.click());await pause(200);}
  await page.waitForFunction(count=>document.querySelectorAll('.TimelineClipContainer').length===count,{timeout:15000},index+1);
 };
 await add(0,2,true);await add(1,5,false);await add(2,20,true);
 const clips=()=>page.evaluate(()=>[...document.querySelectorAll('.TimelineClipContainer')].map(e=>({name:e.title,selected:e.classList.contains('selected'),start:e.timing.presentation.start,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
 const shot=async name=>{await page.mouse.move(1100,600);await pause(400);await page.screenshot({path:`../docs/screenshots/${name}.png`});console.log('SCREENSHOT',name);};
 const select=async indices=>{await page.evaluate(indices=>{document.querySelector('.MediaPanel').onMediaListSelectMedia(undefined,false);const nodes=[...document.querySelectorAll('.TimelineClipContainer')];for(const i of indices)nodes[i].onClick(new MouseEvent('click',{ctrlKey:true,cancelable:true}));},indices);await pause(350);};
 await page.select('.ws-language-control select','en');await pause(500);
 await select([0]);await shot('workspace-current');
 await page.click('.ws-customize-trigger');await page.waitForSelector('dialog.ws-customize[open]');await shot('customize');await page.click('.ws-customize-footer button:nth-child(2)');
 await select([0,1]);await page.click('.TimelineClipContainer',{button:'right'});await page.waitForSelector('dialog.ContextMenu[open] .ws-context-link:not(.disabled)');await shot('link-context');await page.click('dialog.ContextMenu[open] .ws-context-link');await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===2);
 await page.click('.TimelineClipContainer',{button:'right'});await page.waitForSelector('dialog.ContextMenu[open] .ws-context-unlink:not(.disabled)');await shot('unlink-context');await page.click('dialog.ContextMenu[open] .ws-context-unlink');
 const targets=(await clips()).filter(c=>!c.name.includes('Selection-3'));
 const rect={left:Math.min(...targets.map(t=>t.x))-5,right:Math.max(...targets.map(t=>t.x))+18,top:Math.min(...targets.map(t=>t.y))-4,bottom:Math.max(...targets.map(t=>t.y+t.height))+4};
 await page.click('[data-ws-marquee-toggle]');await page.mouse.move(rect.right,rect.bottom);await page.mouse.down();await page.mouse.move(rect.left,rect.top,{steps:15});await page.screenshot({path:'../docs/screenshots/rectangle-selection.png'});await page.mouse.up();await pause(350);
 await select([0]);const seed=await(await page.$('.TimelineClipContainer')).boundingBox();await page.mouse.move(seed.x+30,seed.y+20);await page.mouse.down();await page.mouse.move(seed.x+95,seed.y+20,{steps:15});await page.mouse.up();await pause(1000);
 await page.click('#ws-history-tab');await page.waitForFunction(()=>document.querySelector('.ws-history-list li'));await shot('history-current');
 await page.click('#ws-assisted-tab');await page.waitForFrame(f=>f.url().includes('assistant.html'));await pause(1000);await shot('assisted-editing');
 await page.click('[data-ws-folder-id="audio"]>.ws-folder-trigger');await page.waitForSelector('.ws-folder.open');await shot('native-shortcuts');
 await page.evaluate(()=>document.querySelector('[data-native-action="addText"]').click());await page.waitForFunction(()=>[...document.querySelectorAll('.TimelineClipContainer')].some(n=>n.init.clip.load.source==='text'));await page.waitForFunction(()=>!document.querySelector('dialog[open] .AddClipForm'));await page.click('.ws-inspector-tabs button:first-child');await shot('direct-text');
 await page.select('.ws-language-control select','pt-BR');await pause(500);await page.click('.MenuBar .ProjectMenu');await page.waitForSelector('dialog.ContextMenu.menuBarMenu[open]');await shot('language-portuguese');await page.keyboard.press('Escape');
 console.log('PASS README captures: real editor, menus, linking, selection, history, chat, direct text and language');
}finally{await browser.close();}
