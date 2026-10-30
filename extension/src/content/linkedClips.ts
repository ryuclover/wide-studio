import {translateUiText,validLanguage} from '../i18n/catalog';
type Node=HTMLElement&{init:any;timing:any;createDragHandlerData:(event:DragEvent)=>any};
type Descriptor={key:string;start:number};
type Saved={groups:Descriptor[][]};
const STORAGE='wide-studio.links.v1:';
const KEY='__WIDE_STUDIO_LINKS_STOP__';
export function expandLinks(clips:Set<any>,groups:Set<any>[]){
 const result=new Set(clips);let changed=true;
 while(changed){changed=false;for(const group of groups)if([...group].some(c=>result.has(c)))for(const clip of group)if(!result.has(clip)){result.add(clip);changed=true;}}
 return result;
}
// Compare actual clip content, excluding volatile caches and timeline delay.
// Never attach an ambiguous saved reference to a different copy of a clip.
export function clipLinkKey(clip:any):string{
 const text=JSON.stringify(clip,(key,value)=>{
  if(key==='cache')return undefined;
  if(key==='filter'&&Array.isArray(value))return value.filter(f=>f.kind!=='delay');
  if(key==='media'&&value&&typeof value==='object')return {name:value.original?.file?.name,path:value.original?.file?.path,size:value.original?.file?.size};
  return value;
 });
 let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 return `${text.length}:${hash>>>0}`;
}
export function restoreLinks(saved:Saved,clips:any[],start:(clip:any)=>number):Set<any>[] {
 const used=new Set<any>(),result:Set<any>[]=[];
 for(const records of saved.groups){const group=new Set<any>();for(const record of records){
  const matches=clips.filter(c=>clipLinkKey(c)===record.key&&!used.has(c));
  const exact=matches.filter(c=>Math.abs(start(c)-record.start)<.00001);
  const clip=exact.length===1?exact[0]:matches.length===1?matches[0]:undefined;
  if(clip){group.add(clip);used.add(clip);}
 }if(group.size>1)result.push(group);}
 return result;
}
export function installLinkedClips(doc:Document=document){
 const win=doc.defaultView!;(win as any)[KEY]?.();
 let project:any,identity='',groups:Set<any>[]=[],savedText='',stopped=false,dragging=false;
 let moveBounds:{project:any;starts:Map<any,number>;minimum:number}|undefined;
 let timingGetter:((this:any)=>any)|undefined;
 const patched=new Map<Node,Node['createDragHandlerData']>();
 const menus=new Map<any,{node:HTMLElement;provider:any;wrapper:any}>();
 let toastTimer:ReturnType<typeof setTimeout>|undefined;
 const toast=doc.createElement('div');toast.className='ws-selection-toast';toast.setAttribute('role','status');toast.hidden=true;
 const announce=(message:string)=>{toast.textContent=message;toast.hidden=false;if(!toast.isConnected)doc.body.append(toast);clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,3500);};
 const all=()=>project?.presentation?.layer.flatMap((l:any)=>l.clip)||[];
 const start=(clip:any)=>timingGetter?.call({init:{clip}})?.presentation.start??NaN;
 const unlocked=(clip:any)=>!clip.locked&&!project.presentation.layer.find((l:any)=>l.clip.includes(clip))?.locked;
 const selected=()=>project?.selection?.kind==='clips'?new Set<any>(project.selection.value):project?.selection?.kind==='clip'?new Set<any>([project.selection.value]):new Set<any>();
 const active=()=>doc.documentElement.hasAttribute('data-wide-studio-workspace')&&project?.metadata?.appVersion==='1.7.12';
 const availability=(selection:Set<any>)=>({
  link:selection.size>=2&&[...selection].every(unlocked)&&!groups.some(g=>g.size===selection.size&&[...selection].every(c=>g.has(c))),
  unlink:groups.some(g=>[...g].some(c=>selection.has(c)))
 });
 const save=()=>{if(!identity||dragging)return;const valid=new Set(all());const data:Saved={groups:groups.map(g=>[...g].filter(c=>valid.has(c)).map(c=>({key:clipLinkKey(c),start:start(c)}))).filter(g=>g.length>1)};
  const text=JSON.stringify(data);if(text===savedText)return;
  try{win.localStorage.setItem(STORAGE+identity,text);savedText=text;}catch{savedText=text;announce('Os vínculos funcionam nesta sessão, mas não foi possível salvá-los neste navegador.');}
 };
 const apply=(unlink:boolean)=>{if(!active())return;const selection=selected();
  if(unlink){groups=groups.filter(g=>![...g].some(c=>selection.has(c)));announce('Vínculo removido. Os clipes agora se movem separadamente.');}
  else{if(selection.size<2)return;const merged=expandLinks(selection,groups);if([...merged].some(c=>!unlocked(c))){announce('Desbloqueie os clipes e suas camadas antes de vincular.');return;}
   groups=groups.filter(g=>![...g].some(c=>merged.has(c)));groups.push(merged);announce(`${merged.size} clipes vinculados. Arraste qualquer um para mover o conjunto.`);
  }save();refresh();
 };
 const refresh=()=>{if(stopped||dragging)return;const root=doc.querySelector<HTMLElement>('#ProjectApp'),p=(root as any)?.project;
  if(!p||p.metadata?.appVersion!=='1.7.12')return;
  const nodes=[...root!.querySelectorAll<Node>('.TimelineClipContainer')];
  if(nodes.length&&!timingGetter){let proto=Object.getPrototypeOf(nodes[0]);while(proto&&!timingGetter){timingGetter=Object.getOwnPropertyDescriptor(proto,'timing')?.get;proto=Object.getPrototypeOf(proto);}}
  if(!timingGetter&&p.presentation.layer.some((l:any)=>l.clip.length))return;
  const nextIdentity=String(p.metadata.createdTime?.getTime?.()??'')+'|'+String(p.directory?.setup?.path??'');
  if(project!==p){const oldIdentity=identity;project=p;identity=nextIdentity;groups=[];savedText='';
   try{const raw=win.localStorage.getItem(STORAGE+identity);if(raw&&raw.length<250000){const data=JSON.parse(raw);if(Array.isArray(data.groups)&&data.groups.length<=500&&data.groups.every((g:any)=>Array.isArray(g)&&g.length<=500&&g.every((r:any)=>typeof r.key==='string'&&Number.isFinite(r.start)))){groups=restoreLinks(data,all(),start);savedText=raw;}}}catch{}
   if(oldIdentity===identity&&groups.length)announce('Vínculos restaurados.');
  }
  // Extend the native item provider so placement, dismissal and keyboard
  // handling remain owned by Wide. No second menu or DOM injection delay.
  for(const [menu,entry]of menus)if(!entry.node.isConnected||(entry.node as any).contextMenu!==menu){if(menu.itemProvider===entry.wrapper)menu.itemProvider=entry.provider;menus.delete(menu);}
  for(const node of root!.querySelectorAll<HTMLElement>('.Timeline,.TimelineLayerRow,.TimelineClipContainer')){
   const menu=(node as any).contextMenu;if(!menu||typeof menu.itemProvider!=='function'||menus.has(menu))continue;
   const provider=menu.itemProvider,wrapper=function(this:any,event:MouseEvent){
    const items=provider.call(this,event),selection=selected(),clipNode=(event.target as Element)?.closest?.('.TimelineClipContainer') as Node|null;
    if(!active()||!Array.isArray(items)||selection.size<2||clipNode&&!selection.has(clipNode.init?.clip))return items;
    const owner=project,state=availability(selection),language=doc.documentElement.dataset.wsLanguage;
    const additions=[['link','Vincular clipes'],['unlink','Desvincular clipes']].map(([action,label])=>{
     const enabled=state[action as 'link'|'unlink'];return {label:translateUiText(label,validLanguage(language)?language:'original'),className:`ws-context-${action}${enabled?'':' disabled'}`,callback:enabled?()=>{
      const current=selected();if(project!==owner||current.size!==selection.size||[...selection].some(c=>!current.has(c)))return;
      if(availability(current)[action as 'link'|'unlink'])apply(action==='unlink');
     }:undefined};
    });
    const index=items.lastIndexOf('hr');return index>=0?[...items.slice(0,index),'hr',...additions,...items.slice(index)]:[...items,'hr',...additions];
   };menu.itemProvider=wrapper;menus.set(menu,{node,provider,wrapper});
  }
  // Replaced/deleted native nodes must not keep their project alive.
  for(const [node,original]of patched)if(!node.isConnected||node.init.project!==project){node.createDragHandlerData=original;patched.delete(node);}
  for(const node of nodes){if(node.init?.project!==project||typeof node.createDragHandlerData!=='function')continue;
   if(!patched.has(node)){const original=node.createDragHandlerData;patched.set(node,original);node.createDragHandlerData=function(event){
    const payload=original.call(this,event);if(!active()||this.init.project!==project||!(payload?.clips instanceof Map))return payload;
    const initial=new Set<any>([this.init.clip,...payload.clips.keys()]),expanded=expandLinks(initial,groups);
    if(expanded.size===initial.size&&![...initial].some(c=>groups.some(g=>g.has(c))))return payload;
    const base=start(this.init.clip);const live=new Set(all());
    if([...expanded].some(c=>!live.has(c)||!unlocked(c)||!Number.isFinite(start(c)))||!Number.isFinite(base)){
     event.preventDefault();announce('Não é possível mover o conjunto: há um clipe ou uma camada bloqueada ou indisponível.');return payload;
    }
    for(const clip of expanded)payload.clips.set(clip,start(clip)-base);
    const starts=new Map([...expanded].map(clip=>[clip,start(clip)]));
    moveBounds={project,starts,minimum:Math.min(...starts.values())};
    payload.allowLayerSwap=false;
    const earliest=Math.min(0,...payload.clips.values());
    if(Number.isFinite(payload.minX))payload.minX-=this.init.conversion.presentationTimeToWidth(earliest);
    if(Array.isArray(payload.snapX))payload.snapX=payload.snapX.filter((snap:any)=>snap.position>=payload.minX);
    return payload;
   };}
   const group=groups.find(g=>g.has(node.init.clip)),index=group?groups.indexOf(group)+1:0;
   node.classList.toggle('ws-linked-clip',!!group);let badge=node.querySelector<HTMLElement>(':scope > .ws-link-badge');
   if(group){if(!badge){badge=doc.createElement('span');badge.className='ws-link-badge';badge.setAttribute('aria-hidden','true');node.append(badge);}const label=`Vínculo ${index}: ${group.size} clipes`;if(badge.title!==label){badge.textContent=`↔ ${index}`;badge.title=label;}}
   else badge?.remove();
  }
  const heading=root!.querySelector('.TimelinePanel > .ws-region-heading');
  if(heading&&!heading.querySelector('.ws-link-controls')){const controls=doc.createElement('span');controls.className='ws-link-controls';
   for(const [action,label,hint]of [['link','Vincular','Selecione dois ou mais clipes. O vínculo preserva o intervalo e as camadas ao arrastar.'],['unlink','Desvincular','Remove o vínculo inteiro dos conjuntos selecionados.']]){const b=doc.createElement('button');b.type='button';b.dataset.wsLinkAction=action;b.textContent=label;b.title=hint;b.onclick=e=>{e.stopPropagation();apply(action==='unlink');};controls.append(b);}heading.append(controls);
  }
  const selection=selected(),link=doc.querySelector<HTMLButtonElement>('[data-ws-link-action="link"]'),unlink=doc.querySelector<HTMLButtonElement>('[data-ws-link-action="unlink"]');
  const state=availability(selection);
  if(link)link.disabled=!state.link;
  if(unlink)unlink.disabled=!state.unlink;
  save();
 };
 const down=()=>{refresh();};
 const drag=(e:DragEvent)=>{if(!e.defaultPrevented&&(e.target as Element)?.closest?.('.TimelineClipContainer'))dragging=true;};
 const end=()=>{moveBounds=undefined;dragging=false;refresh();};
 const clamp=(event:Event)=>{const action=(event as CustomEvent).detail,bounds=moveBounds;
  if(!bounds||action?.data?.project!==bounds.project||!bounds.starts.has(action.data.clip)||!Number.isFinite(action.data.presentationTime))return;
  action.data.presentationTime=Math.max(action.data.presentationTime,bounds.starts.get(action.data.clip)!-bounds.minimum);
 };
 doc.addEventListener('NY',clamp,true);
 doc.addEventListener('contextmenu',down,true);
 doc.addEventListener('pointerdown',down,true);doc.addEventListener('dragstart',drag);doc.addEventListener('dragend',end);doc.addEventListener('drop',end);win.addEventListener('blur',end);
 const timer=setInterval(refresh,250);refresh();
 const stop=()=>{stopped=true;clearInterval(timer);clearTimeout(toastTimer);doc.removeEventListener('contextmenu',down,true);doc.removeEventListener('NY',clamp,true);doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('dragstart',drag);doc.removeEventListener('dragend',end);doc.removeEventListener('drop',end);win.removeEventListener('blur',end);for(const [menu,entry]of menus)if(menu.itemProvider===entry.wrapper)menu.itemProvider=entry.provider;menus.clear();for(const [node,original]of patched){node.createDragHandlerData=original;node.classList.remove('ws-linked-clip');node.querySelector('.ws-link-badge')?.remove();}patched.clear();doc.querySelectorAll('.ws-link-controls').forEach(n=>n.remove());toast.remove();};
 (win as any)[KEY]=stop;return stop;
}
