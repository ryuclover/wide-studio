import {startWebJob,getWebJob} from '../extract/jobs';

import { StorageService } from '../storage';

import { MockProvider } from '../providers/mockProvider';

import { NIMProvider } from '../providers/nimProvider';

import { EditPlan, PreparedPlan, OperationResult, UndoReceipt } from '../types/commands';

import { EditorContext } from '../types/context';

import { EditPlanSchema } from '../commands/schemas';

import { SeekArgsSchema } from '../commands/schemas';

import { secondsToFrames } from '../commands/temporal';

import { loadPoints, savePoints } from '../storage/points';

import type { ProjectSnapshot } from '../types/snapshot';

import {MenuLayoutSchema,defaultMenuLayout} from '../storage/menuLayout';

import {listPublicFolder,downloadPublicMedia,publicThumbnail,driveId,MAX_MEDIA_BYTES,type PublicDriveItem} from '../drive/publicDrive';

import {extractionUrl,helperRequest} from '../extract/client';

const publicDriveItems=new Map<string,PublicDriveItem>();

const driveJobs=new Set<number>();

const driveDrags=new Map<string,{tabId:number;project:string;fileId:string;light:boolean;expires:number}>();

async function knownDriveItem(id:string){

 const key=driveId(id);if(publicDriveItems.has(key))return publicDriveItems.get(key)!;

 const saved=await chrome.storage.session.get('driveItems');const item=saved.driveItems?.[key] as PublicDriveItem|undefined;

 if(!item||item.id!==key)throw new Error('Atualize a pasta antes de usar este arquivo.');publicDriveItems.set(key,item);return item;

}



async function mediaFromDrive(item:PublicDriveItem,light:boolean){

 if(light&&!/^image\/(jpeg|png|webp)$/.test(item.mime))throw new Error('Cópia leve disponível somente para imagens estáticas.');

 if(!light&&item.size&&item.size>MAX_MEDIA_BYTES)throw new Error('Original maior que 20 MB. Abra a prévia para usar cópia leve.');

 const media=light?await publicThumbnail(item.id,true):await downloadPublicMedia(item.id,item.name,item.mime);

 const name=light?`${item.name.replace(/\.[^.]+$/,'').replace(/[\\/\x00-\x1f]/g,'_').slice(0,140)}-leve.${media.mime.split('/')[1].replace('jpeg','jpg')}`:item.name.replace(/[\\/\x00-\x1f]/g,'_').slice(0,180);

 return {...media,name};

}

async function completeDriveDrop(tabId:number,dragToken:string,dropToken:string){

 const drag=driveDrags.get(dragToken);driveDrags.delete(dragToken);

 if(!drag||drag.tabId!==tabId||drag.expires<Date.now())throw new Error('O arrasto expirou. Arraste a mídia do Drive novamente.');

 if(driveJobs.has(tabId))throw new Error('Aguarde a importação atual.');driveJobs.add(tabId);

 try{

  const context=await send<EditorContext>(tabId,{type:'GET_CONTEXT'});if(context.project.id!==drag.project)throw new Error('O projeto mudou durante o arrasto.');

  const driveKey=drag.fileId+(drag.light?':light':':original');

  let result:any=await send(tabId,{type:'DROP_DRIVE_MEDIA',driveKey,expectedProjectId:drag.project,dropToken});

  if(!result.found){const item=await knownDriveItem(drag.fileId),media=await mediaFromDrive(item,drag.light);await send(tabId,{type:'IMPORT_DRIVE_MEDIA',driveKey,expectedProjectId:drag.project,...media});result=await send(tabId,{type:'DROP_DRIVE_MEDIA',driveKey,expectedProjectId:drag.project,dropToken});}

  if(!result.inserted)throw new Error('Inserção não confirmada. Confira a Biblioteca e a timeline antes de repetir.');

  return {...result,fileId:drag.fileId};

 }finally{driveJobs.delete(tabId);}

}

// Embed an extension-origin iframe, preserving the privileged UI boundary.

chrome.action?.onClicked?.addListener(async tab => {

  if (!tab.id || !tab.url || new URL(tab.url).hostname !== 'wide.video') {

    await chrome.tabs.create({ url: 'https://wide.video/app/1.7.12/' }); return;

  }

  const url = chrome.runtime.getURL(`sidepanel.html?editorTabId=${tab.id}`);

  try { await send(tab.id,{type:'TOGGLE_OVERLAY',url}); }

  catch { await chrome.action.setBadgeText({tabId:tab.id,text:'↻'}); await chrome.action.setTitle({tabId:tab.id,title:'Recarregue o wide.video para abrir Wide Studio'}); }

});

chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(console.warn);

const pending = new Map<string, { tabId: number; plan: EditPlan }>();

const undoTabs = new Map<string, number>();

let busy = false;

let pointsBusy = false;



async function activeTab(boundId?: number): Promise<number> {

  if (boundId !== undefined) {

    if (!Number.isSafeInteger(boundId) || boundId < 0) throw new Error('Aba inválida.');

    const bound = await chrome.tabs.get(boundId);

    if (!bound.url || new URL(bound.url).hostname !== 'wide.video' || !new URL(bound.url).pathname.startsWith('/app/')) throw new Error('A aba deste painel foi fechada ou saiu do editor.');

    return boundId;

  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url || new URL(tab.url).hostname !== 'wide.video' || !new URL(tab.url).pathname.startsWith('/app/')) throw new Error('Mantenha a aba do editor ativa para conectar.');

  return tab.id;

}

async function send<T>(tabId: number, message: unknown): Promise<T> {

  const response = await chrome.tabs.sendMessage(tabId, message);

  if (!response?.success) throw new Error(response?.error || 'Editor indisponível; recarregue a aba após instalar a extensão.');

  return response.data;

}

async function guardTransaction() {

  const old = await StorageService.getTransaction();

  if (old && (old.status === 'running' || old.status === 'verifying')) throw new Error('Resultado anterior desconhecido após interrupção. Confira o editor e descarte a transação pendente antes de continuar.');

}

type ExtractionBinding={tabId:number;project:string;kind:'inspect'|'extract';importing?:boolean;created:number};

async function extractorToken(ensureService=false){

 const value=await chrome.storage.local.get('extractorToken'),saved=typeof value.extractorToken==='string'&&/^[\w-]{32,100}$/.test(value.extractorToken)?value.extractorToken:undefined;

 if(!ensureService&&saved)return saved;

 try{const r=await chrome.runtime.sendNativeMessage('com.widestudio.extractor',{type:'connect'});if(!r?.success||r.protocol!==2||typeof r.token!=='string'||!/^[\w-]{32,100}$/.test(r.token))throw new Error();await chrome.storage.local.set({extractorToken:r.token});return r.token as string;}catch{}

 if(saved)return saved;

 throw new Error('Execute CONFIGURAR.cmd na pasta auxiliar-extrair uma vez para preparar o serviço de vídeo.');

}

async function extractionBindings(){return ((await chrome.storage.session.get('extractionJobs')).extractionJobs||{}) as Record<string,ExtractionBinding>;}



chrome.runtime.onMessage.addListener((message, sender, reply) => {

  if(message?.type==='SW_GET_EXTRACT_URL'&&sender.id===chrome.runtime.id&&sender.tab?.id&&sender.url?.startsWith('https://wide.video/app/')){

    reply({success:true,data:{url:chrome.runtime.getURL(`extract.html?editorTabId=${sender.tab.id}`)}});return;

  }

    if(message?.type==='SW_DRIVE_DROP_FEEDBACK'&&sender.id===chrome.runtime.id&&sender.tab?.id&&sender.url?.startsWith('https://wide.video/app/')){

      const drag=driveDrags.get(message.dragToken);

      if(drag?.tabId!==sender.tab.id||typeof message.error!=='string'){reply({success:false});return;}

      driveDrags.delete(message.dragToken);

      void chrome.runtime.sendMessage({type:'DRIVE_DROP_RESULT',dragToken:message.dragToken,success:false,error:message.error.slice(0,400)}).catch(()=>{});reply({success:true});return;

    }

  if(message?.type==='SW_DRIVE_DROP' && sender.id===chrome.runtime.id && sender.tab?.id && sender.url?.startsWith('https://wide.video/app/')){

    if(typeof message.dragToken!=='string'||!/^[-\w]{36}$/.test(message.dragToken)||typeof message.dropToken!=='string'||!/^[-\w]{36}$/.test(message.dropToken)){reply({success:false,error:'Arrasto inválido.'});return;}

    void completeDriveDrop(sender.tab.id,message.dragToken,message.dropToken).then(data=>{const result={success:true,data};reply(result);void chrome.runtime.sendMessage({type:'DRIVE_DROP_RESULT',dragToken:message.dragToken,...result}).catch(()=>{});}).catch(e=>{const result={success:false,error:String(e)};reply(result);void chrome.runtime.sendMessage({type:'DRIVE_DROP_RESULT',dragToken:message.dragToken,...result}).catch(()=>{});});return true;

  }

  if(message?.type==='SW_GET_DRIVE_URL' && sender.id===chrome.runtime.id && sender.tab?.id && sender.url?.startsWith('https://wide.video/app/')){

    reply({success:true,data:{url:chrome.runtime.getURL(`drive.html?editorTabId=${sender.tab.id}`)}});return;

  }

  if (['SW_GET_MENU_LAYOUT','SW_SAVE_MENU_LAYOUT'].includes(message?.type) && sender.id===chrome.runtime.id && sender.tab?.id && sender.url?.startsWith('https://wide.video/app/')) {

    void(async()=>{if(message.type==='SW_SAVE_MENU_LAYOUT'){const layout=MenuLayoutSchema.parse(message.layout);await chrome.storage.local.set({menuLayout:layout});return layout;}const stored=await chrome.storage.local.get('menuLayout');return MenuLayoutSchema.safeParse(stored.menuLayout).success?stored.menuLayout:defaultMenuLayout;})().then(data=>reply({success:true,data})).catch(e=>reply({success:false,error:String(e)}));return true;

  }

  if (message?.type==='SW_OPEN_SMART_TOOL' && sender.id===chrome.runtime.id && sender.tab?.id && sender.url?.startsWith('https://wide.video/app/')) {

    if(!['silenceRemover','captionsGenerator'].includes(message.tool)){reply({success:false,error:'Ferramenta inválida'});return;}

    void send(sender.tab.id,{type:'OPEN_SMART_TOOL',tool:message.tool}).then(data=>reply({success:true,data})).catch(e=>reply({success:false,error:String(e)}));return true;

  }

  if (message?.type === 'SW_GET_ASSISTANT_URL' && sender.id === chrome.runtime.id && sender.tab?.id && sender.url?.startsWith('https://wide.video/app/')) {

    reply({ success: true, data: { url: chrome.runtime.getURL(`assistant.html?editorTabId=${sender.tab.id}`) } });

    return;

  }

  // Content scripts can access this one visual preference, never the storage API or credentials.

  if ((message?.type === 'SW_GET_WORKSPACE_APPEARANCE' || message?.type === 'SW_SAVE_WORKSPACE_APPEARANCE') &&

      sender.id === chrome.runtime.id && sender.tab?.id && sender.url?.startsWith('https://wide.video/app/')) {

    void (async () => {

      if (message.type === 'SW_SAVE_WORKSPACE_APPEARANCE') {

        if (typeof message.simple !== 'boolean') throw new Error('Aparência inválida.');

        await chrome.storage.local.set({ wideStudioWorkspaceEnabled: message.simple, wideStudioLayoutRevision: 2 });

        return { simple: message.simple };

      }

      const revision = await chrome.storage.local.get('wideStudioLayoutRevision');

      if (revision.wideStudioLayoutRevision !== 2) {

        // Start the redesigned editor enabled once; later explicit choices stay saved.

        await chrome.storage.local.set({ wideStudioWorkspaceEnabled: true, wideStudioLayoutRevision: 2 });

        return { simple: true };

      }

      const stored = await chrome.storage.local.get('wideStudioWorkspaceEnabled');

      return { simple: stored.wideStudioWorkspaceEnabled !== false };

    })().then(data => reply({ success: true, data })).catch(e => reply({ success: false, error: String(e) }));

    return true;

  }

  // The sole page-context request may open its own bound UI; never accepts a tab ID or URL.

  if (message?.type==='SW_OPEN_OVERLAY' && sender.id===chrome.runtime.id && sender.tab?.id && sender.url?.startsWith('https://wide.video/app/')) {

    void send(sender.tab.id,{type:'TOGGLE_OVERLAY',url:chrome.runtime.getURL(`sidepanel.html?editorTabId=${sender.tab.id}`)}).then(data=>reply({success:true,data})).catch(e=>reply({success:false,error:String(e)}));

    return true;

  }

  // The page/content script cannot read secrets or invoke the privileged orchestrator.

  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;

  const getEditorTab = () => activeTab(message?.editorTabId);

  (async () => {

    let ownsLock = false;

    try {

      switch (message?.type) {

        case 'SW_WEB_STATUS': {
          const tabId=await getEditorTab();reply({success:true,data:await getWebJob(tabId,message.jobId)});return;
        }
        case 'SW_WEB_IMPORT': {
          const tabId=await getEditorTab();if(driveJobs.has(tabId))throw new Error('Aguarde a importação atual.');
          driveJobs.add(tabId);try{const context=await send<EditorContext>(tabId,{type:'GET_CONTEXT'});const job=await startWebJob(tabId,context.project.persistentId||context.project.id,message.url,message.requestId,context.project.persistentId?'persistent':'instance');reply({success:true,data:job});return;}finally{driveJobs.delete(tabId);}
        }

        case 'SW_EXTRACT_START': {

          if(message.flow!=='simple')throw new Error('Recarregue a página para atualizar a aba Extrair.');

          const tabId=await getEditorTab(),context=await send<EditorContext>(tabId,{type:'GET_CONTEXT'}),kind='extract';const url=extractionUrl(message.url),token=await extractorToken(true);

          const health=await helperRequest(token,'/health');if(health.protocol!==2)throw new Error('Atualize o serviço de vídeo executando INICIAR.cmd novamente.');

          const result=await helperRequest(token,'/jobs','POST',{kind,url});

          if(!/^[a-f0-9]{32}$/.test(result.id))throw new Error('Resposta inválida do auxiliar.');

          const bindings=await extractionBindings();for(const [id,b]of Object.entries(bindings))if(Date.now()-b.created>600000)delete bindings[id];bindings[result.id]={tabId,project:context.project.id,kind,created:Date.now()};await chrome.storage.session.set({extractionJobs:bindings});reply({success:true,data:result});return;

        }

        case 'SW_EXTRACT_POLL':

        case 'SW_EXTRACT_CANCEL':

        case 'SW_EXTRACT_IMPORT': {

          const tabId=await getEditorTab(),bindings=await extractionBindings(),binding=bindings[message.id];if(!/^[a-f0-9]{32}$/.test(message.id||'')||!binding||binding.tabId!==tabId)throw new Error('Extração indisponível nesta aba.');

          const token=await extractorToken(),path=`/jobs/${message.id}`;

          if(message.type==='SW_EXTRACT_CANCEL'){

            if(binding.importing)throw new Error('A importação já iniciou. Confira a Biblioteca antes de repetir.');await helperRequest(token,path,'DELETE');delete bindings[message.id];await chrome.storage.session.set({extractionJobs:bindings});reply({success:true,data:{cancelled:true}});return;

          }

          const job=await helperRequest(token,path);

          if(message.type==='SW_EXTRACT_POLL'){

            if(job.status==='ready'&&binding.kind==='inspect'){await helperRequest(token,path,'DELETE');delete bindings[message.id];await chrome.storage.session.set({extractionJobs:bindings});}

            reply({success:true,data:job});return;

          }

          if(binding.kind!=='extract'||job.status!=='ready')throw new Error('Aguarde o trecho ficar pronto.');if(binding.importing)throw new Error('Importação anterior já iniciada. Confira a Biblioteca antes de repetir.');if(driveJobs.has(tabId))throw new Error('Aguarde a importação atual nesta aba.');

          driveJobs.add(tabId);

          try{const context=await send<EditorContext>(tabId,{type:'GET_CONTEXT'});if(context.project.id!==binding.project)throw new Error('O projeto mudou. O vídeo não foi importado.');

            binding.importing=true;await chrome.storage.session.set({extractionJobs:bindings});const media=await helperRequest(token,path+'/media'),name=String(job.result?.name||'Video.mp4').slice(0,180);const result=await send(tabId,{type:'IMPORT_DRIVE_MEDIA',expectedProjectId:binding.project,name,mime:'video/mp4',base64:media.base64});

            reply({success:true,data:result});

          }finally{driveJobs.delete(tabId);await helperRequest(token,path,'DELETE').catch(()=>{});const current=await extractionBindings();delete current[message.id];await chrome.storage.session.set({extractionJobs:current});}return;

        }

          case 'SW_DRIVE_POINTER_END': {

            const tabId=await getEditorTab(),drag=driveDrags.get(message.dragToken);

            if(!drag||drag.tabId!==tabId){reply({success:true,data:{finished:true}});return;}

            if(message.cancel!==true&&(!Number.isFinite(message.x)||!Number.isFinite(message.y)))throw new Error('Coordenadas inválidas.');

            const data=await send(tabId,{type:'DRIVE_POINTER_END',dragToken:message.dragToken,x:message.x,y:message.y,cancel:message.cancel===true});reply({success:true,data});return;

          }

        case 'SW_DRIVE_ARM_DRAG': {

          const tabId=await getEditorTab(),item=await knownDriveItem(message.fileId);

          if(typeof message.dragToken!=='string'||!/^[-\w]{36}$/.test(message.dragToken))throw new Error('Arrasto inválido.');

          if(item.mime.includes('folder'))throw new Error('Arraste um arquivo.');

          if(message.light&&!/^image\/(jpeg|png|webp)$/.test(item.mime))throw new Error('Cópia leve indisponível.');

          if(!message.light&&item.size&&item.size>MAX_MEDIA_BYTES)throw new Error('Original maior que 20 MB. Use a cópia leve na prévia.');

          const context=await send<EditorContext>(tabId,{type:'GET_CONTEXT'});

          for(const [k,v]of driveDrags)if(v.expires<Date.now()||v.tabId===tabId)driveDrags.delete(k);

          if(driveDrags.size>20)driveDrags.delete(driveDrags.keys().next().value!);

          driveDrags.set(message.dragToken,{tabId,project:context.project.id,fileId:item.id,light:message.light===true,expires:Date.now()+120000});

            try{const ready=await send<{protocol:number}>(tabId,{type:'PREPARE_DRIVE_DROP',protocol:1,dragToken:message.dragToken,startedAt:message.startedAt});if(ready?.protocol!==1)throw new Error('Recarregue a página do wide.video para atualizar o receptor do Drive.');}

            catch(e){driveDrags.delete(message.dragToken);throw e;}

            reply({success:true,data:{armed:true,protocol:1}});return;

        }

        case 'SW_DRIVE_LIST': {

          await getEditorTab();

          if(!await chrome.permissions.contains({origins:['https://drive.google.com/*','https://drive.usercontent.google.com/*']}))throw new Error('Ative a conexão pública do Drive pelo botão da aba.');

          const items=await listPublicFolder(driveId(message.folder));

          for(const item of items)publicDriveItems.set(item.id,item);

          if(publicDriveItems.size>2000){publicDriveItems.clear();for(const item of items)publicDriveItems.set(item.id,item);}

          await chrome.storage.session.set({driveItems:Object.fromEntries(publicDriveItems)});

          reply({success:true,data:items});return;

        }

        case 'SW_DRIVE_THUMB': {

          await getEditorTab();

          const item=await knownDriveItem(message.fileId);if(item.mime.includes('folder'))throw new Error('Escolha um arquivo.');

          reply({success:true,data:await publicThumbnail(item.id,message.large===true)});return;

        }

        case 'SW_DRIVE_PREVIEW': {

          await getEditorTab();const item=await knownDriveItem(message.fileId);

          if(item.size&&item.size>MAX_MEDIA_BYTES)throw new Error('Prévia animada limitada a 20 MB. Abra este arquivo no Drive.');

          reply({success:true,data:await downloadPublicMedia(item.id,item.name,item.mime)});return;

        }

        case 'SW_DRIVE_IMPORT': {

          const tabId=await getEditorTab();if(driveJobs.has(tabId))throw new Error('Há uma importação do Drive em andamento.');

          driveJobs.add(tabId);

          try{

          const item=await knownDriveItem(message.fileId);

          if(message.light&&!/^image\/(jpeg|png|webp)$/.test(item.mime))throw new Error('Cópia leve disponível somente para imagens estáticas JPG, PNG e WebP.');

          if(!message.light&&item.size&&item.size>MAX_MEDIA_BYTES)throw new Error('Original maior que 20 MB. Use a cópia leve para imagens estáticas ou abra no Drive.');

          const context=await send<EditorContext>(tabId,{type:'GET_CONTEXT'});

          if(context.project.id!==message.expectedProjectId)throw new Error('O projeto mudou. Atualize antes de importar.');

          const media=message.light?await publicThumbnail(item.id,true):await downloadPublicMedia(item.id,item.name,item.mime);const name=message.light?`${item.name.replace(/\.[^.]+$/,'').replace(/[\\/\x00-\x1f]/g,'_').slice(0,140)}-leve.${media.mime.split('/')[1].replace('jpeg','jpg')}`:item.name.replace(/[\\/\x00-\x1f]/g,'_').slice(0,180);const result=await send(tabId,{type:'IMPORT_DRIVE_MEDIA',driveKey:item.id+(message.light?':light':':original'),expectedProjectId:context.project.id,...media,name});reply({success:true,data:result});}

          finally{driveJobs.delete(tabId);}return;

        }

        case 'SW_CONNECT_PROJECT': reply({success:true,data:await send(await getEditorTab(),{type:'CONNECT_PROJECT'})}); return;

        case 'SW_GET_POINTS': {

          const ctx = await send<EditorContext>(await getEditorTab(), { type: 'GET_CONTEXT' });

          if (ctx.project.id !== message.expectedProjectId || !ctx.project.persistentId) throw new Error('O projeto mudou. Atualize o painel.');

          reply({ success: true, data: await loadPoints(ctx.project.persistentId) }); return;

        }

        case 'SW_SAVE_POINTS': {

          if (pointsBusy) throw new Error('Há outra gravação de pontos em andamento.');

          pointsBusy = true;

          try {

            const ctx = await send<EditorContext>(await getEditorTab(), { type: 'GET_CONTEXT' });

            if (ctx.project.id !== message.expectedProjectId || !ctx.project.persistentId) throw new Error('O projeto mudou. Atualize o painel.');

            reply({ success: true, data: await savePoints(ctx.project.persistentId, message.expectedVersion, message.points) }); return;

          } finally { pointsBusy = false; }

        }

        case 'SW_DETECT_EDITOR': reply({ success: true, data: await send(await getEditorTab(), { type: 'GET_DETECTION' }) }); return;

        case 'SW_GET_CONTEXT': reply({ success: true, data: await send(await getEditorTab(), { type: 'GET_CONTEXT' }) }); return;

        case 'SW_GET_SNAPSHOT': reply({ success: true, data: await send(await getEditorTab(), { type: 'GET_PROJECT_SNAPSHOT' }) }); return;

        case 'SW_PROBE_BRIDGE': reply({ success: true, data: await send(await getEditorTab(), { type: 'PROBE_BRIDGE' }) }); return;

        case 'SW_OPEN_SMART_TOOL': {

          const tabId = await getEditorTab();

          reply({ success: true, data: await send(tabId, { type: 'OPEN_SMART_TOOL', tool: message.tool }) }); return;

        }

        case 'SW_SET_APPEARANCE': {

          if (typeof message.simple !== 'boolean') throw new Error('Aparência inválida.');

          const data = await send(await getEditorTab(), { type: 'SET_APPEARANCE', simple: message.simple });

          await chrome.storage.local.set({ wideStudioWorkspaceEnabled: message.simple, wideStudioLayoutRevision: 2 });

          reply({ success: true, data }); return;

        }

        case 'SW_NAVIGATE': {

          if (busy) throw new Error('Já existe uma operação em andamento.');

          busy = true; ownsLock = true;

          await guardTransaction();

          const tabId = await getEditorTab();

          const context = await send<EditorContext>(tabId, { type: 'GET_CONTEXT' });

          if (message.expectedProjectId !== context.project.id) throw new Error('O projeto mudou. Atualize o painel antes de navegar.');

          if (!context.capabilities.includes('seek')) throw new Error('Navegação indisponível neste projeto.');

          const supplied = ['frame','deltaFrames','seconds','deltaSeconds'].filter(key => message[key] !== undefined);

          if (supplied.length !== 1) throw new Error('Informe uma posição ou um deslocamento.');

          const kind = supplied[0], amount = message[kind];

          if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error('Posição inválida.');

          if ((kind === 'frame' || kind === 'deltaFrames') && (!Number.isSafeInteger(amount) || Math.abs(amount) > 100000000)) throw new Error('Frame inválido.');

          if ((kind === 'seconds' || kind === 'deltaSeconds') && (Math.abs(amount)>1000000 || (kind === 'seconds' && amount<0))) throw new Error('Tempo inválido.');

          const fps = { numerator: context.composition.fpsNumerator, denominator: context.composition.fpsDenominator };

          const value = kind === 'seconds' || kind === 'deltaSeconds' ? Math.sign(amount) * secondsToFrames(Math.abs(amount), fps) : amount;

          const { frame } = SeekArgsSchema.parse({ frame: kind.startsWith('delta') ? Math.max(0,context.composition.currentPlayheadFrame+value) : value });

          const id = crypto.randomUUID();

          const plan: EditPlan = { schemaVersion: '0.1', planId: id, projectId: context.project.id, expectedRevision: context.revision, summary: 'Mover posição de reprodução', operations: [{ operationId: id, command: 'seek', args: { frame } }] };

          const prepared = await send<PreparedPlan>(tabId, { type: 'PREPARE_PLAN', plan });

          if (!prepared.valid) throw new Error(prepared.validationError);

          if (await getEditorTab() !== tabId) throw new Error('Aba mudou durante a navegação.');

          await StorageService.setTransaction({ transactionId: id, projectId: context.project.id, status: 'running', currentStepIndex: 0, totalSteps: 1, commandName: 'seek', startedAt: Date.now() });

          const result = await send<OperationResult>(tabId, { type: 'EXECUTE_OPERATION', operation: prepared.operations[0] });

          if (result.status === 'verified' && result.undoReceipt) undoTabs.set(result.undoReceipt.receiptId, tabId);

          if (result.status !== 'unknown') await StorageService.clearTransaction();

          pending.clear();

          reply({ success: true, data: [result] }); return;

        }

        case 'SW_GET_SETTINGS': reply({ success: true, data: await StorageService.getSettings() }); return;

        case 'SW_SAVE_SETTINGS': {

          if (message.settings?.provider === 'local') throw new Error('Provedor local ainda não implementado.');

          if (message.settings?.apiEndpoint && message.settings.apiEndpoint !== 'https://integrate.api.nvidia.com/v1/chat/completions') throw new Error('Endpoint não permitido.');

          reply({ success: true, data: await StorageService.saveSettings(message.settings) }); return;

        }

        case 'SW_CLEAR_TRANSACTION': {

          if (busy) throw new Error('Aguarde a execução atual.');

          await StorageService.clearTransaction(); pending.clear();

          reply({ success: true }); return;

        }

        case 'SW_PROCESS_PROMPT': {

          if (typeof message.prompt !== 'string' || !message.prompt.trim() || message.prompt.length > 4000) throw new Error('Pedido inválido ou muito longo.');

          const history = message.history ?? [];

          if (!Array.isArray(history) || history.length>8 || history.some(item=>!item || !['user','assistant'].includes(item.role) || typeof item.content!=='string' || item.content.length>4000) || history.reduce((sum,item)=>sum+item.content.length,0)>16000) throw new Error('Histórico inválido ou muito longo.');

          const tabId = await getEditorTab();

          const context = await send<EditorContext>(tabId, { type: 'GET_CONTEXT' });

          const settings = await StorageService.getSettings();

          if (message.expectedProjectId && message.expectedProjectId !== context.project.id) throw new Error('O projeto mudou. Atualize o contexto e envie novamente.');

          if (settings.provider === 'nim' && !await chrome.permissions.contains({ origins: ['https://integrate.api.nvidia.com/*'] })) throw new Error('Ative a permissão NVIDIA nas configurações.');

          const provider = settings.provider === 'nim' ? new NIMProvider(settings.apiKey || '', settings.nimModel) : new MockProvider();

          if (settings.provider === 'nim') {

            try {

              const snapshot = await send<ProjectSnapshot>(tabId, { type:'GET_PROJECT_SNAPSHOT' });

              if (snapshot.revision === context.revision) context.observedGraph = {

                editorVersion:snapshot.editorVersion, tracks:snapshot.tracks.slice(0,100),

                clips:snapshot.clips.slice(0,300).map(clip => ({ ...clip, text:clip.text?.slice(0,2000) })),

                selection:snapshot.selection, capabilities:snapshot.capabilities,

                truncated:snapshot.tracks.length>100 || snapshot.clips.length>300 || snapshot.clips.some(clip => (clip.text?.length || 0)>2000),

              };

            } catch { /* The observed context remains available when the internal bridge is unavailable. */ }

          }

          const response = await provider.generatePlan(message.prompt, context, history);

          if (response.type !== 'plan' || !response.plan) { reply({ success: true, data: response }); return; }

          const parsed = EditPlanSchema.safeParse(response.plan);

          if (!parsed.success) throw new Error('Plano inválido do provedor. Apenas uma ação por pedido é suportada.');

          const plan = parsed.data as EditPlan;

          const preparedPlan = await send<PreparedPlan>(tabId, { type: 'PREPARE_PLAN', plan });

          if (!preparedPlan.valid) throw new Error(preparedPlan.validationError);

          pending.clear(); pending.set(plan.planId, { tabId, plan });

          reply({ success: true, data: { ...response, plan, preparedPlan } }); return;

        }

        case 'SW_APPLY_PLAN': {

          if (busy) throw new Error('Já existe uma operação em andamento.');

          busy = true; ownsLock = true;

          await guardTransaction();

          const saved = pending.get(message.plan?.planId);

          if (!saved || JSON.stringify(saved.plan) !== JSON.stringify(message.plan)) throw new Error('Plano expirado; gere outro plano.');

          if (await getEditorTab() !== saved.tabId) throw new Error('Aba mudou; volte à aba onde o plano foi preparado.');

          pending.delete(saved.plan.planId);

          const prepared = await send<PreparedPlan>(saved.tabId, { type: 'PREPARE_PLAN', plan: saved.plan });

          if (!prepared.valid) throw new Error(prepared.validationError);

          const op = prepared.operations[0];

          await StorageService.setTransaction({ transactionId: saved.plan.planId, projectId: saved.plan.projectId, status: 'running', currentStepIndex: 0, totalSteps: 1, commandName: op.command, startedAt: Date.now() });

          const result = await send<OperationResult>(saved.tabId, { type: 'EXECUTE_OPERATION', operation: op });

          if (result.undoReceipt && result.status === 'verified') undoTabs.set(result.undoReceipt.receiptId, saved.tabId);

          if (result.status !== 'unknown') await StorageService.clearTransaction();

          reply({ success: true, data: [result] }); return;

        }

        case 'SW_UNDO_RECEIPT': {

          if (busy) throw new Error('Já existe uma operação em andamento.');

          busy = true; ownsLock = true;

          await guardTransaction();

          const receipt = message.receipt as UndoReceipt;

          const tabId = undoTabs.get(receipt?.receiptId);

          if (!tabId || await getEditorTab() !== tabId) throw new Error('Desfazer indisponível nesta aba ou sessão.');

          // Journal undo too: a worker interruption must never permit blind replay.

          await StorageService.setTransaction({ transactionId: receipt.receiptId, projectId: 'receipt-bound', status: 'running', currentStepIndex: 0, totalSteps: 1, commandName: 'undo_seek', startedAt: Date.now() });

          const result = await send<{success:boolean;error?:string}>(tabId, { type: 'UNDO_RECEIPT', receipt });

          if (result.success) { undoTabs.delete(receipt.receiptId); await StorageService.clearTransaction(); }

          reply({ success: true, data: result }); return;

        }

        default: throw new Error('Mensagem não suportada.');

      }

    } catch (error) { reply({ success: false, error: String(error) }); }

    finally { if (ownsLock) busy = false; }

  })();

  return true;

});









