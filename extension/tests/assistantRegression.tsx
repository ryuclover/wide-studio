import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
const win=new Window({url:'chrome-extension://fixture/assistant.html?editorTabId=12'});
for(const key of ['window','document','Event','HTMLElement','Node'])Object.defineProperty(globalThis,key,{value:key==='window'?win:(win as any)[key],configurable:true});
let applies=0, project='one', unsupported=false, unknown=false;
const ctx=()=>({project:{id:project,name:'Fixture'},revision:'r1',composition:{currentPlayheadFrame:0},clips:[],selectedClipIds:[],capabilities:['seek']});
const messages:any[]=[];
Object.defineProperty(globalThis,'chrome',{value:{runtime:{sendMessage:async(m:any)=>{
  messages.push(m); assert.equal(m.editorTabId,12);
  if(m.type==='SW_GET_CONTEXT')return {success:true,data:ctx()};
  if(m.type==='SW_GET_SNAPSHOT')return {success:true,data:{tracks:[]}};
  if(m.type==='SW_GET_SETTINGS')return {success:true,data:{provider:'mock'}};
  if(m.type==='SW_PROCESS_PROMPT'){
    assert.equal(m.expectedProjectId,project);
    return {success:true,data:unsupported?{type:'unsupported',message:'Silêncio indisponível'}:{type:'plan',plan:{summary:'Ir para 10s',planId:'plan'},preparedPlan:{operations:[{command:'seek',args:{frame:300}}]}}};
  }
  if(m.type==='SW_APPLY_PLAN'){applies++;return {success:true,data:[{status:unknown?'unknown':'verified'}]};}
  throw new Error(m.type);
}}},configurable:true});
const {render,h,options}=await import('preact'); options.requestAnimationFrame=cb=>setTimeout(cb,0) as any;
const {AssistantPanel}=await import('../src/ui/AssistantPanel');
win.document.body.innerHTML='<div id="app"></div>';
const root=win.document.getElementById('app')!;
const pause=()=>new Promise(r=>setTimeout(r,60));
const button=(text:string)=>{const el=[...win.document.querySelectorAll('button')].find(e=>e.textContent===text);assert.ok(el,text);return el;};
render(h(AssistantPanel,{}),root as any);await pause();
const send=async(text:string)=>{const input=win.document.querySelector('textarea')!;input.value=text;input.dispatchEvent(new win.Event('input',{bubbles:true}));await pause();win.document.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause();};
assert.ok(win.document.body.textContent.includes('Modo local · sem IA'));
await send('Vá para o segundo 10');assert.equal(applies,0,'planning never applies automatically');
button('Aplicar no editor').click();await pause();assert.equal(applies,1);assert.ok(win.document.body.textContent.includes('Ação aplicada e confirmada'));
unsupported=true;await send('Corte silêncio');assert.ok(win.document.body.textContent.includes('Silêncio indisponível'));assert.equal(applies,1);
unsupported=false;unknown=true;await send('Vá para o segundo 10');button('Aplicar no editor').click();await pause();assert.ok(win.document.querySelector('[role="alert"]')?.textContent.includes('Resultado não confirmado'));
project='two';button('Atualizar contexto').click();await pause();assert.equal(win.document.querySelectorAll('article').length,0,'project switch clears conversation and plans');
assert.ok(messages.every(m=>m.editorTabId===12));
render(null,root as any);
const {MockProvider}=await import('../src/providers/mockProvider');
for(const request of ['corta os momentos que não tem audio','adiciona imagens no segundo 10']){
  const answer=await new MockProvider().generatePlan(request,ctx() as any);
  assert.equal(answer.type,'unsupported','unsupported media requests must never become a seek');
}
await win.happyDOM.close();console.log('Assistant regression passed: bound tab, explicit apply, unsupported actions, unknown results and project isolation.');
