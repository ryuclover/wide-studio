import type {ContentBridgeClient} from '../bridge/contentBridge';
import {sourceUiText} from '../i18n/catalog';
export const DRIVE_DRAG_TYPE='application/x-wide-studio-drive';
export const DRIVE_DROP_PROTOCOL=1;
export function driveRowAt(x:number,y:number){
 return [...document.querySelectorAll<HTMLElement>('.TimelineLayerRow')].find(row=>{const r=row.querySelector('.clipsContainer')?.getBoundingClientRect();return !!r&&!row.classList.contains('locked')&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
}
const loaded=new Map<string,{project:string;view:WeakRef<HTMLElement>}>();
// The native first-clip prompt would resize the entire project to a meme/GIF.
// Decline only newly created, known scene-size/FPS confirmations from this drop.
export function preserveSceneDuringDrop(){
 const before=new Set(document.querySelectorAll('dialog'));
 const check=()=>{for(const d of document.querySelectorAll<HTMLDialogElement>('dialog[open]')){
  if(before.has(d))continue;const view=d.querySelector('.ConfirmView'),title=sourceUiText(view?.querySelector('h1')||null).trim(),message=sourceUiText(view?.querySelector('.message')||null);
  if((title==='Resize Scene'&&/^Resize scene to match media size \d+×\d+\?/.test(message))||(title==='Match Scene'&&/^Update scene to match media size and frame rate \d+×\d+@/.test(message))){before.add(d);view?.querySelector<HTMLButtonElement>('button.false')?.click();}
 }};
 const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});return()=>observer.disconnect();
}
export function rememberDriveMedia(key:string,project:string,view:HTMLElement){loaded.set(key,{project,view:new WeakRef(view)});if(loaded.size>300)loaded.delete(loaded.keys().next().value!);}
export async function dropLoadedDriveMedia(key:string,project:string,token:string,bridge:ContentBridgeClient){
 const saved=loaded.get(key),view=saved?.view.deref();if(saved?.project!==project||!view?.isConnected||!view.closest('#ProjectApp'))return {found:false};
 for(let n=0;n<150&&!view.classList.contains('mediaContent-valid');n++){if(!view.isConnected)throw new Error('A Biblioteca foi atualizada. Confira a mídia antes de arrastar novamente.');await new Promise(r=>setTimeout(r,200));}
 if(!view.classList.contains('mediaContent-valid'))throw new Error('A mídia ainda está processando na Biblioteca. Aguarde antes de arrastar novamente.');
 view.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
 const {x,y,rowIndex}=await bridge.dropTarget({mode:'resolve',token});
 const row=document.querySelectorAll('.TimelineLayerRow')[rowIndex],container=row?.querySelector('.clipsContainer');
 if(!container||row?.classList.contains('locked'))throw new Error('Destino indisponível. A mídia continua na Biblioteca.');
 const transfer=new DataTransfer();
 const stopPreserving=preserveSceneDuringDrop();
 try{
 try{
  view.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:view.getBoundingClientRect().left,clientY:view.getBoundingClientRect().top,view:window}));
  container.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:x,clientY:y,view:window}));
  container.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:x,clientY:y,view:window}));
 }finally{view.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer,view:window}));}
 for(let n=0;n<40;n++){await new Promise(r=>setTimeout(r,200));const result=await bridge.dropTarget({mode:'verify',token,name:view.title});if(result.verified){await new Promise(r=>setTimeout(r,150));return {found:true,inserted:true,name:view.title,...result};}}
 throw new Error('Inserção não confirmada. Confira a timeline antes de repetir; a mídia permanece na Biblioteca.');
 }finally{stopPreserving();}
}
export function mountDriveDrop(bridge:ContentBridgeClient){
 let busy=false;const marker=document.createElement('div');marker.className='ws-drive-drop-marker';marker.hidden=true;document.body.append(marker);
 const toast=document.createElement('div');toast.className='ws-drive-drop-toast';toast.setAttribute('role','status');toast.hidden=true;document.body.append(toast);
 let timer:ReturnType<typeof setTimeout>;const show=(text:string,sticky=false)=>{clearTimeout(timer);toast.textContent=text;toast.hidden=false;if(!sticky)timer=setTimeout(()=>toast.hidden=true,6500);};
 let active:{token:string;expires:number}|undefined,expiry:ReturnType<typeof setTimeout>;
 let lastRelease:{x:number;y:number;at:number}|undefined,lastCancel=0;
 const feedback=(token:string,error:string)=>{void chrome.runtime.sendMessage({type:'SW_DRIVE_DROP_FEEDBACK',dragToken:token,error}).catch(()=>{});};
 const cancel=(error:string)=>{if(!active)return;const token=active.token;active=undefined;clearTimeout(expiry);marker.hidden=true;show(error);feedback(token,error);};
 const point=(x:number,y:number)=>{const row=driveRowAt(x,y);marker.hidden=!row||busy;if(row&&!busy){const r=row.querySelector('.clipsContainer')!.getBoundingClientRect();Object.assign(marker.style,{left:`${x}px`,top:`${r.top}px`,height:`${r.height}px`});}return row;};
 const insert=async(token:string,x:number,y:number)=>{
  active=undefined;clearTimeout(expiry);marker.hidden=true;
  if(busy||!driveRowAt(x,y)){const error=busy?'Aguarde a inserção atual.':'Solte na área de clipes de uma camada desbloqueada.';show(error);feedback(token,error);return;}
  busy=true;show('Preparando mídia do Drive para a timeline…',true);
  try{const target=await bridge.dropTarget({mode:'capture',x,y});const response=await chrome.runtime.sendMessage({type:'SW_DRIVE_DROP',dragToken:token,dropToken:target.token});if(!response?.success)throw new Error(response?.error||'Não foi possível inserir.');show(`${response.data.name} inserido em ${Number(response.data.time).toFixed(2)} s.`);}catch(e){const error=String(e).replace(/^(?:Error:\s*)+/,'');show(error);feedback(token,error);}finally{busy=false;}
 };
 window.addEventListener('message',e=>{
  const frame=document.querySelector<HTMLIFrameElement>('.ws-drive-panel iframe'),m=e.data;
  if(!frame||e.source!==frame.contentWindow||e.origin!==new URL(chrome.runtime.getURL('')).origin||m?.type!=='WIDE_DRIVE_POINTER'||!active||m.token!==active.token)return;
  if(m.phase==='cancel'){cancel('Arrasto cancelado. Nenhuma mídia foi adicionada.');return;}
  if(!['move','drop'].includes(m.phase)||!Number.isFinite(m.x)||!Number.isFinite(m.y))return;
  if(active.expires<Date.now()){cancel('O arrasto expirou. Tente novamente.');return;}
  const r=frame.getBoundingClientRect(),x=r.left+m.x,y=r.top+m.y;
  point(x,y);if(m.phase==='drop')void insert(active.token,x,y);
 });
 // Chromium may retarget pointer events to the parent when leaving an extension
 // frame. Both routes share one nonce; insert clears it before any async work.
 document.addEventListener('pointermove',e=>{if(active&&e.isTrusted)point(e.clientX,e.clientY);},true);
 document.addEventListener('pointerup',e=>{if(!e.isTrusted||e.button!==0)return;lastRelease={x:e.clientX,y:e.clientY,at:Date.now()};if(!active)return;e.preventDefault();e.stopImmediatePropagation();void insert(active.token,e.clientX,e.clientY);},true);
 window.addEventListener('keydown',e=>{if(e.key==='Escape'){lastCancel=Date.now();cancel('Arrasto cancelado. Nenhuma mídia foi adicionada.');}},true);
 chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(m?.type==='DRIVE_POINTER_END'){
   if(active&&active.token===m.dragToken){const token=active.token,frame=document.querySelector<HTMLIFrameElement>('.ws-drive-panel iframe');if(m.cancel)cancel('Arrasto cancelado. Nenhuma mídia foi adicionada.');else if(frame&&Number.isFinite(m.x)&&Number.isFinite(m.y)){const r=frame.getBoundingClientRect();void insert(token,r.left+m.x,r.top+m.y);}}
   reply({success:true,data:{received:true}});return;
  }
  if(m?.type!=='PREPARE_DRIVE_DROP')return;
  if(m.protocol!==DRIVE_DROP_PROTOCOL||typeof m.dragToken!=='string'||!/^[-\w]{36}$/.test(m.dragToken)||busy){reply({success:false,error:'Receptor do Drive indisponível. Aguarde ou recarregue a página.'});return;}
  cancel('Arrasto anterior substituído.');active={token:m.dragToken,expires:Date.now()+120000};expiry=setTimeout(()=>cancel('O arrasto expirou. Tente novamente.'),120000);
  reply({success:true,data:{protocol:DRIVE_DROP_PROTOCOL}});
  if(Number.isFinite(m.startedAt)&&Date.now()-m.startedAt<10000){if(lastCancel>=m.startedAt)cancel('Arrasto cancelado. Nenhuma mídia foi adicionada.');else if(lastRelease&&lastRelease.at>=m.startedAt)void insert(m.dragToken,lastRelease.x,lastRelease.y);}
 });
 const ours=(e:DragEvent)=>e.dataTransfer?.types.includes(DRIVE_DRAG_TYPE);
 const valid=(e:DragEvent)=>!!driveRowAt(e.clientX,e.clientY);
 document.addEventListener('dragover',e=>{if(!ours(e))return;e.preventDefault();e.stopImmediatePropagation();const good=!busy&&valid(e);if(e.dataTransfer)e.dataTransfer.dropEffect=good?'copy':'none';point(e.clientX,e.clientY);},true);
 document.addEventListener('dragleave',e=>{if(!e.relatedTarget)marker.hidden=true;},true);document.addEventListener('dragend',()=>marker.hidden=true,true);
 document.addEventListener('drop',e=>{if(!ours(e))return;e.preventDefault();e.stopImmediatePropagation();marker.hidden=true;const dragToken=e.dataTransfer!.getData(DRIVE_DRAG_TYPE);document.dispatchEvent(new DragEvent('dragend',{bubbles:true,view:window}));
  if(!e.isTrusted)return;void insert(dragToken,e.clientX,e.clientY);
 },true);
}




