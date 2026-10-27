import {mountDriveDrop,dropLoadedDriveMedia} from './driveDrop';
import { WideVideoAdapter } from '../adapter/WideVideoAdapter';
import { toggleOverlay, mountOverlayLauncher } from './overlay';
import { ContentBridgeClient } from '../bridge/contentBridge';
import { globalProjectStore } from '../bridge/projectStore';
import { mountWorkspace, setWorkspaceAppearance } from './workspace';
import {runNativeAction} from './nativeActions';
import {importMedia,extractionTransfer} from './importMedia';

console.log('[Wide Studio] Content script inicializado na página:', window.location.href);

const adapter = WideVideoAdapter.getInstance();
const bridgeClient = new ContentBridgeClient(`cs-runtime-${Date.now()}`);
bridgeClient.init();
adapter.setBridgeClient(bridgeClient);
mountDriveDrop(bridgeClient);

// Manifest injects MAIN before/alongside this script. Retry startup without
// injecting a second bridge that could replace a negotiated session.
async function connectBridge(){
  for(let attempt=0;attempt<3;attempt++){
    try {await bridgeClient.handshake();return;}catch{await new Promise(resolve=>setTimeout(resolve,250));}
  }
}
void connectBridge();
window.addEventListener('pagehide',()=>{bridgeClient.destroy();globalProjectStore.resetProject();});

document.documentElement.dataset.wideStudioLayout = 'simple';
// Remember the visible project before selecting a clip hides its properties.
let metadataTimer: ReturnType<typeof setTimeout> | undefined;
const rememberProject = () => {
  clearTimeout(metadataTimer);
  metadataTimer = setTimeout(() => adapter.rememberProjectMetadata(), 100);
};
new MutationObserver(rememberProject).observe(document.body, {childList:true,subtree:true,characterData:true});
adapter.rememberProjectMetadata();
if (window.location.pathname.startsWith('/app/')) { mountOverlayLauncher(); mountWorkspace(); }

// Bridge de escuta de mensagens do Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!message || !message.type) return;
  if(['PREPARE_DRIVE_DROP','DRIVE_POINTER_END'].includes(message.type))return; // handled by mountDriveDrop

  (async () => {
    try {
      switch (message.type) {
        case 'DROP_DRIVE_MEDIA': {
          const context=await adapter.readContext();if(context.project.id!==message.expectedProjectId)throw new Error('O projeto mudou.');
          sendResponse({success:true,data:await dropLoadedDriveMedia(message.driveKey,context.project.id,message.dropToken,bridgeClient)});break;
        }
        case 'EXTRACT_IMPORT_BEGIN':case 'EXTRACT_IMPORT_CHUNK':case 'EXTRACT_IMPORT_FINISH':case 'EXTRACT_IMPORT_ABORT': {
          const context=await adapter.readContext();sendResponse({success:true,data:await extractionTransfer(message,context.project.id)});break;
        }
        case 'IMPORT_DRIVE_MEDIA': {
          const context=await adapter.readContext();if(context.project.id!==message.expectedProjectId)throw new Error('O projeto mudou durante o download.');
          sendResponse({success:true,data:await importMedia(message)});break;
        }
        case 'TOGGLE_OVERLAY': sendResponse({success:true,data:toggleOverlay(message.url)}); break;
        case 'CONNECT_PROJECT': {
          const button = document.querySelector<HTMLButtonElement>('.ProjectApp .SelectionBreadcrumbs .project');
          if (!button) throw new Error('Abra um projeto no wide.video primeiro.');
          button.click();
          await new Promise(resolve=>setTimeout(resolve,150));
          adapter.rememberProjectMetadata();
          sendResponse({success:true,data:await adapter.readContext()});
          break;
        }
        case 'GET_PROJECT_SNAPSHOT': {
          const snap = await bridgeClient.readSnapshot();
          globalProjectStore.setSnapshot(snap);
          sendResponse({ success: true, data: snap });
          break;
        }
        case 'PROBE_BRIDGE': {
          const probe = await bridgeClient.probe();
          sendResponse({ success: true, data: probe });
          break;
        }
        case 'OPEN_SMART_TOOL': {
          const tool = message.tool;
          if (tool !== 'silenceRemover' && tool !== 'captionsGenerator') throw new Error('Ferramenta inválida');
          const root=document.querySelector<HTMLElement>('#ProjectApp');if(!root)throw new Error('Editor indisponível');
          await runNativeAction(root,tool);
          sendResponse({ success: true, data: {tool,triggered:true} });
          break;
        }
        case 'SET_APPEARANCE': {
          if (typeof message.simple !== 'boolean') throw new Error('Aparência inválida');
          setWorkspaceAppearance(message.simple);
          sendResponse({ success: true, data: { simple: message.simple } });
          break;
        }
        case 'GET_DETECTION': {
          const res = await adapter.detect();
          sendResponse({ success: true, data: res });
          break;
        }

        case 'GET_CAPABILITIES': {
          const caps = await adapter.capabilities();
          sendResponse({ success: true, data: caps });
          break;
        }

        case 'GET_CONTEXT': {
          const ctx = await adapter.readContext();
          sendResponse({ success: true, data: ctx });
          break;
        }

        case 'PREPARE_PLAN': {
          const prepared = await adapter.prepare(message.plan);
          sendResponse({ success: true, data: prepared });
          break;
        }

        case 'EXECUTE_OPERATION': {
          const result = await adapter.execute(message.operation);
          sendResponse({ success: true, data: result });
          break;
        }

        case 'VERIFY_OPERATION': {
          const verification = await adapter.verify(message.operation);
          sendResponse({ success: true, data: verification });
          break;
        }

        case 'UNDO_RECEIPT': {
          const undoRes = await adapter.undo(message.receipt);
          sendResponse({ success: true, data: undoRes });
          break;
        }

        default:
          sendResponse({ success: false, error: `Tipo de mensagem desconhecido: ${message.type}` });
      }
    } catch (err: any) {
      console.error('[Wide Studio ContentScript] Erro ao processar mensagem:', message.type, err);
      sendResponse({ success: false, error: err?.message || 'Erro interno no content script' });
    }
  })();

  // Retorna true para indicar resposta assíncrona ao chrome.runtime.sendMessage
  return true;
});

