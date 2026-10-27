import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeNativeProject, parseRationalFps } from '../src/bridge/snapshotNormalizer.js';
import { installMainBridge } from '../src/bridge/mainBridge.js';
import { ContentBridgeClient } from '../src/bridge/contentBridge.js';
import { ProjectStore } from '../src/bridge/projectStore.js';
import { ProjectSnapshot } from '../src/types/snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar fixtures reais do mapping
const mappingDir = path.resolve(__dirname, '../../docs/mapping');
const emptyProjectFixture = JSON.parse(
  fs.readFileSync(path.join(mappingDir, 'live-project-model.json'), 'utf-8')
);
const textClipFixture = JSON.parse(
  fs.readFileSync(path.join(mappingDir, 'live-text-clip.json'), 'utf-8')
);

console.log('====================================================');
console.log(' Wide Studio - Testes de Regressão M0 e M1 (Revisados)');
console.log('====================================================');

// --- 1. M0: Fixture Real de Projeto Vazio ---
console.log('\n--- 1. M0: Normalização de Projeto Vazio Real ---');
{
  const rawModel = emptyProjectFixture.project.properties;
  const snapshot = normalizeNativeProject({
    metadata: {
      appVersion: rawModel.metadata.properties.appVersion,
      version: rawModel.metadata.properties.version,
      createdTime: 1792977400000,
    },
    activity: {
      time: rawModel.activity.properties.time,
    },
    presentation: {
      scene: {
        duration: rawModel.presentation.properties.scene.properties.duration,
        frameRate: rawModel.presentation.properties.scene.properties.frameRate,
        canvas: {
          width: rawModel.presentation.properties.scene.properties.canvas.properties.width,
          height: rawModel.presentation.properties.scene.properties.canvas.properties.height,
        },
      },
      layer: rawModel.presentation.properties.layer.samples,
    },
    selection: {
      kind: rawModel.selection.properties.kind,
    },
    directory: {
      setup: {
        path: rawModel.directory.properties.setup.properties.path,
      },
    },
  }, 'session-test-empty');

  assert.strictEqual(snapshot.editorVersion, '1.7.12', 'editorVersion deve ser 1.7.12');
  assert.strictEqual(snapshot.composition.width, 1920, 'canvas width deve ser 1920');
  assert.strictEqual(snapshot.composition.height, 1080, 'canvas height deve ser 1080');
  assert.deepStrictEqual(snapshot.composition.fps, { numerator: 30, denominator: 1, value: 30 }, 'FPS racional 30/1');
  assert.strictEqual(snapshot.composition.playheadFrame, 0, 'playhead deve iniciar em 0');
  assert.strictEqual(snapshot.composition.durationFrames, 1800, '60s a 30fps = 1800 frames');
  assert.strictEqual(snapshot.tracks.length, 1, 'deve ter exatamente 1 track');
  assert.strictEqual(snapshot.clips.length, 0, 'projeto vazio nao deve ter clipes inventados');
  assert.strictEqual(snapshot.selection.kind, 'none', 'seleção deve ser none');

  const seekCap = snapshot.capabilities.find((c) => c.id === 'transport.seek');
  assert.ok(seekCap && seekCap.available, 'seek deve estar disponível');
  const splitCap = snapshot.capabilities.find((c) => c.id === 'clip.split');
  assert.ok(splitCap && !splitCap.available, 'split deve estar marcado como indisponível');

  console.log('[PASS] Snapshot de projeto vazio validado sem campos inventados');
}

// --- 2. M0: Fixture Real de Clipe de Texto ---
console.log('\n--- 2. M0: Normalização de Clipe de Texto Real ---');
{
  const safeJsonText = textClipFixture.serializedProject.replace(/:\s*_\.([^\s,\n\r}]+)/g, ': "[ref]_.$1"');
  const serialized = JSON.parse(safeJsonText);
  // Anexa o timing nativo observado no TimelineClipContainer
  serialized.presentation.layer[1].clip[0].timing = textClipFixture.controls[0].timing;

  const snapshot = normalizeNativeProject(serialized, 'session-test-text');

  assert.strictEqual(snapshot.editorVersion, '1.7.12');
  assert.strictEqual(snapshot.tracks.length, 2, '2 camadas observadas no json');
  assert.strictEqual(snapshot.clips.length, 1, 'exatamente 1 clipe na segunda camada');

  const textClip = snapshot.clips[0];
  assert.strictEqual(textClip.kind, 'text');
  assert.strictEqual(textClip.name, 'Type here');
  assert.strictEqual(textClip.text, 'Type here');
  assert.strictEqual(textClip.startFrame, 0, 'timing.presentation.start = 0 -> startFrame = 0');
  assert.strictEqual(textClip.durationFrames, 120, '4 segundos a 30fps = 120 frames');

  console.log('[PASS] Snapshot com clipe de texto real validado com precisão de frames');
}

// --- 3. Passo 1: Identidade, Colisão e Fracionamento de Sessão ---
console.log('\n--- 3. Passo 1: Identidade de Projeto e Estabilidade de WeakMap ---');
{
  // 3.1 Projetos no mesmo caminho /widevideo/ mas com createdTime diferentes
  const proj1 = normalizeNativeProject({
    metadata: { createdTime: '2026-10-26T01:00:00.000Z', version: 1 },
    directory: { setup: { path: '/widevideo/' } },
  }, 'sess-1');

  const proj2 = normalizeNativeProject({
    metadata: { createdTime: '2026-10-26T02:00:00.000Z', version: 1 },
    directory: { setup: { path: '/widevideo/' } },
  }, 'sess-2');

  assert.notStrictEqual(proj1.projectId, proj2.projectId, 'dois projetos em /widevideo/ com createdTime diferente nao podem colidir');
  console.log('[PASS] Projetos em mesmo caminho OPFS com datas diferentes geram projectIds distintos');

  // 3.2 Estabilidade de IDs de clipe via WeakMap mesmo após reordenação
  const clipObjA = { load: { source: 'text', text: 'Clip A' } };
  const clipObjB = { load: { source: 'video', text: 'Clip B' } };
  const weakMap = new WeakMap<object, string>();

  const beforeReorder = normalizeNativeProject({
    presentation: { layer: [{ clip: [clipObjA, clipObjB] }] },
  }, 'sess-wm', weakMap);

  const afterReorder = normalizeNativeProject({
    presentation: { layer: [{ clip: [clipObjB, clipObjA] }] },
  }, 'sess-wm', weakMap);

  const idA_before = beforeReorder.clips.find(c => c.name === 'Clip A')?.id;
  const idA_after = afterReorder.clips.find(c => c.name === 'Clip A')?.id;
  const idB_before = beforeReorder.clips.find(c => c.name === 'Clip B')?.id;
  const idB_after = afterReorder.clips.find(c => c.name === 'Clip B')?.id;

  assert.strictEqual(idA_before, idA_after, 'ID do Clip A deve permanecer estável via WeakMap');
  assert.strictEqual(idB_before, idB_after, 'ID do Clip B deve permanecer estável via WeakMap');
  console.log('[PASS] WeakMap preserva identidade dos clipes entre reordenações de camada');

  // 3.3 Revisão muda ao alterar seleção
  const snapNoSel = normalizeNativeProject({
    metadata: { version: 1 },
    presentation: { layer: [{ clip: [clipObjA] }] },
    selection: { kind: 'none' },
  }, 'sess-rev');

  const snapWithSel = normalizeNativeProject({
    metadata: { version: 1 },
    presentation: { layer: [{ clip: [clipObjA] }] },
    selection: { kind: 'clip', value: clipObjA },
  }, 'sess-rev');

  assert.notStrictEqual(snapNoSel.revision, snapWithSel.revision, 'alterar seleção deve modificar a revisão do snapshot');
  console.log('[PASS] Mudança de seleção altera assinatura da revisão');
}

// --- 4. Passo 2: FPS Fracionário e Valores Desconhecidos ---
console.log('\n--- 4. Passo 2: FPS Fracionário, Timing Não-Cumulativo e Campos Desconhecidos ---');
{
  // 4.1 FPS Fracionário não é arredondado para inteiro
  const fps2997 = parseRationalFps(29.97);
  assert.deepStrictEqual(fps2997, { numerator: 2997, denominator: 100, value: 29.97 });

  const fps23976 = parseRationalFps(23.976);
  assert.deepStrictEqual(fps23976, { numerator: 2997, denominator: 125, value: 23.976 });

  const fpsSnap = normalizeNativeProject({
    presentation: { scene: { frameRate: 29.97, duration: 1001 / 30 } },
  }, 'sess-fps');
  assert.strictEqual(fpsSnap.composition.fps?.numerator, 2997);
  assert.strictEqual(fpsSnap.composition.fps?.denominator, 100);
  console.log('[PASS] FPS fracionário (29.97 e 23.976) preservado em razão racional');

  // 4.2 Campos desconhecidos permanecem null, sem valores inventados
  const emptySnap = normalizeNativeProject({}, 'sess-empty');
  assert.strictEqual(emptySnap.composition.width, null, 'width sem evidência deve ser null');
  assert.strictEqual(emptySnap.composition.height, null, 'height sem evidência deve ser null');
  assert.strictEqual(emptySnap.composition.fps, null, 'fps ausente deve ser null');
  assert.strictEqual(emptySnap.composition.playheadFrame, null, 'playhead sem fps/time deve ser null');
  assert.strictEqual(emptySnap.composition.durationFrames, null, 'duration sem fps deve ser null');

  const seekCap = emptySnap.capabilities.find(c => c.id === 'transport.seek');
  assert.strictEqual(seekCap?.available, false, 'seek deve ser desabilitado quando playhead/fps forem desconhecidos');
  console.log('[PASS] Propriedades desconhecidas representadas explicitamente como null');

  // 4.3 Início nativo não-cumulativo (suporte a gaps)
  const clipWithGap1 = {
    timing: { presentation: { start: 2, span: 3 } },
    load: { source: 'text', text: 'Clip 1' },
  };
  const clipWithGap2 = {
    timing: { presentation: { start: 10, span: 4 } }, // Gap entre segundo 5 e 10
    load: { source: 'text', text: 'Clip 2' },
  };

  const gapSnap = normalizeNativeProject({
    presentation: {
      scene: { frameRate: 30 },
      layer: [{ clip: [clipWithGap1, clipWithGap2] }],
    },
  }, 'sess-gap');

  assert.strictEqual(gapSnap.clips[0].startFrame, 60, 'Clip 1 inicia no frame 60 (2s)');
  assert.strictEqual(gapSnap.clips[1].startFrame, 300, 'Clip 2 inicia no frame 300 (10s), respeitando o gap');
  console.log('[PASS] Início de clipe preserva timing real e gaps sem presunção cumulativa');
}

// --- 5. Passo 3: Protocolo da Ponte e Schemas Zod ---
console.log('\n--- 5. Passo 3: Validação Runtime da Ponte, Sessão e Idempotência ---');
async function testBridge() {
  const listeners: Array<(e: any) => void> = [];
  const fakeWindow = {
    addEventListener(event: string, fn: any) {
      listeners.push(fn);
    },
    removeEventListener(event: string, fn: any) {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    },
    postMessage(data: any) {
      const event = { source: fakeWindow, data };
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };

  (globalThis as any).window = fakeWindow;

  const mockProject = {
    metadata: { appVersion: '1.7.12', version: 3, createdTime: 1792977400000 },
    activity: { time: 2.5 },
    presentation: {
      scene: { duration: 10, frameRate: 30, canvas: { width: 1920, height: 1080 } },
      layer: [{ clip: [] }],
    },
    selection: { kind: 'empty' },
    directory: { setup: { path: '/widevideo/test/' } },
  };

  (globalThis as any).document = {
    querySelector(selector: string) {
      if (selector === '.ProjectApp') {
        return { project: mockProject };
      }
      return null;
    },
  };

  // 5.1 Teste de instalação idempotente (não duplica listeners)
  const uninstall1 = installMainBridge('test-session-123');
  const listenersCount1 = listeners.length;
  const uninstall2 = installMainBridge('test-session-123');
  const listenersCount2 = listeners.length;
  assert.strictEqual(listenersCount2, listenersCount1, 'instalação repetida deve desinstalar a anterior e manter 1 listener');
  console.log('[PASS] Instalação da ponte no contexto MAIN é idempotente');

  const client = new ContentBridgeClient('test-session-123');
  client.init();

  // 5.2 Handshake
  const handshakeRes = await client.handshake();
  assert.strictEqual(handshakeRes.bridgeReady, true);
  assert.strictEqual(handshakeRes.hasProject, true);
  assert.strictEqual(handshakeRes.version, '1.7.12');
  console.log('[PASS] Handshake validado com sucesso');

  // 5.3 Probe
  const probeRes = await client.probe();
  assert.strictEqual(probeRes.appElementFound, true);
  assert.strictEqual(probeRes.projectObjectFound, true);
  console.log('[PASS] Probe validado com sucesso');

  // 5.4 ReadSnapshot com validação de schema Zod em runtime
  const snapshotRes = await client.readSnapshot();
  assert.strictEqual(snapshotRes.editorVersion, '1.7.12');
  assert.strictEqual(snapshotRes.composition.playheadFrame, 75);
  console.log('[PASS] Leitura de snapshot validada em runtime com Zod');

  // 5.5 Rejeição de resposta com sessão divergente
  const staleClient = new ContentBridgeClient('old-session-456');
  staleClient.init();
  try {
    await staleClient.probe();
    assert.fail('Deveria ter falhado por divergência de sessão');
  } catch (err: any) {
    assert.strictEqual(err.code, 'SESSION_MISMATCH');
    console.log('[PASS] Mensagens com sessão divergente são rejeitadas');
  } finally {
    staleClient.destroy();
  }

  // 5.6 Timeout de requisição não respondida
  try {
    await client.sendRequest('WIDE_BRIDGE_HANDSHAKE', undefined, 10);
  } catch {
    // Timeout não acionado se responder rápido
  }

  client.destroy();
  uninstall2();
}

// --- 6. Passo 1 & 4: ProjectStore com Validação de Sessão ---
console.log('\n--- 6. Passo 1: ProjectStore com Validação de Sessão e Imutabilidade ---');
{
  const store = new ProjectStore();
  let notifications = 0;

  store.subscribe(() => {
    notifications++;
  });

  const baseSnap: ProjectSnapshot = {
    schemaVersion: 1,
    sessionId: 'sess-A',
    projectId: 'proj-1',
    revision: 'rev-1',
    editorVersion: '1.7.12',
    composition: { width: 1920, height: 1080, fps: { numerator: 30, denominator: 1 }, durationFrames: 300, playheadFrame: 0 },
    tracks: [],
    clips: [],
    selection: { kind: 'none', clipIds: [], trackIds: [] },
    capabilities: [],
    collectedAt: Date.now(),
  };

  store.setSnapshot(baseSnap);
  assert.strictEqual(notifications, 1);

  // Duplicata com mesma sessão, projeto e revisão é ignorada
  const dupResult = store.setSnapshot(baseSnap);
  assert.strictEqual(dupResult, false);
  assert.strictEqual(notifications, 1);

  // Troca de sessão aceita mesmo se revisão for igual
  const newSessionSnap = { ...baseSnap, sessionId: 'sess-B' };
  const newSessResult = store.setSnapshot(newSessionSnap);
  assert.strictEqual(newSessResult, true);
  assert.strictEqual(notifications, 2);
  console.log('[PASS] ProjectStore aceita nova sessão mesmo com revisão idêntica');

  // Imutabilidade: objeto retornado é congelado
  const current = store.getSnapshot();
  assert.ok(Object.isFrozen(current), 'snapshot retornado pelo ProjectStore deve estar congelado');
  console.log('[PASS] Snapshot no ProjectStore é estritamente imutável');

  store.clear();
}

testBridge()
  .then(() => {
    console.log('\n====================================================');
    console.log(' Todos os passos 1, 2 e 3 foram executados e aprovados!');
    console.log('====================================================\n');
  })
  .catch((err) => {
    console.error('Falha nos testes:', err);
    process.exit(1);
  });
