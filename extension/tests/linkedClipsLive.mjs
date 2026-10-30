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

 await page.waitForSelector('[data-ws-link-action="link"]');
 const select=async(indices)=>{await page.evaluate(indices=>{const panel=document.querySelector('.MediaPanel');panel.onMediaListSelectMedia(undefined,false);const nodes=[...document.querySelectorAll('.TimelineClipContainer')];for(const i of indices)nodes[i].onClick(new MouseEvent('click',{ctrlKey:true,cancelable:true}));},indices);await pause(350);};
 const move=async(index,delta)=>{const box=await(await page.$$('.TimelineClipContainer'))[index].boundingBox();await page.mouse.move(box.x+30,box.y+20);await page.mouse.down();await page.mouse.move(box.x+30+delta,box.y+20,{steps:20});await page.mouse.up();await pause(1000);};
 // Seed native positioning before measuring the smooth-history path.
 await select([0]);await move(0,30);
 await select([0,1]);await page.click('[data-ws-link-action="link"]');await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===2);
 await select([0]);const before=await clips();await page.evaluate(()=>window.__linkedProject=document.querySelector('.ProjectApp').project);await move(0,70);const after=await clips();console.log('MOVE',JSON.stringify({before,after}));
 const delta=after[0].start-before[0].start;assert.ok(delta>.1);assert.ok(Math.abs(after[1].start-before[1].start-delta)<.04,'linked clip follows same delta');assert.equal(after[2].start,before[2].start,'unlinked clip stays put');
 await page.click('[data-ws-history-action="undo"]');await pause(900);const undone=await clips();for(let i=0;i<3;i++)assert.ok(Math.abs(undone[i].start-before[i].start)<.001);assert.equal(await page.evaluate(()=>window.__linkedProject===document.querySelector('.ProjectApp').project),true,'same native project on undo');
 await page.click('[data-ws-history-action="redo"]');await pause(900);const redone=await clips();for(let i=0;i<3;i++)assert.ok(Math.abs(redone[i].start-after[i].start)<.001);
 await select([1]);await move(1,35);const reverse=await clips();assert.ok(Math.abs(reverse[0].start-redone[0].start-(reverse[1].start-redone[1].start))<.04,'drag either member');

 // A locked member must prevent the entire group from moving.
 await page.evaluate(()=>document.querySelectorAll('.TimelineClipContainer')[1].querySelector('button.locked').click());await pause(350);const locked=await clips();await move(0,35);const lockedAfter=await clips();for(let i=0;i<3;i++)assert.equal(lockedAfter[i].start,locked[i].start,'locked group does not partially move');
 await page.evaluate(()=>document.querySelectorAll('.TimelineClipContainer')[1].querySelector('button.locked').click());await pause(350);
 const boundaryBefore=await clips();await move(0,-650);const boundary=await clips();console.log('BOUNDARY',JSON.stringify({boundaryBefore,boundary}));assert.ok(boundary[0].start>=0&&boundary[1].start>=0,'neither member crosses zero');assert.ok(Math.abs((boundary[0].start-boundary[1].start)-(boundaryBefore[0].start-boundaryBefore[1].start))<.04,'boundary preserves spacing');
 await page.screenshot({path:'../docs/evidence/linked-clips-live.png'});
 await page.reload();await page.waitForSelector('.Intro button.openProject');await page.click('.Intro button.openProject');await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===2);console.log('PASS persisted group after reload');
 await select([0]);await page.click('[data-ws-link-action="unlink"]');await page.waitForFunction(()=>document.querySelectorAll('.ws-link-badge').length===0);const separated=await clips();await move(0,35);const separatedAfter=await clips();assert.ok(separatedAfter[0].start>separated[0].start);assert.equal(separatedAfter[1].start,separated[1].start);
 console.log('PASS linked native drag, isolated third clip, undo/redo, reverse-member drag, reload and unlink');
}finally{await browser.close();}
