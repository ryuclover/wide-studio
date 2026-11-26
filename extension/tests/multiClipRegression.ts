import assert from 'node:assert/strict';
import {readClipActions,triggerClipAction} from '../src/integrations/wide/legacy/clipActions';
import {canSplitAt,unlocked} from '../src/features/timeline/multiClipActions';

const a={},b={},selection={kind:'clips',value:new Set([a,b])};
const project:any={metadata:{appVersion:'1.8.0'},selection,presentation:{layer:[{clip:[a,b]}]}};
let dispatched=0;
class Command{data:any;name='SplitClip';constructor(data:any){this.data=data;}}
const dispatcher={trigger(command:any){dispatched++;assert.equal(command.data.project,project);}};
const init={project,clip:a},node:any={init,dispatcher,contextMenu:{}};
const provider=()=>{
 assert.equal(node.init.project.selection.kind,'clip');
 const target=node.dispatcher,item={action:new Command({project:node.init.project,clip:a,shiftTweens:true})};
 return [{label:'Split',callback:()=>target.trigger(item.action)},{label:'Not a native command',callback:()=>{throw Error('must not run');}}];
};
const [item]=readClipActions(node,provider,{} as MouseEvent);
assert.equal(dispatched,0,'reading a menu cannot execute native operations');
assert.equal(node.init,init);assert.equal(node.dispatcher,dispatcher);assert.equal(project.selection,selection);
assert.equal(item.action.data.project,project,'captured commands use the real project, never its read-only view');
triggerClipAction(node,item.action);assert.equal(dispatched,1);
assert.throws(()=>readClipActions(node,()=>{throw Error('provider failed');},{} as MouseEvent));
assert.equal(node.init,init);assert.equal(node.dispatcher,dispatcher);assert.equal(project.selection,selection);
const timing={presentation:{start:2,end:8},mediaToPresentation:()=>0};
assert.ok(canSplitAt(timing,5));assert.ok(!canSplitAt(timing,2));assert.ok(!canSplitAt(timing,8));assert.ok(!canSplitAt({...timing,mediaToPresentation:null},5));
assert.ok(unlocked(project,a));project.presentation.layer[0].locked=true;assert.ok(!unlocked(project,a));
console.log('Batch clip actions: read-only menu capture, native dispatch, exception cleanup, timing boundaries and locked layers passed.');
