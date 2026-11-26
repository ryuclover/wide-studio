import {invalidateEditor} from '../../core/editorActivity';
import {withHistoryBatch} from '../../core/historyBatch';
import {translateUiText,validLanguage} from '../../i18n/common';
import {flattenClipActions,readClipActions,triggerClipAction,waitForNativeSave,type ClipAction} from '../../integrations/wide/legacy/clipActions';

type Context={root:HTMLElement;project:any;selection:Set<any>;targets:Set<any>;provider:(node:any)=>any;announce:(text:string)=>void;changed:(results:ClipResult[],kind:'split'|'duplicate',time:number)=>void};
export type ClipResult={clip:any;left?:any;right?:any;duplicate?:any};
let busy=false;
const clips=(project:any):any[]=>project.presentation.layer.flatMap((layer:any)=>layer.clip);
const selected=(project:any)=>project.selection?.kind==='clips'?new Set(project.selection.value):new Set([project.selection?.value]);
const same=(a:Set<any>,b:Set<any>)=>a.size===b.size&&[...a].every(clip=>b.has(clip));
const nodeFor=(context:Context,clip:any):any=>[...context.root.querySelectorAll('.TimelineClipContainer')].find((node:any)=>node.init?.clip===clip);
export const unlocked=(project:any,clip:any)=>!clip.locked&&!project.presentation.layer.find((layer:any)=>layer.clip.includes(clip))?.locked;
export function canSplitAt(timing:any,time:number){const t=timing?.presentation;return !!timing?.mediaToPresentation&&Number.isFinite(time)&&t&&time>t.start+1e-6&&time<t.end-1e-6;}
function valid(context:Context){return !busy&&(context.root as any).project===context.project&&same(selected(context.project),context.selection)&&[...context.targets].every(clip=>clips(context.project).includes(clip)&&unlocked(context.project,clip));}
function native(context:Context,clip:any,event:MouseEvent){const node=nodeFor(context,clip);return node?readClipActions(node,context.provider(node),event):[];}
function action(template:ClipAction|undefined){return template?.action;}
function label(context:Context,text:string){const language=context.root.ownerDocument.documentElement.dataset.wsLanguage;return translateUiText(text,validLanguage(language)?language:'original');}
async function completed(command:any){
 if(!command?.promise)throw Error('O comando nativo não confirmou a operação.');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{const result:any=await Promise.race([command.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('O editor demorou a confirmar a operação.')),15000);})]);
  if(result?.kind!=='complete')throw Error(String(result?.error||'O editor não concluiu a operação.'));
 }finally{clearTimeout(timer);}
}

async function run(context:Context,kind:'split'|'duplicate',variant:string|undefined,event:MouseEvent){
 if(!valid(context)){context.announce('A seleção mudou ou há clipes bloqueados. Abra o menu novamente.');return;}
 const time=context.project.activity?.time;
 const plans=[...context.targets].map(clip=>{
  const node=nodeFor(context,clip),items=flattenClipActions(native(context,clip,event));
  const template=items.find(item=>kind==='duplicate'?item.action?.name==='DuplicateClip':
   item.action?.data.clip===clip&&item.action?.data.shiftTweens===true&&item.action?.data.deleteClip===variant);
  return {clip,node,template:action(template),timing:node?.timing};
 }).filter(plan=>kind!=='split'||canSplitAt(plan.timing,time));
 if(!plans.length||plans.some(plan=>!plan.node||!plan.template)){context.announce('Nenhum clipe pode ser dividido nesta posição, ou o comando não está disponível.');return;}
 busy=true;invalidateEditor(context.root.ownerDocument);
 try{
  const results:ClipResult[]=[];
  await withHistoryBatch(context.project,async()=>{
   for(const plan of plans){
    if((context.root as any).project!==context.project||context.project.activity?.time!==time)throw Error('O projeto ou a posição de reprodução mudou durante a edição.');
    const before=new Set(clips(context.project));
    await completed(triggerClipAction(plan.node,plan.template!,{project:context.project,clip:plan.clip}));
    const added=clips(context.project).filter(clip=>!before.has(clip));
    if(kind==='duplicate'){
     if(added.length!==1)throw Error('Duplicação não confirmada. Confira a timeline antes de repetir.');
     results.push({clip:plan.clip,duplicate:added[0]});
    }else{
     if(!variant&&added.length!==1)throw Error('Divisão não confirmada. Confira a timeline antes de repetir.');
     results.push({clip:plan.clip,left:variant==='left'?undefined:plan.clip,right:variant==='right'?undefined:variant==='left'?plan.clip:added[0]});
    }
   }
   await waitForNativeSave(context.root,context.project);
   context.changed(results,kind,time);
   const resultClips=kind==='duplicate'?results.map(result=>result.duplicate):results.flatMap(result=>[result.left,result.right]);
   selectClips(context,new Set(resultClips.filter(Boolean)));
  });
  context.announce(kind==='split'?`${plans.length} clipes divididos na posição de reprodução.`:`${plans.length} clipes duplicados.`);
 }catch(error){context.announce(String(error).replace(/^Error: /,'')+' Use Desfazer para restaurar a operação.');}
 finally{busy=false;invalidateEditor(context.root.ownerDocument);}
}

function selectClips(context:Context,selection:Set<any>){
 const panel=context.root.querySelector('.MediaPanel') as any;
 panel.onMediaListSelectMedia(undefined,false);
 for(const clip of selection)nodeFor(context,clip)?.onClick(new MouseEvent('click',{ctrlKey:true,metaKey:true,cancelable:true}));
}

async function prepareFilterSelector(context:Context,command:any){
 void command.promise?.then((result:any)=>{if(result.kind==='fail')context.announce('Não foi possível abrir os filtros.');});
 const doc=context.root.ownerDocument,end=Date.now()+3000;let selector:any;
 while(Date.now()<end){selector=[...doc.querySelectorAll('.FilterSelector')].find((node:any)=>node.init?.project===context.project);if(selector)break;await new Promise(resolve=>setTimeout(resolve,30));}
 if(!selector||selector.dataset.wsBatchFilters)return;
 selector.dataset.wsBatchFilters='';
 const getOptions=selector.getOptions,trigger=selector.trigger;
 // Wide hides its raw-filter tab for multiple clips. Reuse its own filter
 // catalogue for one representative; route the resulting command to the set.
 selector.getOptions=function(...args:any[]){
  if(this.data.kind!=='filter')return getOptions.apply(this,args);
  const original=this.init;this.init={...original,clips:new Set([[...context.targets][0]])};
  try{return getOptions.apply(this,args);}finally{this.init=original;}
 };
 const bar=selector.querySelector('.bar');
 if(bar&&!bar.querySelector('button.filter')){
  const button=doc.createElement('button');button.type='button';button.className='filter';button.textContent=label(context,'Filters');
  button.onclick=()=>selector.scheduleUpdate({kind:'filter'});bar.prepend(button);
 }
 selector.trigger=function(action:any){
  if(action.data?.project!==context.project||!['AddEffect','AddFilter'].includes(action.name))return trigger.call(this,action);
  if(!valid(context)){context.announce('A seleção mudou ou há clipes bloqueados. Abra o menu novamente.');action.cancel?.();return;}
  busy=true;invalidateEditor(doc);
  void withHistoryBatch(context.project,async()=>{
   if(action.name==='AddFilter'){
    for(const clip of context.targets){
     if((context.root as any).project!==context.project||!unlocked(context.project,clip))throw Error('O projeto ou o bloqueio dos clipes mudou.');
     const filter=structuredClone(action.data.filter);
     await completed(triggerClipAction(nodeFor(context,clip),{Constructor:action.constructor,data:action.data},{project:context.project,clip,filter,select:false}));
    }
    action.complete?.();
   }else{
    action.data.clips=new Set(context.targets);nodeFor(context,[...context.targets][0]).dispatcher.trigger(action);await completed(action);
   }
   await waitForNativeSave(context.root,context.project);
   context.changed([],'split',context.project.activity?.time);
   selectClips(context,context.targets);
   context.announce(`Filtro aplicado a ${context.targets.size} clipes.`);
  }).catch(error=>{action.fail?.(error);context.announce(String(error).replace(/^Error: /,'')+' Use Desfazer para restaurar a operação.');}).finally(()=>{busy=false;invalidateEditor(doc);});
 };
}

export function extendMultiClipMenu(items:any[],context:Context,event:MouseEvent){
 const first=[...context.targets][0],source=native(context,first,event);
 if(!source.length)return items;
 const flat=flattenClipActions(source);
 const split=flat.some(item=>item.action?.data.shiftTweens===true);
 // Command names are captured once; do not construct commands just to classify a menu.
 const duplicateTemplate=flat.find(item=>item.action?.name==='DuplicateClip');
 const filter=flat.find(item=>item.action?.data.kind==='filterSelector');
 const canEdit=valid(context),canCut=canEdit&&[...context.targets].some(clip=>canSplitAt(nodeFor(context,clip)?.timing,context.project.activity?.time));
 const additions:any[]=[];
 if(split)additions.push({label:label(context,'Dividir clipes'),className:`ws-batch-split${canCut?'':' disabled'}`,children:canCut?[
  ['Na posição de reprodução',undefined],['Dividir e excluir parte esquerda','left'],['Dividir e excluir parte direita','right']
 ].map(([text,variant])=>({label:label(context,text!),className:'ws-batch-split-'+(variant||'both'),callback:()=>void run(context,'split',variant,event)})):undefined});
 if(duplicateTemplate)additions.push({label:label(context,'Duplicar clipes'),className:`ws-batch-duplicate${canEdit?'':' disabled'}`,callback:canEdit?()=>void run(context,'duplicate',undefined,event):undefined});
 const invoke=(template:ClipAction,clip?:any)=>()=>{
  if(!valid(context)){context.announce('A seleção mudou. Abra o menu novamente.');return;}
  const node=nodeFor(context,clip||first);if(node&&template.action){const command=triggerClipAction(node,template.action,template.action.data.kind==='filterSelector'?{clips:new Set(context.targets)}:{});if(template.action.data.kind==='filterSelector')void prepareFilterSelector(context,command).catch(error=>context.announce(String(error).replace(/^Error: /,'')));}
 };
 let result=[...items];
 if(filter){
  const index=result.findIndex(item=>typeof item?.label==='string'&&/^(Add Filters & Effects|Adicionar filtros e efeitos)$/i.test(translateUiText(item.label,'en')));
  const replacement={label:filter.label,className:`ws-batch-filters${canEdit?'':' disabled'}`,callback:canEdit?invoke(filter):undefined};
  if(index>=0)result[index]=replacement;else additions.push(replacement);
 }
 const perClip=[...context.targets].map((clip,index)=>{
  const convert=(entries:ClipAction[]):any[]=>entries.map(item=>({label:item.label,className:[item.className,item.action&&!canEdit?'disabled':''].filter(Boolean).join(' '),children:item.children?convert(item.children):undefined,callback:item.action&&canEdit?()=>{
   if(!valid(context)){context.announce('A seleção mudou. Abra o menu novamente.');return;}
   triggerClipAction(nodeFor(context,clip),item.action);
  }:undefined}));
  const name=String(clip.name||clip.load?.text||clip.load?.media?.original?.file?.name||`Clipe ${index+1}`).replace(/\s+/g,' ');
  return {label:name.length>80?name.slice(0,77)+'…':name,className:'ws-batch-clip-name',children:convert(native(context,clip,event))};
 });
 additions.push({label:label(context,'Ações por clipe'),className:'ws-batch-per-clip',children:perClip});
 const before=result.findIndex(item=>typeof item?.label==='string'&&/^(Add Filters & Effects|Adicionar filtros e efeitos)$/i.test(translateUiText(item.label,'en')));
 result.splice(before>=0?before:0,0,...additions);
 return result;
}

export function splitSelection(context:Context,event:MouseEvent){return run(context,'split',undefined,event);}
export function splitState(context:Context){return busy?'disabled':valid(context)&&[...context.targets].some(clip=>canSplitAt(nodeFor(context,clip)?.timing,context.project.activity?.time))?'ready':'disabled';}
