import {useRef,useState} from 'preact/hooks';
import {extractionUrl} from '../extract/client';
import {websiteOrigins} from '../extract/websites';
async function api(message:Record<string,unknown>){const id=Number(new URLSearchParams(location.search).get('editorTabId'));if(!Number.isSafeInteger(id)||id<=0)throw new Error('Abra Extrair dentro do editor.');const r=await chrome.runtime.sendMessage({...message,editorTabId:id});if(!r?.success)throw new Error(r?.error||'Não foi possível adicionar o vídeo.');return r.data;}
const errorText=(e:unknown)=>String(e).replace(/^(?:Error:\s*)+/,'');
export function Extract(){
 const [link,setLink]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');const lock=useRef(false);
 const run=async()=>{if(lock.current)return;let url:string,origins:string[];try{url=extractionUrl(link);origins=websiteOrigins(url);}catch(e){setError(errorText(e));return;}
  lock.current=true;setBusy(true);setStatus('Preparando e importando o vídeo… Vídeos longos podem levar alguns minutos.');setError('');
  try{if(!await chrome.permissions.request({origins}))throw new Error('Permita o acesso ao site para adicionar o vídeo.');const result=await api({type:'SW_WEB_IMPORT',url});if(!result.imported)throw new Error('Importação não confirmada. Confira a Biblioteca antes de repetir.');setStatus(`${result.name} adicionado à Biblioteca.`);}
  catch(e){setStatus('');setError(errorText(e));}finally{lock.current=false;setBusy(false);}
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
