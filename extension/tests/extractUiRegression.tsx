import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const win=new Window({url:'https://example.test/extract.html?editorTabId=1'});
for(const key of ['window','document','location','HTMLElement','Event','Node'])Object.defineProperty(globalThis,key,{value:key==='window'?win:(win as any)[key],configurable:true});
let starts=0,imports=0;const calls:any[]=[];
Object.defineProperty(globalThis,'chrome',{configurable:true,value:{permissions:{request:async()=>true},runtime:{sendMessage:async(m:any)=>{
 calls.push(m);assert.equal(m.editorTabId,1);
 if(m.type==='SW_WEB_STATUS')return {success:true,data:null};
 if(m.type==='SW_WEB_IMPORT'){starts++;imports++;assert.ok(!('saveDrive' in m));assert.match(m.requestId,/^[a-f0-9-]{36}$/);await new Promise(r=>setTimeout(r,30));return {success:true,data:{id:m.requestId,url:m.url,phase:'done',result:{imported:true,name:'teste.mp4'}}};}
 throw new Error(m.type);
}}}});
const {render,h,options}=await import('preact');options.requestAnimationFrame=f=>setTimeout(f,0) as any;
const {Extract}=await import('../src/ui/Extract');win.document.body.innerHTML='<div id="app"></div>';render(h(Extract,{}),win.document.querySelector('#app')!);
const pause=()=>new Promise(r=>setTimeout(r,100));await pause();
assert.equal(calls.length,1,'opening tab only checks resumable job status');assert.equal(calls[0].type,'SW_WEB_STATUS');
assert.equal(win.document.querySelectorAll('input').length,1,'only link input');assert.equal(win.document.querySelectorAll('button').length,1,'only import button');assert.equal(win.document.querySelectorAll('select,details,input[type=password],input[type=checkbox]').length,0,'no Drive, range, quality or pairing controls');
const input=win.document.querySelector<HTMLInputElement>('#extract-link')!;
input.value='https://127.0.0.1/file.mp4';input.dispatchEvent(new win.Event('input',{bubbles:true}));await pause();win.document.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause();assert.equal(starts,0,'unsupported URL never reaches worker');
input.value='https://x.com/i/status/1790637656616943991';input.dispatchEvent(new win.Event('input',{bubbles:true}));await pause();
win.document.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));win.document.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause();
assert.equal(starts,1,'one click starts extraction, duplicate submit is locked');assert.equal(imports,1,'automatically imports without second confirmation');assert.ok(win.document.body.textContent.includes('teste.mp4 adicionado à Biblioteca.'));
input.value='https://youtube.com/shorts/jNQXAC9IVRw';input.dispatchEvent(new win.Event('input',{bubbles:true}));await pause();
win.document.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause();
assert.equal(imports,2,'YouTube follows the same single-action flow');assert.equal(calls.at(-1).url,'https://www.youtube.com/watch?v=jNQXAC9IVRw');
render(null,win.document.querySelector('#app')!);await win.happyDOM.close();console.log('Simple extraction UI passed: one URL, one action, automatic import, no Drive/pairing controls, validation and duplicate lock.');
