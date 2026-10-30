type NativeNode=HTMLElement&{init?:any;data?:any;onClick?:(event:MouseEvent)=>void};
type Kind='clips'|'medias';
type Rect={left:number;top:number;right:number;bottom:number};
const KEY='__WIDE_STUDIO_MARQUEE_UNINSTALL__';
export const selectionRect=(x:number,y:number,x2:number,y2:number):Rect=>({left:Math.min(x,x2),top:Math.min(y,y2),right:Math.max(x,x2),bottom:Math.max(y,y2)});
export const intersects=(a:Rect,b:Rect)=>a.left<a.right&&a.top<a.bottom&&b.left<b.right&&b.top<b.bottom&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
function values(project:any,kind:Kind):Set<any>{
 const selection=project.selection;
 return selection?.kind===kind&&selection.value instanceof Set?new Set(selection.value):selection?.kind===(kind==='clips'?'clip':'media')?new Set([selection.value]):new Set();
}
function projectOf(root:HTMLElement){const project=(root as any).project;if(project?.metadata?.appVersion!=='1.7.12')throw new Error('Seleção indisponível nesta versão do editor.');return project;}
function ref(node:NativeNode,kind:Kind){return kind==='clips'?node.init?.clip:node.init?.media;}
function allowed(node:NativeNode,project:any,kind:Kind){
 if(!node.isConnected||node.init?.project!==project)return false;
 if(kind==='medias')return !node.data?.disabled&&project.mediaList.includes(node.init.media);
 const layer=project.presentation.layer.find((layer:any)=>layer.clip.includes(node.init.clip));return !!layer&&!layer.locked&&!node.init.clip.locked;
}
// Use existing native selection actions; never replace project.selection or edit the presentation.
function selectExact(root:HTMLElement,kind:Kind,desired:Set<any>){
 const project=projectOf(root),panel=root.querySelector('.MediaPanel') as any;
 if(!root.isConnected||panel?.init?.project!==project||typeof panel.onMediaListSelectMedia!=='function'||typeof panel.onMediaListSelectMedias!=='function')throw new Error('Controles nativos de seleção indisponíveis.');
 const current=values(project,kind);
 if(current.size===desired.size&&[...desired].every(item=>current.has(item))&&(project.selection?.kind===kind||project.selection?.kind===(kind==='clips'?'clip':'media')||!desired.size&&project.selection?.kind==='empty'))return;
 if(kind==='medias'){
  if(!desired.size)panel.onMediaListSelectMedia(undefined,false);
  else if(desired.size===1)panel.onMediaListSelectMedia([...desired][0],false);
  else panel.onMediaListSelectMedias(desired);
 }else{
  const nodes=[...root.querySelectorAll<NativeNode>('.TimelineClipContainer')];
  const byRef=new Map(nodes.map(node=>[ref(node,kind),node]));
  for(const item of desired){const node=byRef.get(item);if(!node||!allowed(node,project,kind)||typeof node.onClick!=='function')throw new Error('O clipe mudou durante a seleção.');}
  // Diff native membership synchronously: no clear/reselect flicker or asynchronous backlog.
  if([...current].some(item=>!byRef.has(item))||!current.size&&project.selection?.kind!=='empty'){
   panel.onMediaListSelectMedia(undefined,false);current.clear();
  }
  for(const item of new Set([...current,...desired]))if(current.has(item)!==desired.has(item))byRef.get(item)!.onClick!(new MouseEvent('click',{ctrlKey:true,metaKey:true,cancelable:true}));
 }
 const observed=values(project,kind);
 if(observed.size!==desired.size||[...desired].some(item=>!observed.has(item)))throw new Error('Seleção não confirmada. Confira os itens destacados.');
}
export async function applyMarqueeSelection(root:HTMLElement,kind:Kind,nodes:NativeNode[],additive:boolean){
 const project=projectOf(root),desired=additive?values(project,kind):new Set<any>();
 for(const node of nodes){if(!allowed(node,project,kind))throw new Error('A mídia ou camada mudou durante a seleção.');desired.add(ref(node,kind));}
 selectExact(root,kind,desired);await frame();
 if(!root.isConnected||(root as any).project!==project)throw new Error('O projeto mudou durante a seleção.');
 return {count:desired.size,kind};
}
export function installMarqueeSelection(){
 const previous=(window as any)[KEY];if(typeof previous==='function')previous();
 let armed=false,suppressUntil=0,toastTimer:ReturnType<typeof setTimeout>|undefined;
 type Gesture={id:number;root:HTMLElement;project:any;zone:HTMLElement;kind:Kind;x:number;y:number;additive:boolean;dragged:boolean;hits:NativeNode[];baseline:Set<any>;originalKind:Kind;original:Set<any>};
 let gesture:Gesture|undefined,box:HTMLDivElement|undefined;
 let lastBlankClick:{root:Element;x:number;y:number;time:number}|undefined;
 const toast=document.createElement('div');toast.className='ws-selection-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.hidden=true;
 const announce=(text:string)=>{clearTimeout(toastTimer);toast.textContent=text;toast.hidden=false;if(!toast.isConnected)document.body.append(toast);toastTimer=setTimeout(()=>toast.hidden=true,2600);};
 const setArmed=(value:boolean)=>{armed=value;document.documentElement.toggleAttribute('data-ws-marquee',value);document.querySelectorAll('[data-ws-marquee-toggle]').forEach(button=>{button.setAttribute('aria-pressed',String(value));});};
 const clear=()=>{document.querySelectorAll('.ws-marquee-hit').forEach(node=>node.classList.remove('ws-marquee-hit'));box?.remove();box=undefined;if(gesture){try{gesture.zone.releasePointerCapture(gesture.id);}catch{}}gesture=undefined;};
 const cancel=()=>{const g=gesture;if(g?.dragged){suppressUntil=Date.now()+250;if(g.root.isConnected&&(g.root as any).project===g.project){try{selectExact(g.root,g.originalKind,g.original);}catch(error){announce(String(error).replace(/^Error: /,''));}}}clear();setArmed(false);};
 const down=(event:PointerEvent)=>{
  if(event.button!==0||event.isPrimary===false||!document.documentElement.hasAttribute('data-wide-studio-workspace'))return;
  const target=event.target instanceof Element?event.target:null;
  // Gap controls cover otherwise empty timeline space. Their click remains
  // native, but a drag must be allowed to turn into a selection rectangle.
  const gapButton=target?.closest('.TimelineGap button');
  if(!target||target.closest('input,select,textarea,a,[contenteditable=true],.ws-region-heading,dialog,.Controls')||target.closest('button')&&!gapButton)return;
  const root=target.closest<HTMLElement>('#ProjectApp');if(!root||document.querySelector('dialog[open]'))return;
  const timeline=target.closest<HTMLElement>('.clipsContainer'),library=target.closest<HTMLElement>('.MediaListView > .container');
  const kind:Kind=timeline?'clips':'medias',zone=timeline?.closest<HTMLElement>('.Timeline')||library;if(!zone)return;
  const item=target.closest('.TimelineClipContainer,.MediaView');if(!armed&&!event.shiftKey&&item)return;
  let project;try{project=projectOf(root);}catch(error){if(armed||event.shiftKey)announce(String(error).replace(/^Error: /,''));setArmed(false);return;}
  gesture={id:event.pointerId,root,project,zone,kind,x:event.clientX,y:event.clientY,additive:event.ctrlKey||event.metaKey||event.shiftKey,dragged:false,hits:[],baseline:values(project,kind),originalKind:project.selection?.kind==='media'||project.selection?.kind==='medias'?'medias':'clips',original:values(project,project.selection?.kind==='media'||project.selection?.kind==='medias'?'medias':'clips')};
  event.preventDefault();event.stopImmediatePropagation();
 };
 const move=(event:PointerEvent)=>{
  const g=gesture;if(!g||event.pointerId!==g.id)return;
  if(!g.root.isConnected||(g.root as any).project!==g.project||!g.zone.isConnected){cancel();return;}
  if(!g.dragged&&Math.hypot(event.clientX-g.x,event.clientY-g.y)<6)return;
  if(!g.dragged){lastBlankClick=undefined;g.dragged=true;try{g.zone.setPointerCapture(g.id);}catch{}box=document.createElement('div');box.className='ws-selection-box';box.setAttribute('aria-hidden','true');document.body.append(box);}
  event.preventDefault();event.stopImmediatePropagation();const bounds=g.zone.getBoundingClientRect();
  const rect=selectionRect(g.x,g.y,Math.max(bounds.left,Math.min(event.clientX,bounds.right)),Math.max(bounds.top,Math.min(event.clientY,bounds.bottom)));
  Object.assign(box!.style,{left:rect.left+'px',top:rect.top+'px',width:rect.right-rect.left+'px',height:rect.bottom-rect.top+'px'});
  const nodes=[...g.zone.querySelectorAll<NativeNode>(g.kind==='clips'?'.TimelineClipContainer':'.MediaView')];
  g.hits=nodes.filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&intersects(rect,r)&&intersects(bounds,r)&&allowed(node,g.project,g.kind);});
  const hits=new Set(g.hits);for(const node of nodes)node.classList.toggle('ws-marquee-hit',hits.has(node));
  const desired=g.additive?new Set(g.baseline):new Set<any>();for(const node of g.hits)desired.add(ref(node,g.kind));
  try{selectExact(g.root,g.kind,desired);}catch(error){cancel();announce(String(error).replace(/^Error: /,''));}
 };
 const up=(event:PointerEvent)=>{
  const g=gesture;if(!g||event.pointerId!==g.id)return;
  if(!g.dragged){clear();return;}
  event.preventDefault();event.stopImmediatePropagation();suppressUntil=Date.now()+250;
  const count=values(g.project,g.kind).size;clear();setArmed(false);
  announce(g.kind==='clips'?`${count} ${count===1?'clipe selecionado':'clipes selecionados'}.`:`${count} ${count===1?'mídia selecionada':'mídias selecionadas'}.`);
 };
 const click=(event:MouseEvent)=>{
  const button=event.target instanceof Element?event.target.closest('[data-ws-marquee-toggle]'):null;
  if(button){event.preventDefault();event.stopImmediatePropagation();const next=!armed;cancel();setArmed(next);if(armed)announce('Clique e arraste um retângulo na timeline ou Biblioteca. Esc cancela.');return;}
  if(Date.now()<suppressUntil){lastBlankClick=undefined;suppressUntil=0;event.preventDefault();event.stopImmediatePropagation();return;}
  const target=event.target instanceof Element?event.target:null,root=target?.closest('#ProjectApp');
  const blank=target?.closest('.Timeline .clipsContainer,.Timeline .TimelineGap')&&!target.closest('.TimelineClipContainer,button,input,select,textarea,a,[contenteditable=true],.Controls');
  if(event.button===0&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&blank&&root){
   const previous=lastBlankClick;lastBlankClick={root,x:event.clientX,y:event.clientY,time:Date.now()};
   // Prevented pointerdown suppresses native dblclick/detail in Chromium; count completed clicks.
   if(previous?.root===root&&Date.now()-previous.time<=400&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=6){lastBlankClick=undefined;doubleClick(event);}
  }else lastBlankClick=undefined;
 };
 const doubleClick=(event:MouseEvent)=>{
  if(event.button!==0||!document.documentElement.hasAttribute('data-wide-studio-workspace')||document.querySelector('dialog[open]'))return;
  const target=event.target instanceof Element?event.target:null;
  if(!target||!target.closest('.Timeline .clipsContainer,.Timeline .TimelineGap')||target.closest('.TimelineClipContainer,button,input,select,textarea,a,[contenteditable=true],.Controls'))return;
  const root=target.closest<HTMLElement>('#ProjectApp');if(!root)return;
  try{projectOf(root);cancel();selectExact(root,'medias',new Set());event.preventDefault();event.stopImmediatePropagation();announce('Seleção limpa.');}catch(error){announce(String(error).replace(/^Error: /,''));}
 };
 const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&(gesture||armed)){event.preventDefault();event.stopImmediatePropagation();cancel();}};
 const interrupted=()=>{if(gesture)cancel();};
 document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',cancel,true);document.addEventListener('click',click,true);document.addEventListener('dblclick',doubleClick,true);document.addEventListener('keydown',key,true);document.addEventListener('scroll',interrupted,true);window.addEventListener('blur',cancel);window.addEventListener('resize',interrupted);
 const uninstall=()=>{cancel();clearTimeout(toastTimer);toast.remove();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('click',click,true);document.removeEventListener('dblclick',doubleClick,true);document.removeEventListener('keydown',key,true);document.removeEventListener('scroll',interrupted,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',interrupted);window.removeEventListener('pagehide',uninstall);if((window as any)[KEY]===uninstall)delete(window as any)[KEY];};
 window.addEventListener('pagehide',uninstall);(window as any)[KEY]=uninstall;return uninstall;
}
