import {beforeHistory,settlePendingEdits} from '../src/core/historyBarrier';
import assert from 'node:assert/strict';
import {validateTextTarget} from '../src/features/inspector/textEditor';
import {updateNativeText,createNativeTextWriter} from '../src/integrations/wide/legacy/textEdit';
const clip:any={load:{kind:'load',source:'text',text:'1999',setup:{fontSize:64,strokeWidth:3},trim:{duration:4},cache:{stale:true}}};
const layer:any={clip:[clip]},project:any={metadata:{appVersion:'1.7.12'},presentation:{layer:[layer]}};
const root:any={project};
validateTextTarget(root,project,clip,'1999');
assert.throws(()=>validateTextTarget({project:{}} as any,project,clip,'1999'),/projeto mudou/);
assert.throws(()=>validateTextTarget(root,project,clip,'old'),/texto mudou/);
layer.locked=true;assert.throws(()=>validateTextTarget(root,project,clip,'1999'),/Desbloqueie/);delete layer.locked;
let calls=0;
class Update{constructor(public data:any){}}
const trigger=(command:any)=>{calls++;assert.deepEqual(command.data.data.load,{kind:'load',source:'text',text:'Novo',setup:clip.load.setup,trim:clip.load.trim});};
const form:any={project,clip,triggerGlobal:trigger,submit(){this.triggerGlobal(new Update({project,clip,data:{name:'unchanged'},flush:'save'}));}};
updateNativeText(form,project,clip,'Novo');assert.equal(calls,1);assert.equal(form.triggerGlobal,trigger);assert.equal(clip.load.text,'1999','helper delegates mutations to native commands');
form.submit=()=>{throw Error('failed');};assert.throws(()=>updateNativeText(form,project,clip,'Novo'));assert.equal(form.triggerGlobal,trigger);
console.log('Inspector text: project/text conflict guards, locked layers, native command capture, preserved style/timing, cache invalidation and cleanup passed.');

const commands:any[]=[];let captures=0;
const cachedForm:any={project,clip,triggerGlobal:(command:any)=>commands.push(command),submit(){captures++;this.triggerGlobal(new Update({project,clip,data:{},flush:'save'}));}};
const writer=createNativeTextWriter(cachedForm,project,clip);
writer('A','fast');writer('B','fast');clip.load.setup={fontSize:90};writer('B','save');
assert.equal(captures,1,'native command discovery is cached for the editing session');
assert.deepEqual(commands.map(command=>command.data.flush),['fast','fast','save']);
assert.equal(commands[2].data.data.load.setup.fontSize,90,'new previews preserve the latest native formatting');
console.log('Fast text writer: cached native command, preview-only flush, final save and current formatting passed.');

let release!:()=>void,settled=false,barrierCalls=0;
const wait=new Promise<void>(resolve=>release=resolve);
const unsubscribe=beforeHistory(async owner=>{assert.equal(owner,project);barrierCalls++;await wait;});
const completion=settlePendingEdits(project).then(()=>settled=true);
await Promise.resolve();assert.equal(settled,false,'history waits for the pending save before selecting its target');
release();await completion;assert.equal(settled,true);unsubscribe();await settlePendingEdits(project);assert.equal(barrierCalls,1);
console.log('History input barrier: waits for pending saves and unregisters cleanly.');

// Native filter updates must invalidate the renderer, not just change clip data.
const nativeActions:any[]=[];
class FilterUpdate{constructor(public data:any){}}
class FilterView{submitData(this:any,newData:any,kind:string){this.trigger(new FilterUpdate({...this.init,newData,flush:this.submitKindToFlush(kind)}));}}
const fakeWindow={customElements:{get:(name:string)=>name==='wv-0'?FilterView:undefined}};
const filterForm:any={project,clip,ownerDocument:{defaultView:fakeWindow},submit(){throw Error('clip replacement should not be used');},triggerGlobal:(action:any)=>nativeActions.push(action)};
const nativeWriter=createNativeTextWriter(filterForm,project,clip);nativeWriter('Rendered text','fast');
assert.equal(nativeActions.length,1);assert.equal(nativeActions[0].data.filter,clip.load);
const expectedLoad={...clip.load,text:'Rendered text'};delete expectedLoad.cache;assert.deepEqual(nativeActions[0].data.newData,expectedLoad);
assert.equal(nativeActions[0].data.newData.source,'text');assert.equal(nativeActions[0].data.flush,'fast');
console.log('Text rendering: native filter command, complete load data, formatting preservation and renderer invalidation passed.');

let disposed=false,executed=0;
const legacyWindow={customElements:{get:()=>undefined},MouseEvent:class{}};
const legacyExplorer={createButton(this:any,probe:any){
 const owner=this;
 const node:any={createContextMenu(){
  const d={trigger:(action:any)=>node.dispatcher.trigger(action)},a={action:new FilterUpdate({project:owner.project,clip:owner.clip,filter:probe,newData:{disabled:true},flush:'save'})};
  return {itemProvider:()=>[{className:' disable ',callback:()=>d.trigger(a.action)}],dispose:()=>{disposed=true;}};
 }};return node;
}};
const legacyForm:any={project,clip,ownerDocument:{defaultView:legacyWindow},closest:()=>legacyExplorer,submit(){throw Error('no clip replacement');},triggerGlobal:(action:any)=>{executed++;assert.equal(action.data.filter,clip.load);assert.equal(action.data.newData.text,'Legacy text');}};
const legacyWriter=createNativeTextWriter(legacyForm,project,clip);
assert.equal(executed,0,'discovering the command never submits the disable action');assert.ok(disposed);
legacyWriter('Legacy text','fast');assert.equal(executed,1);
console.log('Legacy text rendering: detached native command discovery, no selection changes and menu cleanup passed.');
