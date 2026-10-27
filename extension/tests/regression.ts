import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { Window } from 'happy-dom';
import { WideVideoAdapter } from '../src/adapter/WideVideoAdapter';
import { MockProvider } from '../src/providers/mockProvider';
import { NIMProvider } from '../src/providers/nimProvider';
import type { EditPlan, PreparedOperation } from '../src/types/commands';
import { EditPlanSchema } from '../src/commands/schemas';
import { parseTimeString } from '../src/adapter/selectors';

const win = new Window({ url: 'https://wide.video/app/1.7.12/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'KeyboardEvent', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: key === 'window' ? win : (win as any)[key], configurable: true });
const doc = win.document;
let checks = 0;
function check(name: string, condition: unknown) { assert.ok(condition, name); checks++; console.log(`[PASS] ${name}`); }
const adapter = new WideVideoAdapter();
check('empty editor not supported', !(await adapter.detect()).supported);
check('empty editor exposes no capabilities', (await adapter.capabilities()).length === 0);
check('empty editor does not verify', !(await adapter.verify({ command: 'add_text', operationId: 'absent', args: {}, resolvedTarget: null, computedDiff: [] })).verified);
function fixture() {
  doc.body.innerHTML = `<div class="ProjectApp"><div class="ProjectMetadataView"><div title="Folder"><span class="value">Synthetic</span></div><div title="Created"><span class="value">fixture-date</span></div></div><div class="ExplorerButton"><span class="extra">1920×1080@30</span></div>${[1,2].map(() => '<div class="ProjectTime"><div class="TimeView"><input value="0.000"></div><span class="frame">0000 (30.000)</span></div>').join('')}</div>`;
}
function frame(value: number) {
  doc.querySelectorAll('input').forEach(e => e.value = (value / 30).toFixed(3));
  doc.querySelectorAll('.frame').forEach(e => e.textContent = `${String(value).padStart(4, '0')} (30.000)`);
}
fixture();
const ctx = await adapter.readContext();
const plan = (operationId: string): EditPlan => ({ schemaVersion: '0.1', planId: operationId, projectId: ctx.project.id, expectedRevision: ctx.revision, summary: 'seek', operations: [{ operationId, command: 'seek', args: { frame: 150 } }] });
check('context has no invented clips or duration', !ctx.clips.length && ctx.composition.durationFrames === null && ctx.selectionKnown === false);
check('revision stable without changes', ctx.revision === (await adapter.readContext()).revision);
check('wrong project rejected', !(await adapter.prepare({ ...plan('wrong'), projectId: 'wrong' })).valid);
check('stale revision rejected', !(await adapter.prepare({ ...plan('stale'), expectedRevision: 'stale' })).valid);
check('unknown plan properties rejected', !EditPlanSchema.safeParse({ ...plan('extra'), code: 'eval' }).success);
check('multiple operations rejected', !EditPlanSchema.safeParse({ ...plan('multi'), operations: [plan('a').operations[0], plan('b').operations[0]] }).success);
check('unimplemented mutation rejected', !(await adapter.prepare({ ...plan('text'), operations: [{ operationId: 'text', command: 'add_text', args: { text: 'x', startFrame: 0, endFrame: 30 } }] })).valid);
let prepared = await adapter.prepare(plan('manual'));
frame(30);
check('manual edit between prepare and execution rejected', (await adapter.execute(prepared.operations[0])).status === 'failed');
frame(0);
prepared = await adapter.prepare(plan('no-consumer'));
check('no editor event consumer produces unknown, never verified', (await adapter.execute(prepared.operations[0])).status === 'unknown');
check('zero observed frame does not become expected frame', !(await adapter.verify(prepared.operations[0])).verified);
frame(0);
// Emulate a cooperating editor for contract tests; this is not the real wide.video.
doc.querySelector('input')!.addEventListener('change', e => frame(Math.round(Number((e.target as unknown as HTMLInputElement).value) * 30)));
prepared = await adapter.prepare(plan('real-fixture-consumer'));
const executed = await adapter.execute(prepared.operations[0]);
check('cooperating fixture verifies exact target', executed.status === 'verified');
check('duplicate execution rejected', (await adapter.execute(prepared.operations[0])).status === 'failed');
check('registered seek undo verified', !!executed.undoReceipt && (await adapter.undo(executed.undoReceipt)).success);
check('undo replay rejected', !(await adapter.undo(executed.undoReceipt!)).success);
frame(0);
prepared = await adapter.prepare(plan('undo-stale'));
const next = await adapter.execute(prepared.operations[0]);
frame(60);
check('undo after manual edit rejected', !(await adapter.undo(next.undoReceipt!)).success);
const oldId = (await adapter.readContext()).project.id;
fixture();
check('replaced project gets new identity', (await adapter.readContext()).project.id !== oldId);
check('persistent project identity survives root replacement', (await adapter.readContext()).project.persistentId===ctx.project.persistentId);
const root=doc.querySelector('.ProjectApp')!;
root.insertAdjacentHTML('afterbegin','<div class="SelectionBreadcrumbs"><button class="project">Synthetic</button></div>');
await adapter.readContext();
doc.querySelector('.ProjectMetadataView')!.remove();doc.querySelector('.ExplorerButton')!.remove();
check('clip selection can retain previously observed project', (await adapter.readContext()).project.persistentId===ctx.project.persistentId);
doc.querySelector('.SelectionBreadcrumbs .project')!.textContent='Other';
await assert.rejects(adapter.readContext());checks++;console.log('[PASS] changed breadcrumb invalidates cached project');
check('negative time rejected', parseTimeString('-5') === null);
check('non-time text rejected', parseTimeString('hello') === null);
check('invalid minute/second rejected', parseTimeString('1:99') === null);
check('valid decimal time accepted', parseTimeString('5.033') === 5.033);

const mock = new MockProvider();
const base = { ...ctx, composition: { ...ctx.composition, fpsNumerator: 60 }, capabilities: ['seek', 'split_clip', 'add_text', 'set_clip_gain'], selectedClipIds: ['audio'], clips: [{ clipId:'audio', trackId:'a', name:'audio', type:'audio' as const, startFrame:0, endFrame:1000, sourceOffsetFrame:0, locked:false, gainDb:-3 }] };
const split = await mock.generatePlan('Divida o clipe no segundo 5', base);
check('split is not seek and honors 60 fps', split.plan?.operations[0].command === 'split_clip' && split.plan.operations[0].args.splitFrame === 300);
const text = await mock.generatePlan('Coloca o título "Intro" de 2 a 3s', base);
check('text interval honored', text.plan?.operations[0].args.startFrame === 120 && text.plan.operations[0].args.endFrame === 180);
check('missing selection clarified', (await mock.generatePlan('Abaixa 6 dB', { ...base, selectedClipIds: [] })).type === 'clarification');
check('multiple selection clarified', (await mock.generatePlan('Abaixa 6 dB', { ...base, selectedClipIds: ['audio', 'b'] })).type === 'clarification');
check('unavailable tool refused', (await mock.generatePlan('Coloca título "X" de 0 a 3s', ctx)).type === 'unsupported');
check('negated instruction not executed', (await mock.generatePlan('Não vá para o segundo 10', base)).type !== 'plan');

const originalFetch = globalThis.fetch;
let tools: any[] = [];
globalThis.fetch = (async (_url, options) => { tools = JSON.parse(options!.body as string).tools; return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ function: { name: 'add_text', arguments: '{"text":"x","startFrame":0,"endFrame":30}' } }] } }] }) } as Response; }) as typeof fetch;
const nim = await new NIMProvider('synthetic-test-key', 'synthetic-model').generatePlan('Título', ctx);
check('NIM filters tools by runtime capabilities', tools.length === 1 && tools[0].function.name === 'seek');
check('NIM refuses unavailable returned tool', nim.type === 'unsupported');
globalThis.fetch = originalFetch;
new Script(readFileSync('dist/content/contentScript.js', 'utf8'));
check('built content script parses as classic script', true);
console.log(`${checks} regression checks passed.`);
await win.happyDOM.close();
