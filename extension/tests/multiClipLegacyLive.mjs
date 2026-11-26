import {puppeteer} from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=await puppeteer.launch({executablePath:resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe'),headless:true,pipe:true,enableExtensions:true,defaultViewport:{width:1440,height:1000},args:['--no-first-run']});
let page;
try{
 await browser.installExtension(resolve('.browser/drive-test'));page=await browser.newPage();
 await page.evaluateOnNewDocument(()=>{window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('wide-batch-legacy',{create:true});};});
 await page.goto('https://wide.video/app/1.7.12/');await page.waitForSelector('.Intro button.openProject');await page.click('.Intro button.openProject');await page.waitForSelector('[data-ws-link-action=link]');
 await page.evaluate(()=>{const data=new DataTransfer();for(const name of ['A','B'])data.items.add(new File([`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="red"/></svg>`],name+'.svg',{type:'image/svg+xml'}));document.querySelector('.MediaListView').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));});
 await page.waitForFunction(()=>document.querySelectorAll('.MediaView.mediaContent-valid').length===2);
 for(let index=0;index<2;index++){
  await (await page.$$('.MediaPanel .MediaView'))[index].click();await page.click('.MediaPanel .Controls .addClip');await page.waitForSelector('.AddClipForm');
  await page.evaluate(()=>{const form=document.querySelector('.AddClipForm');form.timeRow.updateValue('0');form.submit('user');});await pause(450);
  await page.evaluate(()=>{for(const dialog of document.querySelectorAll('dialog[open]'))if(dialog.querySelector('.ConfirmView'))dialog.querySelector('button.false')?.click();});
  await page.waitForFunction(count=>document.querySelectorAll('.TimelineClipContainer').length===count,{},index+1);
 }
 await page.evaluate(()=>{const control=document.querySelector('.ProjectTime');control.timeView.updateValue(2);control.onTimeViewChange();});await pause(800);
 const select=async single=>{await page.evaluate(single=>{document.querySelector('.MediaPanel').onMediaListSelectMedia(undefined,false);const nodes=[...document.querySelectorAll('.TimelineClipContainer')];for(const node of single?nodes.slice(0,1):nodes)node.onClick(new MouseEvent('click',{ctrlKey:true,cancelable:true}));},single);await pause(250);};
 await select(false);await page.click('.TimelineClipContainer',{button:'right'});await page.waitForSelector('.ws-batch-split:not(.disabled)');await page.hover('.ws-batch-split');await page.waitForSelector('.ws-batch-split-both',{visible:true});await page.click('.ws-batch-split-both');await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===4);
 await page.waitForFunction(()=>!document.querySelector('[data-ws-history-action=undo]').disabled);await page.click('[data-ws-history-action=undo]');await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===2);await pause(500);
 await select(false);await page.click('[data-ws-link-action=link]');await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===2);await select(true);await page.click('.TimelineClipContainer',{button:'right'});await page.waitForSelector('.ws-batch-filters');await page.click('.ws-batch-filters');await page.waitForSelector('.FilterSelector .bar button.filter');await page.click('.FilterSelector .bar button.filter');await page.waitForSelector('.FilterSelector .filter-opacity',{visible:true});await page.click('.FilterSelector .filter-opacity');
 await page.waitForFunction(()=>document.querySelector('.ProjectApp').project.presentation.layer.flatMap(layer=>layer.clip).filter(clip=>clip.filter?.some(filter=>filter.kind==='opacity')).length===2);
 await page.waitForFunction(()=>!document.querySelector('[data-ws-history-action=undo]').disabled);await page.click('[data-ws-history-action=undo]');await page.waitForFunction(()=>document.querySelector('.ProjectApp').project.presentation.layer.flatMap(layer=>layer.clip).every(clip=>!clip.filter?.some(filter=>filter.kind==='opacity')));await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===2);
 assert.equal(await page.$$eval('.TimelineClipContainer',nodes=>nodes.length),2);
 console.log('PASS Wide 1.7.12: native batch split, linked raw filters, one-step undo and preserved links');
}catch(error){if(page)console.log('DEBUG',await page.evaluate(()=>({toast:[...document.querySelectorAll('.ws-selection-toast')].map(node=>node.textContent),dialogs:[...document.querySelectorAll('dialog[open]')].map(node=>node.textContent.slice(0,400))})));throw error;}finally{await browser.close();}
