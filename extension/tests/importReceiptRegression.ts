import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {NativeMediaReceipts} from '../src/bridge/mediaReceipt';
const win=new Window({url:'https://wide.video/app/1.7.12/'});
for(const key of ['window','document','File','DataTransfer'])Object.defineProperty(globalThis,key,{value:key==='window'?win:(win as any)[key],configurable:true});
Object.defineProperty(globalThis,'DragEvent',{value:class extends win.Event {dataTransfer:any;constructor(type:string,init:any){super(type,init);this.dataTransfer=init.dataTransfer;}},configurable:true});
const {extractionTransfer}=await import('../src/content/importMedia');
const native=new NativeMediaReceipts();let project:any={mediaList:[]},drops=0,invalid=false;
const bridge={importReceipt:async(payload:unknown)=>native.handle(project,payload)};
win.document.body.innerHTML='<div id="ProjectApp"><div class="MediaListView"><input value="unmatched filter"></div></div>';
win.document.querySelector('.MediaListView')!.addEventListener('drop',(e:any)=>{
 drops++;const file=e.dataTransfer.files[0],media={original:{file},content:{kind:'probing'}};project.mediaList.push(media);
 setTimeout(()=>{media.content=invalid?{kind:'invalid',reason:'Unsupported codec'} as any:{kind:'valid'};},800);
});
const bytes=new Uint8Array(120);bytes.set([102,116,121,112],4);const base64=btoa(String.fromCharCode(...bytes));
const send=(id:string,type:string,extra:any={})=>extractionTransfer({type,transferId:id,expectedProjectId:'p',...extra},'p',bridge);
const upload=async(id:string)=>{await send(id,'EXTRACT_IMPORT_BEGIN',{name:'same.mp4'});await send(id,'EXTRACT_IMPORT_CHUNK',{index:0,base64});return send(id,'EXTRACT_IMPORT_FINISH',{bytes:120});};
const poll=async(id:string)=>{for(let i=0;i<30;i++){const status=await send(id,'EXTRACT_IMPORT_STATUS') as any;if(status.phase!=='processing')return status;await new Promise(r=>setTimeout(r,100));}throw new Error('status timeout');};
try{
 // Existing same-name media plus an active Library filter must not cause a false timeout.
 project.mediaList.push({original:{file:new win.File([bytes],'same.mp4')},content:{kind:'valid'}});
 const id=crypto.randomUUID();assert.equal((await upload(id) as any).phase,'processing','FINISH acknowledges before native probing completes');
 const receipt=await poll(id);assert.equal(receipt.phase,'done');assert.equal(receipt.result.name,'same (2).mp4');assert.equal(drops,1);assert.equal(win.document.querySelectorAll('.MediaView').length,0,'confirmation independent of rendered rows');
 assert.equal((await send(id,'EXTRACT_IMPORT_FINISH',{bytes:120}) as any).phase,'done');assert.equal(drops,1,'lost FINISH reply cannot duplicate native drop');
 invalid=true;const bad=crypto.randomUUID();await upload(bad);const rejected=await poll(bad);assert.equal(rejected.phase,'error');assert.match(rejected.error,/Unsupported codec/,'native rejection is not reported as success');invalid=false;
 const token=crypto.randomUUID();native.handle(project,{mode:'begin',token,name:'guard.mp4',bytes:120});assert.throws(()=>native.handle({mediaList:[]},{mode:'status',token}),/projeto mudou/);
 const changed=crypto.randomUUID();await upload(changed);await new Promise(r=>setTimeout(r,100));project={mediaList:[]};assert.match((await poll(changed)).error,/projeto mudou/);
 const modal=win.document.createElement('dialog');modal.setAttribute('open','');win.document.body.append(modal);const blocked=crypto.randomUUID();const before=drops;await upload(blocked);assert.match((await poll(blocked)).error,/Feche a janela/);assert.equal(drops,before);modal.remove();
 console.log('Native import receipts: filtered Library, existing filename, asynchronous probing, idempotent finish, invalid codec, project change, and open-modal guard passed.');
}finally{await win.happyDOM.close();}
