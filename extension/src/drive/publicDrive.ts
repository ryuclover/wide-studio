export const DEFAULT_PACK='1tMCgDgE4WEJmhsdikB09j9ADNW2YYuNq';
export const MAX_MEDIA_BYTES=20*1024*1024;
export function driveId(input:string){
 if(/^[A-Za-z0-9_-]{10,160}$/.test(input))return input;
 const url=new URL(input);if(url.protocol!=='https:'||url.hostname!=='drive.google.com')throw new Error('Use um link HTTPS do Google Drive.');
 const id=url.pathname.match(/\/(?:folders|d)\/([A-Za-z0-9_-]+)/)?.[1]||url.searchParams.get('id');
 if(!id||!/^[A-Za-z0-9_-]{10,160}$/.test(id))throw new Error('Link do Drive inválido.');return id;
}
export interface PublicDriveItem{id:string;name:string;mime:string;size?:number}
export function parsePublicFolder(html:string):PublicDriveItem[]{
 const match=html.match(/window\['_DRIVE_ivd'\]\s*=\s*'((?:\\.|[^'\\])*)'/);
 if(!match)throw new Error('A pasta não está pública ou o formato do Drive mudou. Abra o link no Drive para conferir.');
 // Decode a string literal as data. Never execute scripts from the Drive page.
 const decoded=match[1].replace(/\\(?:x([0-9a-f]{2})|u([0-9a-f]{4})|([\s\S]))/gi,(_,hex,unicode,char)=>hex||unicode?String.fromCharCode(parseInt(hex||unicode,16)):({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v'} as Record<string,string>)[char]??char);
 const payload=JSON.parse(decoded),rows=payload[0];if(!Array.isArray(rows))throw new Error('Lista pública não reconhecida.');
 return rows.filter((row:any)=>Array.isArray(row)&&typeof row[0]==='string'&&typeof row[2]==='string'&&typeof row[3]==='string').map((row:any)=>({id:driveId(row[0]),name:row[2].slice(0,250),mime:row[3],...(Number.isSafeInteger(Number(row[13]))&&Number(row[13])>0?{size:Number(row[13])}:{})})).filter((row:PublicDriveItem)=>row.mime==='application/vnd.google-apps.folder'||/^(image|audio|video)\//.test(row.mime)).slice(0,200);
}
export async function readBounded(response:Response,max:number){
 if(!response.ok)throw new Error(`Drive respondeu HTTP ${response.status}. O arquivo precisa estar liberado para download.`);
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new Error(`Arquivo excede o limite de ${Math.round(max/1024/1024)} MB para esta operação.`);}
 const reader=response.body?.getReader();if(!reader)throw new Error('Resposta sem conteúdo.');const parts:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('Conteúdo excede o limite permitido.');parts.push(value);}}catch(e){await reader.cancel();throw e;}
 const all=new Uint8Array(size);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}return all;
}

export function toBase64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);}
export async function publicThumbnail(id:string,large=false){
 const response=await fetch(`https://lh3.googleusercontent.com/d/${driveId(id)}=w${large?1920:320}`,{credentials:'omit',signal:AbortSignal.timeout(20000)});
 const mime=(response.headers.get('content-type')||'').split(';')[0];
 if(!/^image\/(jpeg|png|webp|gif)$/.test(mime))throw new Error('Prévia indisponível para este arquivo.');
 const bytes=await readBounded(response,large?8*1024*1024:2*1024*1024);
 return {mime,base64:toBase64(bytes),bytes:bytes.length};
}
export async function listPublicFolder(id:string){const response=await fetch(`https://drive.google.com/drive/folders/${driveId(id)}`,{credentials:'omit',signal:AbortSignal.timeout(25000)});const bytes=await readBounded(response,4*1024*1024);return parsePublicFolder(new TextDecoder().decode(bytes));}
export async function downloadPublicMedia(id:string,name:string,mime:string){
 if(!/^(image|video|audio)\/[a-z0-9.+-]+$/i.test(mime))throw new Error('Tipo de mídia inválido.');
 const response=await fetch(`https://drive.usercontent.google.com/download?id=${driveId(id)}&export=download&confirm=t`,{credentials:'omit',signal:AbortSignal.timeout(60000)});
 const bytes=await readBounded(response,MAX_MEDIA_BYTES);const type=response.headers.get('content-type')||'';
 if(/text\/html|application\/json/.test(type)||new TextDecoder().decode(bytes.slice(0,100)).trimStart().startsWith('<!DOCTYPE'))throw new Error('O Drive retornou uma página de permissão/confirmação. Abra o arquivo no Drive; nenhum conteúdo foi importado.');
 let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return {name:name.replace(/[\\/\x00-\x1f]/g,'_').slice(0,180),mime,base64:btoa(binary),bytes:bytes.length};
}
