import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
const win = new Window({ url: 'http://localhost/preview' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'KeyboardEvent', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: key === 'window' ? win : (win as any)[key], configurable: true });
const doc = win.document;
let scenario = 'success', calls = 0, frame = 0, projectId = 'fixture', previous=0, theme=true;
const messages: string[] = [];
const books: Record<string, {version:number;points:any[]}> = {};
const context = () => ({ revision: 'fixture', timestamp: 0, project: { id: projectId, name: 'Apresentação', storageMode: 'temporary' }, composition: { width: 1920, height: 1080, fpsNumerator: 30, fpsDenominator: 1, durationFrames: null, currentPlayheadFrame: frame }, selectedClipIds: [], clips: [], capabilities: ['seek'], selectionKnown: false });
Object.defineProperty(globalThis, 'chrome', { configurable: true, value: { runtime: { sendMessage: async (m: any) => {
  messages.push(m.type);
  if (m.type === 'SW_GET_POINTS') return {success:true,data:structuredClone(books[projectId] || {version:0,points:[]})};
  if (m.type === 'SW_SAVE_POINTS') {
    const book=books[projectId] || {version:0,points:[]};
    if(m.expectedProjectId!==projectId || m.expectedVersion!==book.version) return {success:false,error:'Stale points'};
    books[projectId]={version:book.version+1,points:structuredClone(m.points)};
    return {success:true,data:structuredClone(books[projectId])};
  }
  if (m.type === 'SW_GET_CONTEXT') return { success:true, data:context() };
  if (m.type === 'SW_SET_APPEARANCE') {theme=m.simple;return {success:true,data:{simple:theme}};}
  if (m.type === 'SW_NAVIGATE') {
    calls++; await new Promise(resolve=>setTimeout(resolve,30));
    if(scenario !== 'success') return {success:true,data:[{status:scenario,error:'Fixture verification failure'}]};
    previous=frame;frame=m.frame ?? (m.seconds!==undefined ? Math.round(m.seconds*30) : Math.max(0,frame+(m.deltaFrames ?? Math.round(m.deltaSeconds*30))));
    return {success:true,data:[{status:'verified',undoReceipt:{receiptId:'fixture'}}]};
  }
  if (m.type === 'SW_UNDO_RECEIPT') {if(scenario==='undo-failed') return {success:true,data:{success:false,error:'Fixture undo rejected'}};frame=previous;return {success:true,data:{success:true}};}
  if (m.type === 'SW_CLEAR_TRANSACTION') return {success:true};
  if (m.type === 'SW_OPEN_SMART_TOOL') return {success:true,data:{success:true,tool:m.tool,openedVia:'action'}};
  throw new Error(`Unexpected/AI message: ${m.type}`);
} } } });
const { render, h, options } = await import('preact');
options.requestAnimationFrame = callback => setTimeout(callback,0) as unknown as number;
const { App } = await import('../src/ui/App');
const pause = (ms=65)=>new Promise(resolve=>setTimeout(resolve,ms));
doc.body.innerHTML='<div id="app"></div>';
render(h(App,{}),doc.getElementById('app') as unknown as HTMLElement); await pause();
function button(text:string) {const buttons=Array.from(doc.querySelectorAll('button'));const b=buttons.find(b=>b.textContent?.trim()===text || b.getAttribute('aria-label')===text) || buttons.find(b=>b.textContent?.includes(text));assert.ok(b,`button ${text}`);return b;}
function input(id:string,value:string) {const e=doc.querySelector(`#${id}`) as any;e.value=value;e.dispatchEvent(new win.Event('input',{bubbles:true}));}
let checks=0;function check(name:string,condition:unknown){assert.ok(condition,name);checks++;console.log(`[PASS] ${name}`);}
check('no chat or AI configuration in editing flow',!doc.body.textContent.includes('NVIDIA') && !doc.querySelector('[placeholder*="Descreva"]'));
button('Ir para 10s').click();button('Ir para 10s').click();await pause();
check('direct navigation executes exactly once',calls===1 && frame===300);
check('verified position rendered',doc.querySelector('output')?.textContent==='00:00:10.000');
await pause(3200);
check('polling preserves feedback',doc.body.textContent.includes('Posição atualizada.'));
button('Avançar um frame').click();await pause();check('single frame navigation',frame===301);
button('Voltar um frame').click();await pause();check('backward frame navigation',frame===300);
input('seek-position','12.5');await pause();doc.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause();
check('time entry converts seconds to frames',frame===375);
const before=calls;input('seek-position','nonsense');await pause();doc.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause();
check('invalid time never reaches executor',calls===before && doc.body.textContent.includes('Use segundos'));
button('Salvar posição nos pontos').click();await pause();button('Pontos').click();await pause();
check('persistent point saved at observed frame',doc.body.textContent.includes('Ponto 1') && doc.body.textContent.includes('00:00:12.500') && books.fixture.points[0].frame===375);
input('point-name','Duplicado');await pause();doc.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await pause();
check('duplicate position is not duplicated',doc.querySelectorAll('.point-list li').length===1);
button('Projeto').click();await pause();check('real composition properties visible',doc.body.textContent.includes('1920 × 1080'));
const toggle=doc.querySelector('input[type=checkbox]') as any;toggle.checked=false;toggle.dispatchEvent(new win.Event('change',{bubbles:true}));await pause();check('editor appearance can be restored',theme===false);
button('Navegação').click();await pause();button('Ir ao início').click();await pause();check('go to beginning uses frame zero',frame===0);
button('Pontos').click();await pause();(doc.querySelector('.point-link') as any).click();await pause();check('point navigation restores saved position',frame===375);
button('Remover Ponto 1').click();await pause();check('point can be removed',!doc.querySelector('.point-list li'));
button('Navegação').click();await pause();scenario='undo-failed';button('Voltar à posição anterior').click();await pause();
check('failed undo never reported as success',doc.body.textContent.includes('Fixture undo rejected') && !doc.body.textContent.includes('Posição anterior restaurada.'));
button('Já conferi o editor; continuar').click();await pause();scenario='failed';button('Ir para 10s').click();await pause();
check('verification failure blocks navigation until acknowledgement',doc.body.textContent.includes('Fixture verification failure') && button('Ir para 10s').disabled);
button('Já conferi o editor; continuar').click();await pause();scenario='success';button('Salvar posição nos pontos').click();await pause();projectId='new-project';button('Atualizar projeto').click();await pause();button('Pontos').click();await pause();
check('project change clears session points',doc.body.textContent.includes('Nenhum ponto salvo'));
projectId='fixture';button('Atualizar projeto').click();await pause();
check('return to project restores persisted points',doc.querySelectorAll('.point-list li').length===1);
render(null,doc.getElementById('app') as unknown as HTMLElement);await pause();
render(h(App,{}),doc.getElementById('app') as unknown as HTMLElement);await pause();button('Pontos').click();await pause();
check('reopened panel restores persisted points',doc.querySelectorAll('.point-list li').length===1);
button('Ferramentas').click();await pause();
check('tools section visible',doc.body.textContent.includes('Ferramentas Inteligentes') && doc.body.textContent.includes('Remover Silêncios'));
button('Remover Silêncios').click();await pause();
check('open smart tool sends message and displays feedback',messages.includes('SW_OPEN_SMART_TOOL') && doc.body.textContent.includes('Remover Silêncios aberto no editor.'));
check('no AI or prompt message sent',!messages.some(m=>/PROMPT|SETTINGS/.test(m)));
render(null,doc.getElementById('app') as unknown as HTMLElement);await win.happyDOM.close();
console.log(`${checks} UI regression checks passed (simulated DOM/Chrome transport).`);
