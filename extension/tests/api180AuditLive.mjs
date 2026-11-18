import {puppeteer} from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('../.local/audit-1.8.0',{recursive:true});
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe'),headless:true,pipe:true,defaultViewport:{width:1440,height:1000},args:['--no-first-run']});
const results={url:'https://wide.video/app/1.8.0/',checks:[]};let page;
try{
 page=await browser.newPage();await page.goto(results.url);await page.waitForSelector('.Intro button.openProjectOPFS');await page.click('.Intro button.openProjectOPFS');await page.waitForFunction(()=>typeof window.api?.run==='function');
 const run=async(name,input)=>{const result=await page.evaluate(async({name,input})=>{const start=performance.now(),value=await api.run(name,input);return {value,ms:performance.now()-start};},{name,input});results.checks.push({name,ms:Math.round(result.ms*100)/100});return result.value;};
 const help=await run('operation-help');writeFileSync('../.local/audit-1.8.0/runtime-help.txt',help);
 const operations=await run('operation-help-operation-get-list');results.operations=operations.map(o=>o.name);assert.equal(operations.length,51);
 const schemas=await run('operation-help-schema-get-list');results.schemaCount=schemas.length;
 const original=await run('operation-project-get');results.initial={keys:Object.keys(original),layers:original.presentation.layer.length,metadata:original.metadata};
 const scene=await run('operation-scene-get');await run('operation-scene-update',{...scene,canvas:{...scene.canvas,width:320,height:180},duration:2,smartDuration:false});
 const layer=await run('operation-layer-add',{name:'API audit'});
 const text=await run('operation-clip-add',{layerId:layer.ID,data:{name:'API text A',load:{kind:'load',source:'text',text:'Wide Studio API'}}});results.createdText={ID:text.ID,timing:text.timing};
 await run('operation-clip-update',{clipId:text.ID,update:{name:'API text renamed'}});
 try{const filter=await run('operation-filter-add',{clipId:text.ID,data:{kind:'delay',time:.25}});results.filter={ok:true,ID:filter.ID};await run('operation-filter-update',{filterId:filter.ID,update:{kind:'delay',time:.5}});}catch(error){results.filter={ok:false,error:String(error)};}
 const afterMove=await run('operation-clip-get',text.ID);results.movedTiming=afterMove.timing;
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#315dcc"/></svg>';
 const media=await run('operation-media-fetch',{filename:'api-audit.svg',url:'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')});results.importedMedia={ID:media.ID,keys:Object.keys(media)};
 const image=await run('operation-clip-add',{layerId:layer.ID,data:{name:'API image',load:{kind:'load',source:'media',media:{ID:media.ID}}}});
 await run('operation-clip-select-multiple',[text.ID,image.ID]);
 await run('operation-project-activity-seek',.5);const activity=await run('operation-project-activity-get');assert.equal(activity.currentTime,.5);
 await run('operation-project-activity-seek-nextframe');results.nextFrame=await run('operation-project-activity-get');
 const sample=await run('operation-export-frame',{time:.5,mimeType:'image/png'});results.frame=await page.evaluate(result=>{const blob=api.resolveBlob(result.ID);return {descriptor:result,blob:blob instanceof Blob,size:blob.size,type:blob.type};},sample);assert.ok(results.frame.size>0);
 await page.evaluate(()=>window.__apiAuditProject=document.querySelector('.ProjectApp').project);
 await run('operation-clip-update',{clipId:text.ID,update:{name:'Undo probe'}});
 try{await run('operation-project-history-undo');const restored=await run('operation-project-get');results.undo={ok:restored.presentation.layer.flatMap(l=>l.clip).some(c=>c.name==='API text renamed'),rebuilt:await page.evaluate(()=>window.__apiAuditProject!==document.querySelector('.ProjectApp').project),ids:restored.presentation.layer.flatMap(l=>l.clip).map(c=>({name:c.name,ID:c.ID}))};await run('operation-project-history-redo');const redone=await run('operation-project-get');results.redo=redone.presentation.layer.flatMap(l=>l.clip).some(c=>c.name==='Undo probe');}catch(error){results.undo={error:String(error)};}
 const fresh=await run('operation-project-get');const names=fresh.presentation.layer.flatMap(l=>l.clip).map(c=>c.name);assert.ok(names.includes('Undo probe'));
 results.concurrent=await page.evaluate(async()=>{const start=performance.now();const values=await Promise.allSettled([api.run('operation-export',{range:{start:0,end:.5},frameRate:10,virtualOutput:true}),api.run('operation-project-activity-get')]);return {ms:Math.round(performance.now()-start),results:values.map(v=>v.status==='fulfilled'?{status:v.status,value:v.value}:{status:v.status,error:String(v.reason)})};});
 const exported=results.concurrent.results[0];if(exported.status==='fulfilled'){results.export=await page.evaluate(descriptor=>{const blob=api.resolveBlob(descriptor.ID);return {size:blob.size,type:blob.type,isBlob:blob instanceof Blob};},exported.value);assert.ok(results.export.size>0);}
 const sizes=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/studio\.js|api\.js/.test(r.name)).map(r=>({url:r.name,bytes:r.decodedBodySize,transfer:r.transferSize})));results.resources=sizes;
 await page.screenshot({path:'../.local/audit-1.8.0/api-live.png'});console.log(JSON.stringify(results,null,2));
}catch(error){results.error=String(error);if(page)results.dialogs=await page.evaluate(()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.textContent.slice(0,900)));throw error;}finally{writeFileSync('../.local/audit-1.8.0/runtime-results.json',JSON.stringify(results,null,2));await browser.close();}
