import {supportsEditor} from '../compatibility';

export type ClipAction={label:string;className?:string;action?:any;children?:ClipAction[]};

/** Ask the native provider for one clip's commands without changing selection.
 * The temporary facade shadows component fields only; the project is read-only.
 * Only the known native command callback shape is intercepted; arbitrary UI
 * callbacks (fullscreen, About, etc.) are never invoked.
 */
export function readClipActions(node:any,provider:any,event:MouseEvent):ClipAction[]{
 const project=node.init?.project;
 if(!supportsEditor(project?.metadata?.appVersion)||!node.dispatcher?.trigger||typeof provider!=='function')return [];
 const initDescriptor=Object.getOwnPropertyDescriptor(node,'init');
 const dispatcherDescriptor=Object.getOwnPropertyDescriptor(node,'dispatcher');
 const view=new Proxy(project,{get(target,key){return key==='selection'?{kind:'clip',value:node.init.clip}:Reflect.get(target,key);}});
 let captured:any;
 try{
  Object.defineProperty(node,'init',{configurable:true,writable:true,value:{...node.init,project:view}});
  Object.defineProperty(node,'dispatcher',{configurable:true,writable:true,value:{trigger(action:any){captured=action;}}});
  const convert=(items:any[]):ClipAction[]=>items.filter(item=>item&&item!=='hr').map(item=>{
   const result:ClipAction={label:item.label,className:item.className};
   if(item.children)result.children=convert(item.children);
   else if(typeof item.callback==='function'&&/^\(\)\s*=>\s*[$\w]+\.trigger\([$\w]+\.action\)$/.test(Function.prototype.toString.call(item.callback))){
    captured=undefined;item.callback();
    if(captured?.data){result.action={Constructor:captured.constructor,name:captured.name,data:{...captured.data,project}};}
   }
   return result;
  });
  const prune=(items:ClipAction[]):ClipAction[]=>items.flatMap(item=>{if(item.children)item.children=prune(item.children);return item.action||item.children?.length?[item]:[];});
  return prune(convert(provider.call(node.contextMenu,event)));
 }finally{
  if(initDescriptor)Object.defineProperty(node,'init',initDescriptor);else delete node.init;
  if(dispatcherDescriptor)Object.defineProperty(node,'dispatcher',dispatcherDescriptor);else delete node.dispatcher;
 }
}

export function flattenClipActions(items:ClipAction[]):ClipAction[]{return items.flatMap(item=>[item,...flattenClipActions(item.children||[])]);}
export function triggerClipAction(node:any,template:NonNullable<ClipAction['action']>,data:Record<string,unknown>={}){
 const action=new template.Constructor({...template.data,...data});
 node.dispatcher.trigger(action);
 return action;
}

export async function waitForNativeSave(root:HTMLElement,project:any,timeout=15000){
 const end=Date.now()+timeout;let previous:any,stableSince=0;
 while(Date.now()<end){
  if((root as any).project!==project)throw Error('O projeto mudou durante a edição.');
  const current=(root.querySelector('.EditMenu') as any)?.data?.versionPoint?.current;
  if(current&&current.version===project.metadata.version){
   if(current!==previous){previous=current;stableSince=Date.now();}
   if(Date.now()-stableSince>=250)return;
  }else{previous=undefined;stableSince=0;}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw Error('O salvamento ainda não foi confirmado. Confira o editor antes de repetir.');
}
