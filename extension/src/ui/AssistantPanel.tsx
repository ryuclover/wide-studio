import { useEffect, useRef, useState } from 'preact/hooks';
import type { EditorContext } from '../types/context';
import type { EditPlan, PreparedPlan, OperationResult } from '../types/commands';
import type { ExtensionSettings } from '../storage';
import type { ProjectSnapshot } from '../types/snapshot';
import { SettingsModal } from './components/SettingsModal';

export function AssistantPanel() {
  const [context,setContext]=useState<EditorContext|null>(null), [snapshot,setSnapshot]=useState<ProjectSnapshot|null>(null);
  const [settings,setSettings]=useState<ExtensionSettings>({provider:'mock',nimModel:'',autoApplyQuickPlans:false});
  const [config,setConfig]=useState(false), [busy,setBusy]=useState(false), [prompt,setPrompt]=useState(''), [error,setError]=useState('');
  const [entries,setEntries]=useState<{role:'user'|'assistant';text:string}[]>([]);
  const [review,setReview]=useState<{plan:EditPlan;preparedPlan:PreparedPlan}|null>(null);
  const lock=useRef(false), project=useRef<string|null>(null), serial=useRef(0);
  const api=async(message:Record<string,unknown>)=>{
    const raw=new URLSearchParams(window.location.search).get('editorTabId'), id=Number(raw);
    if(!raw || !Number.isSafeInteger(id) || id<=0) throw new Error('Abra o chat pela aba Edição assistida do editor.');
    const response=await chrome.runtime.sendMessage({...message,editorTabId:id});
    if(!response?.success) throw new Error(response?.error || 'Não foi possível conectar.');
    return response.data;
  };
  const refresh=async()=>{
    const ctx:EditorContext=await api({type:'SW_GET_CONTEXT'});
    if(project.current!==ctx.project.id){serial.current++;setEntries([]);setReview(null);setSnapshot(null);project.current=ctx.project.id;}
    setContext(ctx);
    try{const snap=await api({type:'SW_GET_SNAPSHOT'});if(project.current===ctx.project.id)setSnapshot(snap);}catch{setSnapshot(null);}
    return ctx;
  };
  useEffect(()=>{
    void refresh().catch(e=>setError(String(e)));
    void api({type:'SW_GET_SETTINGS'}).then(setSettings).catch(e=>setError(String(e)));
    const timer=setInterval(()=>{if(!lock.current)void refresh().catch(e=>{setContext(null);setReview(null);setError(String(e));});},4000);
    return ()=>{clearInterval(timer);serial.current++;};
  },[]);
  const say=(text:string)=>setEntries(old=>[...old.slice(-39),{role:'assistant',text}]);
  const submit=async(event:Event)=>{
    event.preventDefault();if(lock.current || !prompt.trim())return;
    lock.current=true;setBusy(true);setError('');setReview(null);
    const request=prompt.trim();
    try{
      const previousProject=project.current;
      const ctx=await refresh(), ticket=serial.current;
      setEntries(old=>[...old.slice(-39),{role:'user',text:request}]);setPrompt('');
      const history=previousProject===ctx.project.id?entries.slice(-8).map(entry=>({role:entry.role,content:entry.text.slice(0,2000)})):[];
      const response=await api({type:'SW_PROCESS_PROMPT',prompt:request,expectedProjectId:ctx.project.id,history});
      const now:EditorContext=await api({type:'SW_GET_CONTEXT'});
      if(ticket!==serial.current || now.project.id!==ctx.project.id)throw new Error('O projeto mudou durante o pedido. Envie novamente.');
      if(response.type==='plan'){setReview({plan:response.plan,preparedPlan:response.preparedPlan});say(response.plan.summary || 'Revise a ação antes de aplicar.');}
      else say(response.question || response.message || 'Reformule o pedido.');
    }catch(e){setError(String(e));}finally{lock.current=false;setBusy(false);}
  };
  const apply=async()=>{
    if(lock.current || !review)return;
    lock.current=true;setBusy(true);setError('');const selected=review;setReview(null);
    try{
      const results:OperationResult[]=await api({type:'SW_APPLY_PLAN',plan:selected.plan});
      if(results.length!==1 || results[0].status!=='verified')throw new Error(results[0]?.error || 'Resultado não confirmado. Confira o editor antes de repetir.');
      say('Ação aplicada e confirmada no editor.');await refresh();
    }catch(e){setError(String(e));}finally{lock.current=false;setBusy(false);}
  };
  return <main className="assistant">
    <header><span className="mode">{settings.provider==='nim'?'NVIDIA NIM':'Modo local · sem IA'}</span><button onClick={()=>setConfig(true)} disabled={busy}>Configurar IA</button></header>
    <details className="context"><summary>Contexto do projeto {context?'conectado':'indisponível'}</summary>
      {context && <><p>{context.project.name} · {context.clips.length} clipes · {context.selectedClipIds.length} selecionados</p><p>{snapshot?`${snapshot.tracks.length} camadas observadas`:'Camadas: leitura interna indisponível'} · posição: frame {context.composition.currentPlayheadFrame}</p><p>Ações disponíveis: {context.capabilities.includes('seek')?'Mover posição de reprodução':'nenhuma edição habilitada'}</p><p>Leitura: cena, FPS, posição, clipes, tempos conhecidos e seleção. Sem acesso confirmado ao áudio bruto, pixels, silêncio ou busca de imagens.</p></>}
      <button disabled={busy} onClick={()=>void refresh().catch(e=>setError(String(e)))}>Atualizar contexto</button>
    </details>
    <section className="conversation" aria-label="Conversa" aria-live="polite" aria-busy={busy}>
      {!entries.length && <div className="welcome"><h1>Edição assistida</h1><p>Descreva o que você quer fazer. O assistente usa o contexto do projeto e oferece ações disponíveis para revisão.</p><button onClick={()=>setPrompt('Vá para o segundo 10')}>Ir para o segundo 10</button><p className="muted">Cortar silêncio e buscar/inserir imagens são próximas integrações. Ainda não executam neste chat.</p></div>}
      {entries.map((entry,index)=><article key={index} className={entry.role}><strong>{entry.role==='user'?'Você':'Assistente'}</strong><p>{entry.text}</p></article>)}
      {review && <div className="review"><strong>Revisar ação</strong>{review.preparedPlan.operations.map(op=><p key={op.operationId}>{op.command}: {JSON.stringify(op.args)}</p>)}<div><button disabled={busy} onClick={()=>setReview(null)}>Descartar</button><button className="primary" disabled={busy} onClick={()=>void apply()}>Aplicar no editor</button></div></div>}
      {busy && <p role="status">Processando…</p>}{error && <p className="error" role="alert">{error}</p>}
    </section>
    <form onSubmit={submit}><label htmlFor="request">Seu pedido</label><textarea id="request" value={prompt} maxLength={4000} disabled={busy} placeholder="Ex.: vá para o segundo 10" onInput={e=>setPrompt(e.currentTarget.value)}/><button className="primary" disabled={busy || !context || !prompt.trim()} type="submit">{busy?'Aguarde…':'Enviar pedido'}</button></form>
    {config && <SettingsModal currentSettings={settings} onClose={()=>setConfig(false)} onSave={async values=>setSettings(await api({type:'SW_SAVE_SETTINGS',settings:values}))}/>}
  </main>;
}
