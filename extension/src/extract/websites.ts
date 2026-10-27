import {YOUTUBE_MAX_SECONDS,YOUTUBE_MAX_BYTES,EXTRACT_CHUNK_BYTES} from './limits';
import {EXTRACT_MAX_BYTES,extractionUrl} from './client';
export function websiteOrigins(source:string){const u=new URL(extractionUrl(source));if(u.hostname==='x.com')return ['https://api.fxtwitter.com/*','https://video.twimg.com/*'];if(u.hostname==='www.instagram.com')return ['https://snapinsta.ai/*','https://d.rapidcdn.app/*'];return ['https://tubdown.com/*'];}
export function websiteMediaUrl(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='video.twimg.com'&&u.pathname.endsWith('.mp4')||u.hostname==='d.rapidcdn.app'&&u.pathname==='/v2'||u.hostname==='tubdown.com'&&/^\/api\/jobs\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/file$/.test(u.pathname)&&!u.search))throw new Error('Link de download não autorizado.');return u.href;}
async function bounded(r:Response,max:number){if(Number(r.headers.get('content-length'))>max)throw new Error('Vídeo acima de 20 MB.');const reader=r.body?.getReader();if(!reader)throw new Error('Resposta vazia.');const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('Arquivo acima do limite permitido.');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}const out=new Uint8Array(size);let p=0;for(const c of chunks){out.set(c,p);p+=c.length;}return out;}
export function twitterVideo(data:any,id:string){if(data?.code!==200||data.tweet?.id!==id)throw new Error('O serviço não encontrou esse post público.');const videos=data.tweet?.media?.videos;if(!Array.isArray(videos)||videos.length!==1)throw new Error('Use um post com um único vídeo público.');return {url:websiteMediaUrl(videos[0].url),name:`X-${id}.mp4`};}
export function youtubeQuality(info:any,id:string){
 if(info?.id!==id||!Number.isFinite(info.duration)||info.duration<=0)throw new Error('O serviço não informou uma duração válida para este vídeo.');
 if(info.duration>YOUTUBE_MAX_SECONDS)throw new Error('Use um vídeo público do YouTube de até 30 minutos.');
 const options=Array.isArray(info.video)?info.video.filter((v:any)=>v?.format==='MP4'&&Number.isInteger(v.quality)&&v.quality>=144&&v.quality<=480&&(!v.size||Number.isFinite(v.size)&&v.size>0&&v.size<=YOUTUBE_MAX_BYTES)):[];
 options.sort((a:any,b:any)=>b.quality-a.quality);if(!options.length)throw new Error('O serviço não oferece MP4 de até 480p e 200 MB para esse vídeo.');return options[0].quality as number;
}
export async function resolveYoutube(source:string){
 const url=extractionUrl(source),id=new URL(url).searchParams.get('v')!;
 const tab=await chrome.tabs.create({url:'https://tubdown.com/',active:false});if(!tab.id)throw new Error('Nao foi possivel abrir o servico de YouTube.');
 try{const deadline=Date.now()+300000;let submitted=false,quality:number|undefined,selected=false;
 while(Date.now()<deadline){
  const current=await chrome.tabs.get(tab.id);if(current.url&&current.url!=='about:blank'&&!current.url.startsWith('https://tubdown.com/'))throw new Error('O servico redirecionou para outro site.');
  if(!current.url||current.url==='about:blank'||current.status!=='complete'){await new Promise(r=>setTimeout(r,500));continue;}
  const [probe]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(url:string,submit:boolean,quality:number|null,select:boolean)=>{
   if(document.querySelector('iframe[src*="challenges.cloudflare.com"],.g-recaptcha'))return {blocked:true};
   for(const selector of ['#dl-error','#r-job-error']){const e=document.querySelector<HTMLElement>(selector);if(e&&!e.hidden&&e.textContent?.trim())return {error:true};}
   const done=document.querySelector<HTMLElement>('#r-done'),link=document.querySelector<HTMLAnchorElement>('#r-done-link');
   if(done&&!done.hidden&&link?.getAttribute('href'))return {ready:link.href,name:document.querySelector('#r-done-name')?.textContent};
   const field=document.querySelector<HTMLInputElement>('#dl-url'),form=document.querySelector<HTMLFormElement>('#dl-form');
   if(submit&&field&&form){field.value=url;field.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();return {submitted:true};}
   const result=document.querySelector<HTMLElement>('#dl-result');if(!result||result.hidden)return {};
   const rows=Array.from(document.querySelectorAll<HTMLElement>('#r-list-video > div'));
   if(select&&quality!==null){const row=rows.find(e=>parseInt(e.querySelector('[data-f="label"]')?.textContent||'')===quality),button=row?.querySelector<HTMLButtonElement>('[data-f="btn"]');
    if(!button||button.disabled)return {};
    // Capture the prepared file in memory instead of letting the site save it to Downloads.
    document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest('a'):null;if(target&&target.origin===location.origin&&/^\/api\/jobs\/[a-f0-9-]{36}\/file$/.test(target.pathname))event.preventDefault();},true);
    button.click();return {selected:true};
   }
   const parts=(document.querySelector('#r-duration')?.textContent||'').trim().split(':').map(Number);const duration=parts.reduce((n,v)=>n*60+v,0);
   const video=rows.map(e=>{const size=e.querySelector('[data-f="size"]')?.textContent||'',amount=Number(size.replace(/[^0-9.]/g,''));return {quality:parseInt(e.querySelector('[data-f="label"]')?.textContent||''),format:'MP4',size:amount?amount*(size.includes('GB')?1024*1024*1024:1024*1024):0};});return {duration,video};
  },args:[url,!submitted,quality??null,quality!==undefined&&!selected]});const data=probe.result as any;
  if(data?.blocked)throw new Error('O site pediu verificacao humana. Nao foi possivel concluir automaticamente.');
  if(data?.error)throw new Error('O TubDown nao conseguiu preparar esse video. Tente outro link publico.');
  if(data?.ready){const name=String(data.name||'YouTube').replace(/[\\/\x00-\x1f:*?"<>|]/g,'_').slice(0,160).replace(/\.mp4$/i,'')+'.mp4';return {url:websiteMediaUrl(data.ready),name};}
  if(data?.submitted)submitted=true;if(data?.selected)selected=true;
  if(quality===undefined&&data?.video?.length&&Number.isFinite(data.duration)&&data.duration>0)quality=youtubeQuality({id,duration:data.duration,video:data.video},id);
  await new Promise(r=>setTimeout(r,700));
 }throw new Error('O servico de YouTube demorou demais. Tente novamente mais tarde.');
 }finally{await chrome.tabs.remove(tab.id).catch(()=>{});}
}
export async function resolveWebsite(source:string){const url=extractionUrl(source);websiteOrigins(url);
 if(new URL(url).hostname==='www.youtube.com')return resolveYoutube(url);
 if(new URL(url).hostname==='x.com'){const id=new URL(url).pathname.split('/').at(-1)!;const response=await fetch(`https://api.fxtwitter.com/status/${id}`,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('O serviço do X está indisponível. Tente novamente mais tarde.');let data;try{data=JSON.parse(new TextDecoder().decode(await bounded(response,1024*1024)));}catch{throw new Error('Resposta inválida do serviço do X.');}return twitterVideo(data,id);}
 const site='https://snapinsta.ai/';
 // Submit the normal page form; remote page scripts stay inside their own website.
 const tab=await chrome.tabs.create({url:site,active:false});if(!tab.id)throw new Error('Não foi possível abrir o serviço de Instagram.');
 try{const began=Date.now();let submitted=false;while(Date.now()-began<45000){
  const current=await chrome.tabs.get(tab.id);if(current.url&&current.url!=='about:blank'&&!current.url.startsWith(site))throw new Error('O serviço redirecionou para outro site. Extração interrompida.');
  if(!current.url||current.url==='about:blank'||current.status!=='complete'){await new Promise(r=>setTimeout(r,500));continue;}
  const [probe]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(source:string,submit:boolean)=>{
   if(document.querySelector('iframe[src*="challenges.cloudflare.com"],.g-recaptcha'))return {blocked:true};
   const a=Array.from(document.querySelectorAll<HTMLAnchorElement>('#download a[href]')).filter(a=>a.href.startsWith('https://d.rapidcdn.app/v2?'));
   if(a.length)return {urls:a.map(a=>a.href)};
   const error=document.querySelector('#alert.show')?.textContent?.trim();if(error)return {error};
   const field=document.querySelector<HTMLInputElement>('#url'),form=document.forms.namedItem('formurl');
   if(submit&&field&&form){field.value=source;field.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();return {submitted:true};}return {};
  },args:[url,!submitted]});const data=probe.result as any;
  if(data?.blocked)throw new Error('O site pediu verificação humana. Não foi possível concluir automaticamente.');
  if(data?.error)throw new Error('O site não conseguiu extrair este link. Confira se o vídeo é público.');
  if(data?.urls?.length){if(data.urls.length!==1)throw new Error('O post contém várias mídias. Use um vídeo individual.');return {url:websiteMediaUrl(data.urls[0]),name:`Instagram-${new URL(url).pathname.split('/')[2]}.mp4`};}
  if(data?.submitted)submitted=true;await new Promise(r=>setTimeout(r,700));
 }throw new Error('O site de download demorou demais. Tente novamente.');
 }finally{await chrome.tabs.remove(tab.id).catch(()=>{});}
}
export async function downloadWebsite(url:string){const r=await fetch(websiteMediaUrl(url),{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('O download foi recusado pelo site. Tente novamente.');const mime=(r.headers.get('content-type')||'').split(';')[0];if(!['video/mp4','application/octet-stream','binary/octet-stream'].includes(mime))throw new Error('O servidor não entregou um MP4.');const bytes=await bounded(r,EXTRACT_MAX_BYTES);if(bytes.length<100||String.fromCharCode(...bytes.subarray(4,8))!=='ftyp')throw new Error('O arquivo recebido não é um MP4 válido.');let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {base64:btoa(binary),mime:'video/mp4'};}

// Stream bounded pieces to the editor rather than putting an entire long video in one runtime message.
export async function transferWebsite(url:string,max:number,onChunk:(base64:string)=>Promise<void>){
 if(max!==EXTRACT_MAX_BYTES&&max!==YOUTUBE_MAX_BYTES)throw new Error('Limite de extração inválido.');
 const response=await fetch(websiteMediaUrl(url),{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw new Error('O download foi recusado pelo site. Tente novamente.');
 const mime=(response.headers.get('content-type')||'').split(';')[0];
 if(!['video/mp4','application/octet-stream','binary/octet-stream'].includes(mime))throw new Error('O servidor não entregou um MP4.');
 const reader=response.body?.getReader();if(!reader)throw new Error('Resposta vazia.');
 let total=0;const header:number[]=[];
 try{
  if(Number(response.headers.get('content-length'))>max)throw new Error(`Vídeo acima de ${max/1024/1024} MB.`);
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max)throw new Error(`Vídeo acima de ${max/1024/1024} MB.`);
   for(let i=0;i<value.length&&header.length<8;i++)header.push(value[i]);
   if(header.length===8&&String.fromCharCode(...header.slice(4,8))!=='ftyp')throw new Error('O arquivo recebido não é um MP4 válido.');
   for(let offset=0;offset<value.length;offset+=EXTRACT_CHUNK_BYTES){const bytes=value.subarray(offset,offset+EXTRACT_CHUNK_BYTES);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));await onChunk(btoa(binary));}
  }
  if(total<100)throw new Error('O arquivo recebido não é um MP4 válido.');return total;
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
