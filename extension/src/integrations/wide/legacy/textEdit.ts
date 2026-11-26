import {supportsEditor} from '../compatibility';

const filterCommands=new WeakMap<Window,any>();
/** Read the host's filter command without constructing a view or changing selection. */
function nativeFilterCommand(form:any,project:any,clip:any){
 const win=form.ownerDocument?.defaultView as Window|undefined;
 if(!win)return;
 const cached=filterCommands.get(win);if(cached)return cached;
 const registry=win.customElements;
 // Wide registers its native components lazily with sequential custom element names.
 for(let index=0;index<2048;index++){
  const component=registry.get(`wv-${index}`);if(!component)break;
  for(let proto=component.prototype;proto;proto=Object.getPrototypeOf(proto)){
   if(!Object.hasOwn(proto,'submitData')||typeof proto.submitData!=='function')continue;
   let captured:any;
   const receive=(action:any)=>{const data=action?.data;if(data?.project===project&&data.clip===clip&&data.filter===clip.load&&data.newData?.text===clip.load.text&&data.flush==='fast')captured=action.constructor;};
   try{proto.submitData.call({init:{project,clip,filter:clip.load},submitKindToFlush:()=> 'fast',trigger:receive,triggerGlobal:receive},{text:clip.load.text},'input');}catch{continue;}
   if(captured){filterCommands.set(win,captured);return captured;}
  }
 }
 // Older Wide versions have not constructed a filter form yet. Ask a detached
 // native button for its disable-filter command; capture it without execution.
 const explorer=form.closest?.('.ClipExplorer');
 if(typeof explorer?.createButton==='function'){
  const probe={kind:'opacity'},node=explorer.createButton.call({buttonMap:new WeakMap(),project,clip},probe);
  let captured:any,menu:any;
  try{
   Object.defineProperty(node,'dispatcher',{configurable:true,value:{trigger(action:any){const d=action?.data;if(d?.project===project&&d.clip===clip&&d.filter===probe&&d.newData?.disabled===true)captured=action.constructor;}}});
   menu=node.createContextMenu();
   const items=menu.itemProvider(new (win as any).MouseEvent('contextmenu'));
   for(const item of items){
    if(typeof item?.callback==='function'&&/^\(\)\s*=>\s*[$\w]+\.trigger\([$\w]+\.action\)$/.test(Function.prototype.toString.call(item.callback)))item.callback();
    if(captured)break;
   }
   if(captured){filterCommands.set(win,captured);return captured;}
  }finally{menu?.dispose?.();}
 }
}

/** Capture only ClipForm's native UpdateClip command; do not submit an edit. */
export function createNativeTextWriter(form:any,project:any,clip:any){
 if(!supportsEditor(project?.metadata?.appVersion)||form?.project!==project||form?.clip!==clip||typeof form.submit!=='function')throw Error('O editor de texto nativo não está disponível.');
 const FilterCommand=nativeFilterCommand(form,project,clip);
 if(FilterCommand)return (text:string,flush:'fast'|'save')=>{
  // Use the native filter pipeline so rendered text is invalidated too.
  const newData={...clip.load,text};delete newData.cache;
  form.triggerGlobal(new FilterCommand({project,clip,filter:clip.load,newData,flush}));
 };
 let template:any;
 const descriptor=Object.getOwnPropertyDescriptor(form,'triggerGlobal');
 try{
  Object.defineProperty(form,'triggerGlobal',{configurable:true,writable:true,value:(action:any)=>{
   if(action.data?.project===project&&action.data?.clip===clip&&action.data?.data)template=action;
  }});
  form.submit('user');
 }finally{if(descriptor)Object.defineProperty(form,'triggerGlobal',descriptor);else delete form.triggerGlobal;}
 if(!template)throw Error('O comando nativo de edição não foi identificado.');
 return (text:string,flush:'fast'|'save')=>{
  const load={...clip.load,text};delete load.cache;
  form.triggerGlobal(new template.constructor({...template.data,data:{load},flush}));
 };
}
export function updateNativeText(form:any,project:any,clip:any,text:string){createNativeTextWriter(form,project,clip)(text,'save');}
