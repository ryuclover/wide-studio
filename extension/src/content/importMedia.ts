import {YOUTUBE_MAX_BYTES,EXTRACT_CHUNK_BYTES} from '../extract/limits';
import {rememberDriveMedia} from './driveDrop';
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
function discard(){if(pending)clearTimeout(pending.timer);pending=undefined;}
export async function extractionTransfer(message:any,project:string){
 if(typeof message.transferId!=='string'||!/^[a-f0-9-]{36}$/.test(message.transferId))throw new Error('Transferência inválida.');
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
 return importFile({name:transfer.name,expectedProjectId:project},file);
}
window.addEventListener('pagehide',discard);
