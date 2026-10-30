import {YOUTUBE_MAX_BYTES,EXTRACT_CHUNK_BYTES} from '../extract/limits';
import {rememberDriveMedia} from './driveDrop';
import type {MediaReceiptClient} from '../bridge/mediaReceipt';
export async function importMedia(message:{name:string;mime:string;base64:string;driveKey?:string;expectedProjectId?:string}){
 if(typeof message.name!=='string'||message.name.length>180||!/^(image|video|audio)\/[a-z0-9.+-]+$/i.test(message.mime)||typeof message.base64!=='string'||message.base64.length>28*1024*1024||!/^[a-zA-Z0-9+/]*={0,2}$/.test(message.base64))throw new Error('Mídia inválida ou acima de 20 MB.');
 const bytes=Uint8Array.from(atob(message.base64),char=>char.charCodeAt(0));if(bytes.length>20*1024*1024)throw new Error('Mídia acima de 20 MB.');
 return importFile(message,new File([bytes],message.name,{type:message.mime}));
}
async function importFile(message:{name:string;driveKey?:string;expectedProjectId?:string},file:File){
 const native=document.querySelector<HTMLElement>('#ProjectApp .MediaListView');if(!native)throw new Error('Biblioteca indisponível.');
 const previous=new Set(native.querySelectorAll<HTMLElement>('.MediaView'));const before=previous.size;
 const beforeNamed=[...native.querySelectorAll('.MediaView')].filter(e=>e.getAttribute('title')===message.name).length;
 const transfer=new DataTransfer();transfer.items.add(file);
 native.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
 for(let attempt=0;attempt<400;attempt++){await new Promise(r=>setTimeout(r,150));if(native.querySelectorAll('.MediaView').length>before && [...native.querySelectorAll('.MediaView')].filter(e=>e.getAttribute('title')===message.name).length>beforeNamed){const view=[...native.querySelectorAll<HTMLElement>('.MediaView')].find(e=>!previous.has(e)&&e.title===message.name);if(view&&message.driveKey&&message.expectedProjectId)rememberDriveMedia(message.driveKey,message.expectedProjectId,view);return {imported:true,name:message.name,bytes:file.size};}}
 throw new Error('Importação não confirmada. Confira a Biblioteca antes de repetir; o editor pode ainda estar processando.');
}


type Transfer={id:string;project:string;name:string;size:number;parts:Uint8Array[];next:number;timer:ReturnType<typeof setTimeout>};
let pending:Transfer|undefined;
type ImportState={phase:'processing'|'done'|'error';project:string;detail?:string;error?:string;result?:{imported:boolean;name:string;bytes:number;hiddenByFilter?:boolean}};
const imports=new Map<string,ImportState>();
async function processExtract(id:string,file:File,bridge:MediaReceiptClient,state:ImportState){
 try{
  const native=document.querySelector<HTMLElement>('#ProjectApp .MediaListView');if(!native)throw new Error('Biblioteca indisponível.');
  // Do not dispatch into an unrelated modal or auto-dismiss user choices.
  if(document.querySelector('dialog[open]:not(.ContextMenu)'))throw new Error('Feche a janela aberta no editor e tente novamente.');
  const receipt=await bridge.importReceipt({mode:'begin',token:id,name:file.name,bytes:file.size});
  const transfer=new DataTransfer();transfer.items.add(new File([file],receipt.name,{type:file.type}));
  const oldDialogs=new Set(document.querySelectorAll('dialog[open]'));
  native.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
  const deadline=Date.now()+10*60*1000;
  while(Date.now()<deadline){
   await new Promise(r=>setTimeout(r,600));
   if(!native.isConnected)throw new Error('O projeto ou a Biblioteca mudou durante a importação.');
   const current=await bridge.importReceipt({mode:'status',token:id});
   if(current.phase==='valid'){state.result={imported:true,name:current.name,bytes:current.bytes,hiddenByFilter:!!native.querySelector('.removeFilters')?.textContent?.trim()&&![...native.querySelectorAll<HTMLElement>('.MediaView')].some(e=>e.title===current.name)};state.phase='done';return;}
   if(current.phase==='invalid')throw new Error(current.reason||'O Wide não conseguiu ler o vídeo.');
   const dialog=[...document.querySelectorAll('dialog[open]:not(.ContextMenu)')].find(d=>!oldDialogs.has(d));
   state.detail=dialog?'O Wide abriu uma janela. Confira a janela no editor para continuar.':current.phase==='probing'?'O Wide está analisando o vídeo…':'O Wide está recebendo o arquivo…';
  }
  throw new Error('O Wide não confirmou a leitura do vídeo em 10 minutos. Confira a Biblioteca antes de repetir.');
 }catch(error){state.phase='error';state.error=String(error).replace(/^(?:Error:\s*)+/,'');}
}
function discard(){if(pending)clearTimeout(pending.timer);pending=undefined;}
export async function extractionTransfer(message:any,project:string,bridge?:MediaReceiptClient){
 if(typeof message.transferId!=='string'||!/^[a-f0-9-]{36}$/.test(message.transferId))throw new Error('Transferência inválida.');
 const existing=imports.get(message.transferId);
 if(existing){
  if(existing.project!==project||message.expectedProjectId!==project)throw new Error('O projeto mudou durante a importação.');
  if(message.type==='EXTRACT_IMPORT_STATUS'||message.type==='EXTRACT_IMPORT_FINISH')return existing;
  if(message.type==='EXTRACT_IMPORT_ABORT')return {cancelled:false,phase:existing.phase};
  throw new Error('Importação já iniciada.');
 }
 if(message.type==='EXTRACT_IMPORT_STATUS')throw new Error('O editor perdeu o acompanhamento desta importação. Confira a Biblioteca antes de repetir.');
 if(message.type==='EXTRACT_IMPORT_BEGIN'){
  if(pending)throw new Error('Aguarde a transferência atual.');
  if(typeof message.name!=='string'||!message.name.length||message.name.length>180||message.expectedProjectId!==project)throw new Error('Mídia ou projeto inválido.');
  pending={id:message.transferId,project,name:message.name,size:0,parts:[],next:0,timer:setTimeout(discard,240000)};return {started:true};
 }
 const transfer=pending;if(!transfer||transfer.id!==message.transferId)throw new Error('Transferência expirada.');
 if(message.type==='EXTRACT_IMPORT_ABORT'){discard();return {cancelled:true};}
 if(project!==transfer.project||message.expectedProjectId!==project){discard();throw new Error('O projeto mudou durante o download.');}
 clearTimeout(transfer.timer);transfer.timer=setTimeout(discard,240000);
 if(message.type==='EXTRACT_IMPORT_CHUNK'){
  try{if(message.index!==transfer.next||typeof message.base64!=='string'||message.base64.length>Math.ceil(EXTRACT_CHUNK_BYTES/3)*4||!message.base64.length||!/^[a-zA-Z0-9+/]*={0,2}$/.test(message.base64))throw new Error('Parte de mídia inválida.');
   const bytes=Uint8Array.from(atob(message.base64),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>EXTRACT_CHUNK_BYTES||transfer.size+bytes.length>YOUTUBE_MAX_BYTES)throw new Error('Vídeo acima de 200 MB ou parte inválida.');
   transfer.parts.push(bytes);transfer.size+=bytes.length;transfer.next++;return {received:transfer.size};
  }catch(error){discard();throw error;}
 }
 if(message.type!=='EXTRACT_IMPORT_FINISH')throw new Error('Etapa de transferência inválida.');
 discard();if(message.bytes!==transfer.size||transfer.size<100)throw new Error('Arquivo incompleto.');
 const file=new File(transfer.parts as BlobPart[],transfer.name,{type:'video/mp4'});
 const header=new Uint8Array(await file.slice(0,8).arrayBuffer());if(String.fromCharCode(...header.subarray(4,8))!=='ftyp')throw new Error('MP4 inválido.');
 if(bridge){
  const state:ImportState={phase:'processing',project};imports.set(message.transferId,state);
  for(const [id,item]of imports){if(imports.size<=8)break;if(item.phase!=='processing')imports.delete(id);}
  void processExtract(message.transferId,file,bridge,state);return state;
 }
 return importFile({name:transfer.name,expectedProjectId:project},file);
}
window.addEventListener('pagehide',discard);
