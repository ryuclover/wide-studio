import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMainBridge } from '../src/bridge/mainBridge.js';
import { ContentBridgeClient } from '../src/bridge/contentBridge.js';
import { WideVideoAdapter } from '../src/adapter/WideVideoAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('====================================================');
console.log(' Wide Studio - Testes de Regressão do Passo 4       ');
console.log('====================================================');

// --- 1. Verificação do Build da Entrada MAIN ---
console.log('\n--- 1. Artefato dist/content/mainBridgeEntry.js ---');
{
  const distEntryPath = path.resolve(__dirname, '../dist/content/mainBridgeEntry.js');
  // Se o arquivo já tiver sido compilado pelo build, inspecionar conteúdo
  if (fs.existsSync(distEntryPath)) {
    const code = fs.readFileSync(distEntryPath, 'utf-8');
    assert.doesNotMatch(code, /^\s*import\s+/m, 'mainBridgeEntry.js não deve ter imports ES estáticos (deve ser IIFE autocontida)');
    console.log('[PASS] mainBridgeEntry.js existe e é empacotado como script clássico IIFE');
  } else {
    console.log('[INFO] dist/content/mainBridgeEntry.js será verificado após npm run build');
  }
}

// --- 2. Travessia de Contextos e Leitura com Inspetor Aberto ---
console.log('\n--- 2. Travessia MAIN <-> Isolated World e Inspeção sem Dependência de DOM ---');
async function runStep4Tests() {
  // Simulação de window compartilhado entre contextos com disparos reais de postMessage
  const windowListeners: Array<(e: any) => void> = [];
  const fakeWindow = {
    location: {
      hostname: 'wide.video',
      pathname: '/app/1.7.12/editor',
      href: 'https://wide.video/app/1.7.12/editor',
    },
    addEventListener(event: string, fn: any) {
      if (event === 'message') windowListeners.push(fn);
    },
    removeEventListener(event: string, fn: any) {
      if (event === 'message') {
        const idx = windowListeners.indexOf(fn);
        if (idx !== -1) windowListeners.splice(idx, 1);
      }
    },
    postMessage(data: any, _targetOrigin?: string) {
      // Simula a fila de eventos de mensagem do navegador assincronamente (microtask)
      queueMicrotask(() => {
        const ev = { source: fakeWindow, data };
        for (const listener of [...windowListeners]) {
          try {
            listener(ev);
          } catch (e) {
            console.error('Erro em listener do fakeWindow:', e);
          }
        }
      });
    },
  };

  (globalThis as any).window = fakeWindow;

  // Mock do DOM com inspetor de clipe ABERTO (sem .ProjectMetadataView)
  const clipObj1 = {
    load: { source: 'text', text: 'Clipe em Edição', trim: { start: 0, duration: 4 } },
    filter: [{ kind: 'position', x: 480, y: 270 }],
    timing: { presentation: { start: 1, end: 5, span: 4 } },
  };

  const nativeProject = {
    metadata: { appVersion: '1.7.12', version: 5, createdTime: 1792977400000 },
    activity: { time: 3.0 },
    presentation: {
      scene: { duration: 20, frameRate: 30, canvas: { width: 1920, height: 1080 } },
      layer: [{ clip: [clipObj1] }],
    },
    selection: { kind: 'clip', value: clipObj1 },
    directory: { setup: { path: '/widevideo/' } },
  };

  const projectAppEl = {
    project: nativeProject,
    querySelector(sel: string) {
      // Inspetor de clipe aberto: NÃO existe .ProjectMetadataView no DOM!
      if (sel === '.ProjectMetadataView') return null;
      if (sel === '.ExplorerButton .extra') return null;
      return null;
    },
    querySelectorAll(sel: string) {
      if (sel === '.ExplorerButton .extra') return [];
      if (sel === '.ProjectTime .TimeView input') return [];
      if (sel === '.ProjectTime .frame') return [];
      return [];
    },
  };

  (globalThis as any).document = {
    documentElement: { dataset: {} },
    querySelector(sel: string) {
      if (sel === '.ProjectApp') return projectAppEl;
      return null;
    },
  };

  // Instala a ponte no contexto MAIN
  const uninstallMain = installMainBridge('test-step4-session');

  // Inicializa o cliente na extensão (Isolated World)
  const bridgeClient = new ContentBridgeClient('test-step4-session');
  bridgeClient.init();

  // Teste 2.1: Handshake
  const handshake = await bridgeClient.handshake();
  assert.strictEqual(handshake.bridgeReady, true);
  assert.strictEqual(handshake.hasProject, true);
  assert.strictEqual(handshake.version, '1.7.12');
  console.log('[PASS] Handshake assíncrono entre mundos isolados concluído');

  // Teste 2.2: Leitura via Adapter COM o Bridge configurado
  const adapter = WideVideoAdapter.getInstance();
  adapter.setBridgeClient(bridgeClient);

  const context = await adapter.readContext();
  assert.strictEqual(context.selectionKnown, true, 'selectionKnown deve ser true quando lido da ponte');
  assert.strictEqual(context.composition.currentPlayheadFrame, 90, '3.0s a 30fps = 90 frames');
  assert.strictEqual(context.composition.width, 1920);
  assert.strictEqual(context.composition.height, 1080);
  assert.strictEqual(context.clips.length, 1, 'clipe deve ser lido diretamente do modelo nativo');
  assert.strictEqual(context.clips[0].name, 'Clipe em Edição');
  assert.strictEqual(context.selectedClipIds.length, 1, 'clipe selecionado deve ser identificado');
  assert.strictEqual(context.selectedClipIds[0], context.clips[0].clipId);
  console.log('[PASS] Adaptador lê projeto, cena, clipes e seleção mesmo com inspetor de clipe aberto no DOM');

  // Teste 2.3: Fallback explícito quando o bridge é desabilitado
  adapter.setBridgeClient(null);
  let failedAsExpected = false;
  try {
    // Como .ProjectMetadataView está oculto no DOM e o bridge está desligado, o DOM deve falhar fechado
    await adapter.readContext();
  } catch (err: any) {
    failedAsExpected = true;
    assert.match(err.message, /CONTEXT_UNAVAILABLE/, 'Deve falhar com CONTEXT_UNAVAILABLE quando depender apenas do DOM sem metadados');
  }
  assert.ok(failedAsExpected, 'Sem o bridge, inspeção pura de DOM deve falhar fechada com inspetor de clipe aberto');
  console.log('[PASS] Fallback para DOM preservado: falha controlada quando propriedades visíveis estão ocultas');

  bridgeClient.destroy();
  uninstallMain();
}

runStep4Tests()
  .then(() => {
    console.log('\n====================================================');
    console.log(' Todos os testes do Passo 4 foram aprovados!        ');
    console.log('====================================================\n');
  })
  .catch((err) => {
    console.error('Falha nos testes do Passo 4:', err);
    process.exit(1);
  });
