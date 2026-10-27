import type { EditorContext } from '../src/types/context';
const context: EditorContext = { revision: 'fixture-0', timestamp: 0, project: { id: 'fixture', name: 'Vídeo de apresentação', storageMode: 'temporary' }, composition: { width: 1920, height: 1080, fpsNumerator: 30, fpsDenominator: 1, durationFrames: null, currentPlayheadFrame: 150 }, clips: [], selectedClipIds: [], selectionKnown: false, capabilities: ['get_context', 'seek'] };
let calls = 0, previous = 0;
const scenario = () => (document.querySelector('#scenario') as HTMLSelectElement).value;
const respond = async (message: { type: string; frame?: number; deltaFrames?: number; seconds?: number; deltaSeconds?: number; simple?: boolean; expectedVersion?:number; points?:unknown[] }) => {
  switch (message.type) {
    case 'SW_GET_POINTS': return {success:true,data:JSON.parse(localStorage.getItem('preview-points') || '{"version":0,"points":[]}')};
    case 'SW_SAVE_POINTS': {const old=JSON.parse(localStorage.getItem('preview-points') || '{"version":0,"points":[]}');if(old.version!==message.expectedVersion)return {success:false,error:'Atualize o painel.'};const book={version:old.version+1,points:message.points};localStorage.setItem('preview-points',JSON.stringify(book));return {success:true,data:book};}
    case 'SW_GET_CONTEXT': return { success: true, data: structuredClone(context) };
    case 'SW_SET_APPEARANCE': return { success: true, data: {simple: message.simple} };
    case 'SW_NAVIGATE': {
      calls++; document.querySelector('#metrics')!.textContent = `Execuções: ${calls}`;
      const state = scenario();
      if (state === 'failed' || state === 'unknown') return { success: true, data: [{ operationId: 'fixture-op', status: state, undoAvailable: false, error: `Teste local: ${state === 'failed' ? 'falha de verificação' : 'resultado desconhecido'}` }] };
      previous = context.composition.currentPlayheadFrame;
      context.composition.currentPlayheadFrame = message.frame ?? (message.seconds !== undefined ? Math.round(message.seconds*30) : Math.max(0,previous+(message.deltaFrames ?? Math.round((message.deltaSeconds || 0)*30))));
      context.revision = `fixture-${calls}`;
      return { success: true, data: [{ operationId: 'fixture-op', status: 'verified', undoAvailable: true, undoReceipt: { receiptId: 'fixture-undo', operationId: 'fixture-op', inverseCommand: 'seek', inverseArgs: { frame: previous }, createdAt: Date.now() } }] };
    }
    case 'SW_UNDO_RECEIPT':
      if (scenario() === 'undo-failed') return { success: true, data: { success: false, error: 'Teste local: desfazer rejeitado' } };
      context.composition.currentPlayheadFrame = previous;
      return { success: true, data: { success: true } };
    case 'SW_CLEAR_TRANSACTION': return { success: true };
    default: return { success: false, error: 'Mensagem não simulada' };
  }
};
Object.defineProperty(globalThis, 'chrome', { configurable: true, value: { runtime: { sendMessage: respond } } });
document.querySelector('#panel-width')?.addEventListener('change', e => {
  document.getElementById('app')!.style.maxWidth = `${(e.target as HTMLSelectElement).value}px`;
});
await import('../src/ui/main');
