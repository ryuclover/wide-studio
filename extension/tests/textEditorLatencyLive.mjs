import {puppeteer} from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const version=process.env.WIDE_TEST_VERSION||'1.8.0';
const browser=await puppeteer.launch({executablePath:resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe'),headless:true,pipe:true,enableExtensions:true,defaultViewport:{width:1440,height:1000},args:['--no-first-run']});
let page;
try{
 await browser.installExtension(resolve('.browser/drive-test'));page=await browser.newPage();
 await page.evaluateOnNewDocument(()=>{window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('wide-text-latency-test',{create:true});};});
 await page.goto(`https://wide.video/app/${version}/`);await page.waitForSelector('.Intro button.openProject');await page.click('.Intro button.openProject');await page.waitForSelector('[data-native-action=addText]');await page.$eval('[data-native-action=addText]',button=>button.click());await page.waitForSelector('.TimelineClipContainer');await new Promise(resolve=>setTimeout(resolve,600));
 await page.evaluate(()=>{const node=document.querySelector('.TimelineClipContainer'),descriptor=Object.getOwnPropertyDescriptor(node,'dispatcher');let command;try{Object.defineProperty(node,'dispatcher',{configurable:true,value:{trigger(action){command=action;}}});node.onClick(new MouseEvent('click'));}finally{if(descriptor)Object.defineProperty(node,'dispatcher',descriptor);else delete node.dispatcher;}node.trigger(new command.constructor({...command.data,preferFilter:false,modify:undefined,seek:false}));});
 await page.waitForSelector('#ws-text-content',{visible:true});await new Promise(resolve=>setTimeout(resolve,700));
 let canvas,area=0;
 for(const candidate of await page.$$('canvas')){const box=await candidate.boundingBox();if(box&&box.width*box.height>area){area=box.width*box.height;canvas=candidate;}}
 assert.ok(canvas,'native preview canvas exists');
 const beforePixels=Buffer.from(await canvas.screenshot());
 const typing=page.evaluate(async()=>{
  const input=document.querySelector('#ws-text-content'),project=document.querySelector('.ProjectApp').project,clip=project.presentation.layer.flatMap(layer=>layer.clip).find(clip=>clip.load.source==='text');
  const started=performance.now(),version=project.metadata.version,result=[];input.focus();window.__latencyField=input;
  for(let index=0;index<20;index++){
   input.value='Atualização '+index;input.setSelectionRange(input.value.length,input.value.length);input.dispatchEvent(new Event('input',{bubbles:true}));
   await new Promise(resolve=>setTimeout(resolve,30));result.push({index,ms:performance.now()-started,text:clip.load.text,version:project.metadata.version});
  }
  return {version,result,focused:document.activeElement===input,sameField:document.querySelector('#ws-text-content')===input};
 });
 await new Promise(resolve=>setTimeout(resolve,180));
 const previewPixels=Buffer.from(await canvas.screenshot());
 const samples=await typing;
 assert.ok(!beforePixels.equals(previewPixels),'actual preview pixels change during typing, before saving');
 const first=samples.result.find(sample=>sample.text.startsWith('Atualização '));assert.ok(first&&first.ms<200,'preview updates during continuous typing, without waiting for a pause');
 assert.ok(samples.result.every(sample=>sample.version===samples.version),'continuous preview does not create saved history states per character');assert.ok(samples.focused&&samples.sameField);
 await page.waitForFunction(()=>document.querySelector('.ws-text-editor-status')?.textContent==='Salvo');
 const savedVersion=await page.evaluate(()=>document.querySelector('.ProjectApp').project.metadata.version);assert.equal(savedVersion,samples.version+1,'one typing burst is saved once');
 await page.$eval('#ws-text-content',input=>{input.value='Primeiro salvamento';input.dispatchEvent(new Event('input',{bubbles:true}));});await page.click('.ws-text-save');
 const overlap=await page.evaluate(async()=>{
  const input=document.querySelector('#ws-text-content'),started=performance.now();input.value='Última versão';input.dispatchEvent(new Event('input',{bubbles:true}));
  const text=()=>document.querySelector('.ProjectApp').project.presentation.layer.flatMap(layer=>layer.clip).find(clip=>clip.load.source==='text').load.text;
  while(performance.now()-started<200&&text()!==input.value)await new Promise(resolve=>setTimeout(resolve,5));
  return {ms:performance.now()-started,text:text()};
 });
 assert.equal(overlap.text,'Última versão','new preview never waits for an earlier save confirmation');assert.ok(overlap.ms<200);
 await page.waitForFunction(()=>document.querySelector('.ws-text-editor-status')?.textContent==='Salvo');
 await page.$eval('#ws-text-content',input=>{input.focus();input.value='Edição para desfazer';input.dispatchEvent(new Event('input',{bubbles:true}));});await new Promise(resolve=>setTimeout(resolve,60));await page.click('[data-ws-history-action=undo]');
 await page.waitForFunction(()=>document.querySelector('.ProjectApp')?.project?.presentation.layer.flatMap(layer=>layer.clip).find(clip=>clip.load.source==='text')?.load.text==='Última versão');
 console.log('PASS',JSON.stringify({version,firstPreviewMs:Math.round(first.ms),previewDuringSaveMs:Math.round(overlap.ms),renderedPreviewDuringTyping:true,oneSavePerBurst:true,focusPreserved:true,immediateUndo:true}));
}catch(error){if(page)console.log('DEBUG',await page.evaluate(()=>({text:document.querySelector('.ProjectApp')?.project?.presentation.layer.flatMap(layer=>layer.clip).find(clip=>clip.load.source==='text')?.load.text,status:document.querySelector('.ws-text-editor-status')?.textContent,history:document.querySelector('.ws-history-status')?.textContent})));throw error;}finally{await browser.close();}
