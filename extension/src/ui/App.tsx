import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { EditorContext } from '../types/context';
import type { OperationResult, UndoReceipt } from '../types/commands';
import { framesToSeconds } from '../commands/temporal';
import { parseTimeString } from '../adapter/selectors';
import { PointBackupSchema, type SavedPoint, type PointBook } from '../storage/points';

function Icon({ name }: { name: 'project' | 'navigate' | 'marker' | 'tools' | 'back' | 'next' | 'start' | 'refresh' | 'undo' }) {
  const paths: Record<string, ComponentChildren> = {
    project: <><path d="M2 5h5l2 2h7v8H2z"/><path d="M2 5V3h5l2 2"/></>,
    navigate: <><circle cx="9" cy="9" r="6.5"/><path d="M9 5v4l3 2"/></>,
    marker: <path d="M5 2h8v13l-4-3-4 3z"/>,
    tools: <><circle cx="5" cy="5" r="2.5"/><circle cx="5" cy="13" r="2.5"/><path d="M7 6.5 15 14M7 11.5 15 4"/></>,
    back: <><path d="M4 3v12M14 4l-8 5 8 5z"/></>,
    next: <><path d="M14 3v12M4 4l8 5-8 5z"/></>,
    start: <><path d="M3 3v12M14 4 6 9l8 5"/></>,
    refresh: <><path d="M14 6a6 6 0 1 0 1 6M14 2v4h-4"/></>,
    undo: <><path d="M3 3v5h5M3 8c2-5 11-5 12 2 0 3-2 5-5 5"/></>
  };
  return <svg aria-hidden="true" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{paths[name]}</svg>;
}
function position(frame: number, ctx: EditorContext | null) {
  if (!ctx) return '00:00:00.000';
  const seconds = framesToSeconds(frame, { numerator: ctx.composition.fpsNumerator, denominator: ctx.composition.fpsDenominator });
  const ms = Math.round(seconds * 1000), pad = (v: number, n=2) => String(v).padStart(n, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}
const pointSeconds = (point: SavedPoint) => framesToSeconds(point.frame, { numerator: point.fpsNumerator, denominator: point.fpsDenominator });
function pointPosition(point: SavedPoint) {
  return position(point.frame, { composition: { fpsNumerator: point.fpsNumerator, fpsDenominator: point.fpsDenominator } } as EditorContext);
}
export function App() {
  const [context, setContext] = useState<EditorContext | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [section, setSection] = useState<'navigate' | 'points' | 'tools' | 'project'>('navigate');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('00:00:10.000');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<UndoReceipt | null>(null);
  const [points, setPoints] = useState<SavedPoint[]>([]);
  const pointsVersion = useRef(0);
  const [pointsLoaded, setPointsLoaded] = useState(false);
  const [pointName, setPointName] = useState('');
  const [simple, setSimple] = useState(true);
  const busyRef = useRef(false), mounted = useRef(true), projectId = useRef<string | null>(null);
  const contextRef = useRef(context); contextRef.current = context;
  const targetRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const api = async (data: Record<string, unknown>) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) throw new Error('Abra este painel pela extensão no Chrome.');
    const tabParam = new URLSearchParams(window.location.search).get('editorTabId');
    const response = await chrome.runtime.sendMessage({ ...data, ...(tabParam ? { editorTabId: Number(tabParam) } : {}) });
    if (!response?.success) throw new Error(response?.error || 'Não foi possível conectar ao editor.');
    return response.data;
  };
  const refresh = async (manual=false) => {
    if (busyRef.current) return;
    try {
      const ctx: EditorContext = await api({ type: 'SW_GET_CONTEXT' });
      if (!mounted.current || busyRef.current) return;
      if (projectId.current !== ctx.project.id) {
        setPoints([]); setPointsLoaded(false); setUndo(null); setMessage(''); setError('');
        projectId.current = ctx.project.id;
      }
      setContext(ctx);
      try {
        const book: PointBook = await api({ type: 'SW_GET_POINTS', expectedProjectId: ctx.project.id });
        if (mounted.current && !busyRef.current && projectId.current === ctx.project.id) { pointsVersion.current = book.version; setPoints(book.points); setPointsLoaded(true); }
      } catch(e) { if (mounted.current && projectId.current === ctx.project.id) { setPointsLoaded(false); setMessage(`Pontos indisponíveis: ${String(e)}`); } return; }
      if (typeof ctx.simpleAppearance === 'boolean') setSimple(ctx.simpleAppearance);
      if (manual) { setError(''); setMessage('Projeto atualizado.'); }
    } catch (e) {
      if (!mounted.current || busyRef.current) return;
      setContext(null);
      if (manual) setError(String(e));
    } finally { if (mounted.current) setConnecting(false); }
  };
  const connectProject = async () => {
    if (busyRef.current) return;
    try { await api({type:'SW_CONNECT_PROJECT'}); await refresh(true); }
    catch(e) { setMessage(String(e)); }
  };
  useEffect(() => {
    mounted.current = true; void refresh();
    const timer = setInterval(() => { if (!busyRef.current) void refresh(); }, 3000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  const navigate = async (args: { frame?: number; deltaFrames?: number; seconds?: number; deltaSeconds?: number }) => {
    if (busyRef.current || !contextRef.current?.capabilities.includes('seek') || error) return;
    busyRef.current = true; setBusy(true); setError(''); setMessage(''); setUndo(null);
    try {
      const results: OperationResult[] = await api({ type: 'SW_NAVIGATE', expectedProjectId: contextRef.current.project.id, ...args });
      const result = results?.[0];
      if (results?.length !== 1 || result.status !== 'verified') throw new Error(result?.error || 'A posição não foi confirmada no editor.');
      setUndo(result.undoReceipt || null);
      const ctx: EditorContext = await api({ type: 'SW_GET_CONTEXT' });
      if (mounted.current) { setContext(ctx); setMessage('Posição atualizada.'); }
    } catch (e) { setError(String(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const goTo = () => {
    const seconds = parseTimeString(target);
    if (seconds === null) { setMessage('Use segundos ou hh:mm:ss.mmm, por exemplo 12.5 ou 00:00:12.500.'); targetRef.current?.focus(); return; }
    const ctx = contextRef.current;
    if (!ctx) return;
    void navigate({ seconds });
  };
  const undoNavigation = async () => {
    if (!undo || busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage('');
    try {
      const result = await api({ type: 'SW_UNDO_RECEIPT', receipt: undo });
      if (!result?.success) throw new Error(result?.error || 'Não foi possível voltar à posição anterior.');
      const ctx = await api({ type: 'SW_GET_CONTEXT' }); setContext(ctx); setMessage('Posição anterior restaurada.');
    } catch (e) { setError(String(e)); }
    finally { setUndo(null); busyRef.current = false; setBusy(false); }
  };
  const recover = async () => {
    if (busyRef.current) return;
    try { await api({ type: 'SW_CLEAR_TRANSACTION' }); setError(''); setUndo(null); setMessage('Conferência concluída. Você pode continuar.'); await refresh(); }
    catch (e) { setError(String(e)); }
  };
  const toggleAppearance = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { const result = await api({ type: 'SW_SET_APPEARANCE', simple: !simple }); setSimple(result.simple); }
    catch (e) { setMessage(`A aparência não foi alterada: ${String(e)}`); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const openSmartTool = async (tool: 'silenceRemover' | 'captionsGenerator') => {
    if (busyRef.current || !context) return;
    busyRef.current = true; setBusy(true); setMessage(''); setError('');
    try {
      const res = await api({ type: 'SW_OPEN_SMART_TOOL', tool });
      if (res?.success) {
        setMessage(tool === 'silenceRemover' ? 'Remover Silêncios aberto no editor.' : 'Gerador de Legendas aberto no editor.');
      } else {
        throw new Error(res?.error || 'Não foi possível abrir a ferramenta inteligente.');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      busyRef.current = false; setBusy(false);
    }
  };
  const addPoint = async () => {
    if (!context || !pointsLoaded || points.length >= 200 || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const fresh: EditorContext = await api({ type: 'SW_GET_CONTEXT' });
      if (fresh.project.id !== projectId.current) throw new Error('O projeto mudou. Atualize o painel antes de salvar um ponto.');
      setContext(fresh);
      const frame = fresh.composition.currentPlayheadFrame;
      const seconds = framesToSeconds(frame, { numerator: fresh.composition.fpsNumerator, denominator: fresh.composition.fpsDenominator });
      if (points.some(p => Math.abs(pointSeconds(p)-seconds)<0.000001)) { setMessage('Esta posição já está nos seus pontos.'); return; }
      const next: SavedPoint[] = [...points, { id: crypto.randomUUID(), frame, fpsNumerator: fresh.composition.fpsNumerator, fpsDenominator: fresh.composition.fpsDenominator, name: pointName.trim() || `Ponto ${points.length + 1}` }].sort((a,b)=>pointSeconds(a)-pointSeconds(b));
      const book: PointBook = await api({ type: 'SW_SAVE_POINTS', expectedProjectId: fresh.project.id, expectedVersion: pointsVersion.current, points: next });
      pointsVersion.current = book.version; setPoints(book.points);
      setPointName(''); setMessage('Ponto salvo no navegador.');
    } catch(e) { setMessage(`Não foi possível salvar o ponto: ${String(e)}`); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const removePoint = async (id: string) => {
    if (!context || !pointsLoaded || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const book: PointBook = await api({ type: 'SW_SAVE_POINTS', expectedProjectId: context.project.id, expectedVersion: pointsVersion.current, points: points.filter(p=>p.id!==id) });
      pointsVersion.current = book.version; setPoints(book.points); setMessage('Ponto removido.');
    } catch(e) { setMessage(String(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const exportPoints = () => {
    const payload = { format: 'wide-studio-points', version: 1, projectName: context?.project.name || '', points };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'wide-studio-pontos.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const importPoints = async (file?: File) => {
    if (!file || !context || !pointsLoaded || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      if (file.size>200000) throw new Error('Arquivo de pontos muito grande.');
      const backup = PointBackupSchema.parse(JSON.parse(await file.text()));
      const merged = [...points];
      for (const point of backup.points) if (!merged.some(p=>p.id===point.id || Math.abs(pointSeconds(p)-pointSeconds(point))<0.000001)) merged.push(point);
      if (merged.length>200) throw new Error('Limite de 200 pontos atingido.');
      const book: PointBook = await api({type:'SW_SAVE_POINTS',expectedProjectId:context.project.id,expectedVersion:pointsVersion.current,points:merged.sort((a,b)=>pointSeconds(a)-pointSeconds(b))});
      pointsVersion.current=book.version;setPoints(book.points);setMessage('Pontos importados e salvos neste projeto.');
    } catch(e) {setMessage(`Não foi possível importar: ${String(e)}`);}
    finally {busyRef.current=false;setBusy(false);if(importRef.current)importRef.current.value='';}
  };
  const frame = context?.composition.currentPlayheadFrame || 0;
  const canNavigate = !!context?.capabilities.includes('seek') && !busy && !error;
  const labels = { navigate: 'Navegação', points: 'Pontos', tools: 'Ferramentas', project: 'Projeto' } as const;
  return <div className="studio-shell">
    <header className="studio-header"><div className="wordmark"><span className="brand-symbol" aria-hidden="true">W</span><strong>Wide Studio</strong><span className="edition">Editor</span></div><button className="icon-button" aria-label="Atualizar projeto" title="Atualizar projeto" disabled={busy} onClick={()=>void refresh(true)}><Icon name="refresh"/></button></header>
    <div className="project-strip"><span className={`connection-dot ${context ? 'online' : ''}`} aria-hidden="true"/><span className="project-name" title={context?.project.name}>{connecting ? 'Conectando ao editor…' : context?.project.name || 'Nenhum projeto conectado'}</span><span className="connection-label">{context ? 'Conectado' : 'Offline'}</span></div>
    <div className="studio-body">
      <nav className="tool-rail" aria-label="Seções do painel">{(['navigate','points','tools','project'] as const).map(item=><button key={item} aria-current={section===item ? 'page' : undefined} onClick={()=>setSection(item)}><Icon name={item==='points'?'marker':item}/><span>{labels[item]}</span>{item==='points' && points.length>0 && <small>{points.length}</small>}</button>)}</nav>
      <main className="workspace">
        <div className="section-heading"><h1>{labels[section]}</h1><span>{section==='navigate'?'Linha do tempo':section==='points'?'Salvos neste navegador':section==='tools'?'Áudio e automação':'Propriedades'}</span></div>
        {!context && <section className="empty-state"><Icon name="project"/><h2>Abra seu projeto</h2><p>Abra um projeto no wide.video e conecte os controles. A conexão exibe as propriedades do projeto.</p><a className="button primary" href="https://wide.video/app/1.7.12/" target="_blank" rel="noreferrer">Abrir editor</a><button className="text-button" onClick={()=>void connectProject()}>Conectar a este projeto</button></section>}
        {context && section==='navigate' && <>
          <section className="transport-panel" aria-label="Posição de reprodução"><span className="eyebrow">Posição atual</span><output className="time-display" aria-label="Posição atual">{position(frame, context)}</output><span className="frame-readout">Frame {frame} <span>•</span> {context.composition.fpsNumerator/context.composition.fpsDenominator} fps</span>
            <div className="transport-buttons"><button aria-label="Ir ao início" title="Ir ao início" disabled={!canNavigate} onClick={()=>void navigate({frame:0})}><Icon name="start"/></button><button aria-label="Voltar um frame" title="Voltar um frame" disabled={!canNavigate || frame===0} onClick={()=>void navigate({deltaFrames:-1})}><Icon name="back"/></button><span className="transport-divider"/><button aria-label="Avançar um frame" title="Avançar um frame" disabled={!canNavigate} onClick={()=>void navigate({deltaFrames:1})}><Icon name="next"/></button></div>
          </section>
          <section className="control-section"><h2>Ir para uma posição</h2><form className="time-form" onSubmit={e=>{e.preventDefault();goTo();}}><label className="sr-only" for="seek-position">Tempo de destino</label><input id="seek-position" ref={targetRef} value={target} onInput={e=>setTarget(e.currentTarget.value)} disabled={!canNavigate} spellcheck={false} inputMode="decimal" aria-describedby="time-help"/><button className="primary" type="submit" disabled={!canNavigate}>Ir</button></form><p id="time-help" className="hint">Segundos ou hh:mm:ss.mmm</p><div className="jump-buttons"><button disabled={!canNavigate || frame===0} onClick={()=>void navigate({deltaSeconds:-1})}>−1 segundo</button><button disabled={!canNavigate} onClick={()=>void navigate({deltaSeconds:1})}>+1 segundo</button><button disabled={!canNavigate} onClick={()=>void navigate({seconds:10})}>Ir para 10s</button></div></section>
          <section className="control-section"><div className="subheading"><h2>Acesso rápido</h2><span>Sem sair do editor</span></div><button className="wide-action" disabled={!canNavigate || !pointsLoaded || points.length>=200} onClick={addPoint}><Icon name="marker"/><span>Salvar posição nos pontos</span><span className="action-key">+</span></button><button className="wide-action" disabled={!undo || busy || !!error} onClick={()=>void undoNavigation()}><Icon name="undo"/><span>Voltar à posição anterior</span></button></section>
        </>}
        {context && section==='points' && <><p className="section-description">Guarde posições para voltar a elas rapidamente. Os pontos ficam salvos neste navegador, mesmo depois de fechar o painel. Exporte uma cópia para levar a outro computador.</p><form className="point-form" onSubmit={e=>{e.preventDefault();addPoint();}}><label className="sr-only" for="point-name">Nome do ponto</label><input id="point-name" placeholder="Nome do ponto" maxLength={60} value={pointName} disabled={!canNavigate} onInput={e=>setPointName(e.currentTarget.value)}/><button className="primary" disabled={!canNavigate || !pointsLoaded || points.length>=200}>Adicionar ponto</button></form>{points.length===0?<div className="points-empty"><Icon name="marker"/><h2>Nenhum ponto salvo</h2><p>Vá até uma posição e adicione seu primeiro ponto.</p></div>:<ol className="point-list">{points.map(point=><li key={point.id}><button className="point-link" disabled={!canNavigate} onClick={()=>void navigate({seconds:pointSeconds(point)})}><Icon name="marker"/><span><strong>{point.name}</strong><small>{pointPosition(point)}</small></span></button><button className="remove-point" aria-label={`Remover ${point.name}`} disabled={busy} onClick={()=>void removePoint(point.id)}>×</button></li>)}</ol>}<div className="jump-buttons"><button disabled={busy || !points.length} onClick={exportPoints}>Exportar pontos</button><button disabled={busy || !pointsLoaded} onClick={()=>importRef.current?.click()}>Importar pontos</button><input ref={importRef} type="file" accept="application/json,.json" hidden aria-label="Arquivo de pontos" onChange={e=>void importPoints(e.currentTarget.files?.[0])}/></div><p className="hint">{points.length}/200 pontos · Salvos apenas neste navegador.</p></>}
        {context && section==='tools' && <><section className="control-section first"><h2>Ferramentas Inteligentes</h2><p className="section-description">Recursos de áudio e automação executados diretamente no editor wide.video.</p><div style={{display:'flex',flexDirection:'column',gap:'10px'}}><button className="wide-action" disabled={busy} onClick={()=>void openSmartTool('silenceRemover')}><Icon name="tools"/><span><strong>Remover Silêncios</strong><small style={{display:'block',opacity:0.8,fontSize:'11px'}}>Detecta pausas e corta silêncios do áudio</small></span></button><button className="wide-action" disabled={busy} onClick={()=>void openSmartTool('captionsGenerator')}><Icon name="marker"/><span><strong>Gerar Legendas</strong><small style={{display:'block',opacity:0.8,fontSize:'11px'}}>Gera legendas automáticas sincronizadas</small></span></button></div></section></>}
        {context && section==='project' && <><section className="control-section first"><h2>Composição</h2><dl className="properties"><div><dt>Resolução</dt><dd>{context.composition.width!==null && context.composition.height!==null ? `${context.composition.width} × ${context.composition.height}` : 'Não identificado'}</dd></div><div><dt>Taxa de quadros</dt><dd>{context.composition.fpsNumerator/context.composition.fpsDenominator} fps</dd></div><div><dt>Armazenamento</dt><dd>{context.project.storageMode==='temporary'?'Temporário':context.project.storageMode==='directory'?'Pasta local':'Não identificado'}</dd></div></dl></section><section className="control-section"><h2>Aparência do editor</h2><label className="appearance-toggle"><span><strong>Visual simples</strong><small>Tipografia limpa e foco mais visível.</small></span><input type="checkbox" checked={simple} disabled={busy} onChange={()=>void toggleAppearance()}/></label><p className="hint">Desative para restaurar a aparência original nesta aba.</p></section><section className="control-section"><h2>Disponível nesta versão</h2><p className="section-description">Navegação por tempo e frames, retorno à posição anterior e pontos persistentes. Cortes e alterações de clipes continuam no editor.</p></section></>}
        {message && <div className="notice" role="status">{message}</div>}
        {error && <div className="notice error" role="alert"><strong>Confira o editor antes de continuar.</strong><p>{error}</p><button onClick={()=>void recover()}>Já conferi o editor; continuar</button></div>}
      </main>
    </div>
    <footer className="studio-footer"><span className={busy?'working':''}>{busy?'Atualizando posição…':context?'Edição local · Sem IA':'Aguardando o editor'}</span><span>wide.video 1.7.12</span></footer>
  </div>;
}


