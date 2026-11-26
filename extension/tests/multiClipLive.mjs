import {puppeteer} from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=await puppeteer.launch({executablePath:resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe'),headless:true,pipe:true,enableExtensions:true,defaultViewport:{width:1500,height:1000},args:['--no-first-run']});
let page;
try{
 await browser.installExtension(resolve('.browser/drive-test'));page=await browser.newPage();page.on('pageerror',error=>console.log('PAGEERROR',error.message));
 await page.evaluateOnNewDocument(()=>{window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('wide-studio-batch-test',{create:true});};});
 await page.goto('https://wide.video/app/1.8.0/');await page.waitForSelector('.Intro button.openProject');await page.click('.Intro button.openProject');
 await page.waitForFunction(()=>!!window.api?.run&&!!document.querySelector('[data-ws-link-action=link]'));
 await page.evaluate(async()=>{
  const scene=await api.run('operation-scene-get');await api.run('operation-scene-update',{...scene,duration:10,smartDuration:false});
  for(const name of ['Batch A','Batch B','Untouched']){
   const layer=await api.run('operation-layer-add',{name});const clip=await api.run('operation-clip-add',{layerId:layer.ID,data:{name,load:{kind:'load',source:'text',text:name,trim:{duration:10}}}});const delay=clip.filter?.find(filter=>filter.kind==='delay');if(delay)await api.run('operation-filter-update',{filterId:delay.ID,update:{kind:'delay',time:0}});else await api.run('operation-filter-add',{clipId:clip.ID,data:{kind:'delay',time:0}});
  }
  await api.run('operation-project-activity-seek',5);
 });
 await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===3);await pause(1200);
 const select=async names=>{await page.evaluate(names=>{document.querySelector('.MediaPanel').onMediaListSelectMedia(undefined,false);for(const node of document.querySelectorAll('.TimelineClipContainer'))if(names.includes(node.init.clip.name))node.onClick(new MouseEvent('click',{ctrlKey:true,cancelable:true}));},names);await pause(350);};
 const state=()=>page.evaluate(()=>[...document.querySelectorAll('.TimelineClipContainer')].map(node=>({name:node.init.clip.name,start:node.timing.presentation.start,end:node.timing.presentation.end,linked:!!node.querySelector('.ws-link-badge'),filter:node.init.clip.filter?.map(filter=>filter.kind)})));
 const open=async()=>{const clip=await page.evaluateHandle(()=>[...document.querySelectorAll('.TimelineClipContainer')].find(node=>node.classList.contains('selected')));await clip.asElement().click({button:'right'});await page.waitForSelector('dialog.ContextMenu[open]');};
 const undo=async count=>{await page.waitForFunction(()=>!document.querySelector('[data-ws-history-action=undo]').disabled);await page.click('[data-ws-history-action=undo]');await page.waitForFunction(count=>document.querySelectorAll('.TimelineClipContainer').length===count,{},count);await pause(500);};
 await page.evaluate(()=>{window.__batchMessages=[];new MutationObserver(()=>{for(const node of document.querySelectorAll('.ws-selection-toast'))if(node.textContent&&!window.__batchMessages.includes(node.textContent))window.__batchMessages.push(node.textContent);}).observe(document.body,{childList:true,subtree:true,characterData:true});});
 await select(['Batch A','Batch B']);await open();
 await page.waitForSelector('.ws-batch-split:not(.disabled)');await page.screenshot({path:'../docs/evidence/batch-actions-menu.png'});await page.hover('.ws-batch-split');await page.waitForSelector('.ws-batch-split-both',{visible:true});await page.click('.ws-batch-split-both');
 await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===5);await pause(1000);
 let result=await state();assert.equal(result.filter(clip=>clip.name==='Untouched').length,1);assert.equal(result.filter(clip=>clip.name!=='Untouched'&&Math.abs(clip.end-5)<=1/30+.001).length,2);assert.equal(result.filter(clip=>clip.name!=='Untouched'&&Math.abs(clip.start-5)<=1/30+.001).length,2);
 await undo(3);await select(['Batch A','Batch B']);await page.click('[data-ws-link-action=link]');await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===2);
 await select(['Batch A']);await open();await page.waitForSelector('.ws-batch-filters');await page.click('.ws-batch-filters');await page.waitForSelector('dialog[open]:not(.ContextMenu)');
 // Inspect the native popup's target set, not merely the existence of a dialog.
 assert.equal(await page.evaluate(()=>{const nodes=[...document.querySelectorAll('dialog[open] *')];return nodes.find(node=>node.init?.clips instanceof Set)?.init.clips.size;}),2,'filter selector targets both linked clips');
 await page.waitForSelector('.FilterSelector .bar button.filter');await page.click('.FilterSelector .bar button.filter');await page.waitForSelector('.FilterSelector .filter-opacity',{visible:true});await page.click('.FilterSelector .filter-opacity');
 await page.waitForFunction(()=>document.querySelector('.ProjectApp').project.presentation.layer.flatMap(layer=>layer.clip).filter(clip=>clip.name!=='Untouched'&&clip.filter?.some(filter=>filter.kind==='opacity')).length===2);
 await page.waitForFunction(()=>!document.querySelector('[data-ws-history-action=undo]').disabled);await page.click('[data-ws-history-action=undo]');await page.waitForFunction(()=>document.querySelector('.ProjectApp').project.presentation.layer.flatMap(layer=>layer.clip).every(clip=>!clip.filter?.some(filter=>filter.kind==='opacity')));await pause(500);await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===2);
 console.log('PASS raw opacity filter applied to both linked clips and undone');
 await select(['Batch A']);await open();await page.click('.ws-batch-filters');await page.waitForSelector('.FilterSelector .EffectButton');
 await page.evaluate(()=>{const button=[...document.querySelectorAll('.FilterSelector .EffectButton')].find(node=>node.init?.title==='Greyscale');if(!button)throw Error('Greyscale effect not found');button.click();});
 await page.waitForFunction(()=>{const p=document.querySelector('.ProjectApp').project;return p.presentation.layer.flatMap(layer=>layer.clip).filter(clip=>clip.name!=='Untouched'&&(clip.filter?.length||0)>2).length===2;});
 assert.equal((await state()).find(clip=>clip.name==='Untouched').filter.length,2,'filter leaves unrelated clip unchanged');
 await page.waitForFunction(()=>!document.querySelector('[data-ws-history-action=undo]').disabled);await page.click('[data-ws-history-action=undo]');await page.waitForFunction(()=>document.querySelector('.ProjectApp').project.presentation.layer.flatMap(layer=>layer.clip).every(clip=>(clip.filter?.length||0)===2));await pause(500);
 console.log('PASS actual filter applied to both linked clips and undone');
 await select(['Batch A']);await open();await page.hover('.ws-batch-split');await page.waitForSelector('.ws-batch-split-both',{visible:true});await page.click('.ws-batch-split-both');
 await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===5);await pause(1000);result=await state();assert.equal(result.filter(clip=>clip.linked).length,4,'each half retains a two-clip link');
 await undo(3);await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===2);await select(['Batch A']);
 await page.keyboard.down('Control');await page.keyboard.press('b');await page.keyboard.up('Control');await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===5);await pause(800);await undo(3);
 await select(['Batch A','Batch B']);await open();await page.click('.ws-batch-duplicate');await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===5);await pause(900);assert.equal((await state()).filter(clip=>clip.name==='Untouched').length,1);await undo(3);
 await select(['Batch A','Batch B']);await page.evaluate(()=>[...document.querySelectorAll('.TimelineClipContainer')].find(node=>node.init.clip.name==='Batch A').querySelector('button.locked').click());await pause(400);await open();assert.ok(await page.$('.ws-batch-split.disabled'));assert.ok(await page.$('.ws-batch-filters.disabled'));assert.equal((await state()).length,3);
 await page.screenshot({path:'../docs/evidence/batch-actions-live.png'});
 console.log('PASS multi/linked split, exact cut timing, native filter targets, preserved links, keyboard split, duplicate, locked guard, untouched neighbor and one-step undo');
}catch(error){if(page){console.log('DEBUG',await page.evaluate(()=>({toast:document.querySelector('.ws-selection-toast:not([hidden])')?.textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(node=>node.textContent.slice(0,1800)),clips:document.querySelectorAll('.TimelineClipContainer').length,batch:document.documentElement.dataset.wsBatchSplit,messages:window.__batchMessages,nodes:[...document.querySelectorAll('.TimelineClipContainer')].map(node=>({name:node.init.clip.name,projectMatches:node.init.project===document.querySelector('.ProjectApp').project,clipMatches:document.querySelector('.ProjectApp').project.presentation.layer.some(layer=>layer.clip.includes(node.init.clip)),classes:node.className,badge:!!node.querySelector('.ws-link-badge')}))})));await page.screenshot({path:'../docs/evidence/batch-actions-debug.png'});}throw error;}finally{await browser.close();}
