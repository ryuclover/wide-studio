import {puppeteer} from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe'),headless:true,pipe:true,enableExtensions:true,defaultViewport:{width:1440,height:1000},args:['--no-first-run']});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let page;
try{
 const extensionId=await browser.installExtension(resolve('.browser/drive-test'));page=await browser.newPage();page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.goto('https://wide.video/app/1.7.12/');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Open Temporary Project')));await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Open Temporary Project')).click());
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

 const version=await page.evaluate(()=>document.querySelector('.ProjectApp').project.metadata.version);
 const gaps=await page.$$eval('.TimelineGap button',nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0&&r.x>180&&r.x+r.width<1400));assert.ok(gaps.length,'visible native gap control');
 const gap=gaps[0],target=(await clips())[0];await page.mouse.move(gap.x+gap.width/2,gap.y+gap.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:15});assert.ok(await page.$('.ws-selection-box'),'real drag from gap X starts rectangle before release');await page.screenshot({path:'../docs/evidence/gap-selection-live.png'});await page.mouse.up();await pause(350);assert.equal(await page.$('.ws-selection-box'),null);assert.equal(await page.evaluate(()=>document.querySelector('.ProjectApp').project.metadata.version),version,'dragging gap never edits timeline');assert.equal((await clips()).length,3);
 console.log('PASS native gap X starts rectangle, live feedback, clean release and no ripple deletion');
}finally{await browser.close();}
