import {useEffect,useRef,useState} from 'preact/hooks';
import {extractionUrl} from '../extract/client';
import type {WebJob} from '../extract/jobs';
import {websiteOrigins} from '../extract/websites';
async function api(message:Record<string,unknown>){const id=Number(new URLSearchParams(location.search).get('editorTabId'));if(!Number.isSafeInteger(id)||id<=0)throw new Error('Abra Extrair dentro do editor.');const r=await chrome.runtime.sendMessage({...message,editorTabId:id});if(!r?.success)throw new Error(r?.error||'Não foi possível adicionar o vídeo.');return r.data;}
const errorText=(e:unknown)=>String(e).replace(/^(?:Error:\s*)+/,'');
export function Extract(){
 const [link,setLink]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');const lock=useRef(false);
 const serial=useRef(0),alive=useRef(true);
 const watch=async(job:WebJob,ticket:number)=>{let failures=0;
  while(alive.current&&ticket===serial.current){
   setLink(job.url);
   if(job.phase==='done'){setStatus(`${job.result?.name||job.name||'Vídeo'} adicionado à Biblioteca.`);setError('');lock.current=false;setBusy(false);return;}
   if(job.phase==='error'||job.phase==='unknown'){setStatus('');setError(job.error||'Importação interrompida.');lock.current=false;setBusy(false);return;}
   lock.current=true;setBusy(true);setError('');setStatus(job.phase==='downloading'?`Transferindo para o editor… ${((job.bytes||0)/1024/1024).toFixed(1)} MB`:job.phase==='importing'?'Arquivo recebido. Adicionando à Biblioteca…':(job.detail||'Preparando o vídeo no serviço… Você pode continuar editando.'));
   await new Promise(r=>setTimeout(r,700));if(!alive.current||ticket!==serial.current)return;
   try{const next=await api({type:'SW_WEB_STATUS',jobId:job.id});if(!next)throw new Error('Importação não encontrada.');job=next;failures=0;}
   catch(e){if(++failures>=5){setStatus('');setError('Não foi possível consultar o progresso. Reabra a aba Extrair para reconectar.');lock.current=false;setBusy(false);return;}}
  }
 };
 useEffect(()=>{alive.current=true;const ticket=serial.current;void api({type:'SW_WEB_STATUS'}).then(job=>{if(job&&alive.current&&ticket===serial.current)void watch(job,ticket);}).catch(()=>{});return()=>{alive.current=false;serial.current++;};},[]);
 const run=async()=>{if(lock.current)return;let url:string,origins:string[];try{url=extractionUrl(link);origins=websiteOrigins(url);}catch(e){setError(errorText(e));return;}
  lock.current=true;setBusy(true);setStatus('Preparando e importando o vídeo… Vídeos longos podem levar alguns minutos.');setError('');
  const ticket=++serial.current;
  try{if(!await chrome.permissions.request({origins}))throw new Error('Permita o acesso ao site para adicionar o vídeo.');const job=await api({type:'SW_WEB_IMPORT',url,requestId:crypto.randomUUID()});await watch(job,ticket);}
  catch(e){if(alive.current&&ticket===serial.current){setStatus('');setError(errorText(e).includes('message channel closed')?'A conexão foi interrompida. Reabra Extrair para consultar a importação.':errorText(e));}}
  finally{if(alive.current&&ticket===serial.current){lock.current=false;setBusy(false);}}

 };
 return <main className="extract-browser"><header><strong>Extrair</strong><p>YouTube · Instagram · X — sem chave</p></header>
  <form onSubmit={e=>{e.preventDefault();void run();}}>
   <label htmlFor="extract-link">Link do vídeo</label><input id="extract-link" type="url" placeholder="Cole o link aqui…" value={link} onInput={e=>{setLink(e.currentTarget.value);setError('');setStatus('');}} disabled={busy} required/>
   <button className="primary" disabled={busy||!link.trim()}>{busy?'Adicionando…':'Adicionar à Biblioteca'}</button>
  </form>
  <p className="extract-note">Direto na Biblioteca. YouTube: até 30 minutos e 200 MB, qualidade automática até 480p, com áudio. Instagram e X: até 20 MB.</p>
  <p className="extract-note">O link é enviado ao TubDown (YouTube), Snapinsta (Instagram) ou FxTwitter (X). YouTube e Instagram usam abas temporárias em segundo plano, fechadas ao terminar.</p>
  <div className="extract-feedback" aria-live="polite">{status&&<p role="status">{busy&&'◌ '}{status}</p>}{error&&<p role="alert">{error}</p>}</div>
 </main>;
}
