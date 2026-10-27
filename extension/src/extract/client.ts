export const EXTRACT_BASE='http://127.0.0.1:47831';
export const EXTRACT_ORIGIN='http://127.0.0.1/*';
export const EXTRACT_MAX_BYTES=20*1024*1024;
export function extractionUrl(value:unknown){
 if(typeof value!=='string'||value.length>2048)throw new Error('Cole um link de vídeo válido.');
 const u=new URL(value.trim());if(u.protocol!=='https:'||u.username||u.password||u.port)throw new Error('Use um link HTTPS de YouTube, Instagram ou X.');
 const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
 if(['youtube.com','youtu.be'].includes(host)){
  const id=host==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):/^\/(shorts|live|embed)\//.test(u.pathname)?u.pathname.split('/').filter(Boolean).at(-1):'';
  if(id&&/^[\w-]{11}$/.test(id))return `https://www.youtube.com/watch?v=${id}`;
 }
 if(host==='instagram.com'){const m=u.pathname.match(/^\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]{3,80})\/?$/);if(m)return `https://www.instagram.com/p/${m[1]}/`;}
 if(['twitter.com','x.com'].includes(host)){const m=u.pathname.match(/^\/(?:\w{1,30}|i\/web)\/status\/(\d{5,30})\/?(?:video\/\d+)?$/);if(m)return `https://x.com/i/status/${m[1]}`;}
 throw new Error('Use um vídeo individual do YouTube, um Reel/post do Instagram ou um post do X.');
}
export function extractionRange(start:unknown,end:unknown){if(typeof start!=='number'||typeof end!=='number'||!Number.isFinite(start+end)||start<0||end<=start||end-start>90)throw new Error('Escolha um trecho de até 90 segundos, com fim maior que início.');return {start,end};}
export async function helperRequest(token:string,path:string,method='GET',body?:unknown){
 if(!/^[\w-]{32,100}$/.test(token))throw new Error('Inicie o serviço de vídeo e tente novamente.');
 if(!/^\/(health|jobs(?:\/[a-f0-9]{32}(?:\/media)?)?)$/.test(path))throw new Error('Rota inválida.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const r=await fetch(EXTRACT_BASE+path,{method,headers:{Authorization:`Bearer ${token}`,...body?{'Content-Type':'application/json'}:{}},body:body?JSON.stringify(body):undefined,signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(String(e.error||'O auxiliar recusou a requisição.'));}
  if(path.endsWith('/media')){
   if(r.headers.get('content-type')?.split(';')[0]!=='video/mp4')throw new Error('O auxiliar não entregou um MP4.');
   if(Number(r.headers.get('content-length'))>EXTRACT_MAX_BYTES)throw new Error('Trecho maior que 20 MB.');
   const reader=r.body?.getReader();if(!reader)throw new Error('Arquivo vazio.');const chunks:Uint8Array[]=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>EXTRACT_MAX_BYTES){await reader.cancel();throw new Error('Trecho maior que 20 MB.');}chunks.push(value);}
   if(size<100)throw new Error('MP4 vazio ou inválido.');const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {base64:btoa(binary),bytes:size};
  }
  return await r.json();
 }catch(e){if(e instanceof TypeError||e instanceof DOMException&&e.name==='AbortError')throw new Error('Auxiliar local indisponível. Execute INICIAR.cmd na pasta auxiliar-extrair.');throw e;}finally{clearTimeout(timer);}
}
