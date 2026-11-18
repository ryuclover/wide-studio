import {supportsEditor} from '../../integrations/wide/compatibility';
import {clipLinkKey} from './linkedClips';
import {withHistoryBatch} from '../../core/historyBatch';
import {translateUiText} from '../../i18n/common';
import {nativeMediaPhase} from '../../integrations/wide/media';
type ClipNode=HTMLElement&{init:any;timing:any;onClick:(e:MouseEvent)=>void};
type Plan={root:HTMLElement;project:any;clips:Set<any>;layer:any;start:number;end:number;signature:string;timing:(c:any)=>any};
let busy=false;
const pause=()=>new Promise(r=>setTimeout(r,60));
const all=(p:any)=>p.presentation.layer.flatMap((l:any)=>l.clip);
export function mergeIsBusy(){return busy;}
export function mergeSignature(project:any,timing:(clip:any)=>any,omit=new Set<any>()){
 return JSON.stringify({scene:project.presentation.scene,layers:project.presentation.layer.map((l:any)=>({locked:l.locked,disabled:l.disabled,clips:l.clip.filter((c:any)=>!omit.has(c)).map((c:any)=>({key:clipLinkKey(c),locked:c.locked,disabled:c.disabled,time:timing(c).presentation}))}))});
}
export function validateMergeSelection(project:any,clips:Set<any>,timing:(c:any)=>any){
 if(!supportsEditor(project?.metadata?.appVersion)||clips.size<2)throw Error('Selecione pelo menos dois clipes na timeline.');
 const present=new Set<any>(all(project));let start=Infinity,end=-Infinity;
 for(const clip of clips){const layer=project.presentation.layer.find((l:any)=>l.clip.includes(clip)),time=timing(clip)?.presentation;
  if(!present.has(clip)||!layer||layer.locked||layer.disabled||clip.locked||clip.disabled)throw Error('Desbloqueie e ative os clipes e suas camadas antes de mesclar.');
  if(!Number.isFinite(time?.start)||!Number.isFinite(time?.end)||time.end<=time.start)throw Error('O tempo de um dos clipes não está disponível.');
  start=Math.min(start,time.start);end=Math.max(end,time.end);
 }
 // Deleting a mask/clone source referenced by another clip would change it.
 for(const clip of present)if(!clips.has(clip)){
  const seen=new Set<any>();const references=(value:any):boolean=>{if(!value||typeof value!=='object'||seen.has(value))return false;seen.add(value);return Object.entries(value).some(([key,item])=>key==='clip'&&clips.has(item)||key!=='media'&&key!=='cache'&&references(item));};
  if(references(clip.load)||references(clip.filter))throw Error('Há outro clipe usando um dos selecionados como máscara ou clone. Remova essa dependência antes de mesclar.');
 }
 return {start,end};
}
function makePlan(root:HTMLElement,clips:Set<any>):Plan{
 const project=(root as any).project,node=root.querySelector<ClipNode>('.TimelineClipContainer');let proto=node&&Object.getPrototypeOf(node),getter:any;
 while(proto&&!getter){getter=Object.getOwnPropertyDescriptor(proto,'timing')?.get;proto=Object.getPrototypeOf(proto);}
 if(!getter)throw Error('O controle de tempo do Wide não está disponível.');
 const timing=(clip:any)=>getter.call({init:{clip}}),range=validateMergeSelection(project,clips,timing);
 // Native layers are ordered bottom to top. Insert on the highest selected layer.
 const layer=[...project.presentation.layer].reverse().find((l:any)=>l.clip.some((c:any)=>clips.has(c)));
 return {root,project,clips:new Set(clips),layer,...range,timing,signature:mergeSignature(project,timing)};
}
function assertPlan(plan:Plan,omit=new Set<any>()){
 if(!plan.root.isConnected||(plan.root as any).project!==plan.project||mergeSignature(plan.project,plan.timing,omit)!==plan.signature)throw Error('O projeto mudou durante a mesclagem. Os clipes originais foram mantidos.');
 validateMergeSelection(plan.project,plan.clips,plan.timing);
}
async function until<T>(read:()=>T|undefined,timeout=15000):Promise<T>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=read();if(value!==undefined)return value;await pause();}throw Error('O Wide demorou a responder. Confira o editor antes de repetir.');}
function status(doc:Document,text:string){let node=doc.querySelector<HTMLElement>('.ws-merge-status');if(!node){node=doc.createElement('div');node.className='ws-selection-toast ws-merge-status';node.setAttribute('role','status');doc.body.append(node);}node.textContent=text;}
function select(plan:Plan,clips:Set<any>){
 const panel=plan.root.querySelector('.MediaPanel') as any;panel.onMediaListSelectMedia(undefined,false);
 const nodes=[...plan.root.querySelectorAll<ClipNode>('.TimelineClipContainer')];
 for(const clip of clips){const node=nodes.find(n=>n.init.clip===clip);if(!node)throw Error('Um clipe não está visível na timeline. Os originais foram mantidos.');node.onClick(new MouseEvent('click',{ctrlKey:true,metaKey:true,cancelable:true}));}
}
async function closeCompletedProgress(doc:Document,project:any){
 await until(()=>[...doc.querySelectorAll('.ShowProgressPopup')].some((node:any)=>node.mainAction?.data?.service?.project===project&&node.mainActionComplete)?true:undefined);
 for(const node of doc.querySelectorAll('.ShowProgressPopup') as any){if(node.mainAction?.data?.service?.project===project&&node.mainActionComplete)node.closest('dialog')?.querySelector('button.close')?.click();}
}
async function replaceFromFile(plan:Plan,file:File){
 assertPlan(plan);if(!(file instanceof File)||!file.size||file.size>200*1024*1024)throw Error('O resultado está vazio ou excede 200 MB. Os clipes originais foram mantidos.');
 const doc=plan.root.ownerDocument,previous=new Set(plan.project.mediaList),extension=file.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'')||'mp4';
 const name=`Mesclado-${Date.now()}.${extension}`,copy=new File([file],name,{type:file.type}),transfer=new DataTransfer();transfer.items.add(copy);
 await closeCompletedProgress(doc,plan.project);await until(()=>!doc.querySelector('dialog[open]:not(.ContextMenu)')?true:undefined);
 const library=plan.root.querySelector('.MediaListView');if(!library)throw Error('A Biblioteca não está disponível.');
 status(doc,'Mesclando: importando e verificando o vídeo gerado…');library.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
 const media:any=await until(()=>{
  if((plan.root as any).project!==plan.project)throw Error('O projeto mudou. Os originais foram mantidos.');
  const media=plan.project.mediaList.find((m:any)=>!previous.has(m)&&m.original?.file?.name===name);
  if(nativeMediaPhase(media)==='invalid')throw Error('O Wide não conseguiu ler o vídeo gerado. Os originais foram mantidos.');
  return media?.available&&nativeMediaPhase(media)==='valid'?media:undefined;
 },120000);
 assertPlan(plan);
 await withHistoryBatch(plan.project,async()=>{
  // Only native creation/deletion commands mutate the presentation.
  const panel=plan.root.querySelector('.MediaPanel') as any;panel.onMediaListSelectMedia(media,false);
  plan.root.querySelector<HTMLButtonElement>('.MediaPanel .Controls .addClip')!.click();
  const form:any=await until(()=>doc.querySelector('dialog[open] .AddClipForm')||undefined);
  if(form.init?.project!==plan.project||form.loadSelector?.value?.source!=='media'||form.loadSelector.value.media!==media)throw Error('O Wide não selecionou a mídia mesclada. Os originais foram mantidos.');
  const index=form.layerRow.map.indexOf(plan.layer);if(index<0)throw Error('A camada de destino não está disponível.');
  form.layerRow.updateValue(String(index));form.timeRow.updateValue(String(plan.start));form.submit('user');
  const merged:any=await until(()=>all(plan.project).find((c:any)=>c.load?.source==='media'&&c.load.media===media));
  const time=plan.timing(merged).presentation,tolerance=1/plan.project.presentation.scene.frameRate+.015;
  if(Math.abs(time.start-plan.start)>tolerance||Math.abs(time.end-plan.end)>tolerance)throw Error('A duração do vídeo gerado não corresponde à seleção. Os originais foram mantidos; confira o novo clipe.');
  // Ignore the new clip in the original signature; require every source intact.
  assertPlan(plan,new Set([merged]));
  select(plan,plan.clips);
  const source=[...plan.root.querySelectorAll<ClipNode>('.TimelineClipContainer')].find(n=>plan.clips.has(n.init.clip)) as any;
  const items=source?.contextMenu?.itemProvider(new MouseEvent('contextmenu'));
  const remove=items?.find((i:any)=>typeof i.label==='string'&&/^Delete Clips?$/i.test(translateUiText(i.label,'en').trim()));
  if(!remove?.callback)throw Error('O comando nativo de exclusão não está disponível. Os originais foram mantidos; confira o novo clipe.');
  remove.callback();await until(()=>[...plan.clips].every(c=>!all(plan.project).includes(c))?true:undefined);
  const mergedNode=[...plan.root.querySelectorAll<ClipNode>('.TimelineClipContainer')].find(n=>n.init.clip===merged);if(mergedNode)select(plan,new Set([merged]));
  // Native saves are asynchronous. Keep the history batch open until its
  // final snapshot actually exists; a fixed delay could expose a partial undo.
  let saved:any,stableSince=0;
  await until(()=>{
   if((plan.root as any).project!==plan.project)throw Error('O projeto mudou durante o salvamento. Confira a timeline.');
   const point=(plan.root.querySelector('.EditMenu') as any)?.data?.versionPoint?.current;
   if(!point||point.version!==plan.project.metadata.version){saved=undefined;stableSince=0;return undefined;}
   if(saved!==point){saved=point;stableSince=Date.now();}
   return Date.now()-stableSince>=250?true:undefined;
  },15000);
 });
 status(doc,`Clipes mesclados em ${name}. Use Desfazer para restaurar os originais.`);setTimeout(()=>doc.querySelector('.ws-merge-status')?.remove(),6000);
}
export async function startMergeClips(root:HTMLElement,clips:Set<any>){
 if(busy)throw Error('Já existe uma mesclagem em andamento.');
 const plan=makePlan(root,clips),doc=root.ownerDocument;
 if(doc.querySelector('dialog[open]:not(.ContextMenu)'))throw Error('Feche a janela aberta no editor antes de mesclar.');
 busy=true;let submitted=false,restore:(()=>void)|undefined;
 try{
  // Open the native export settings rather than silently choosing a lossy or
  // opaque format. Force the exact selected interval and original resolution.
  root.querySelector<HTMLElement>('.MenuBar .ProjectMenu')!.click();
  const exportButton=await until(()=>doc.querySelector<HTMLButtonElement>('dialog.ContextMenu.menuBarMenu[open] button.export')||undefined);exportButton.click();
  const form:any=await until(()=>doc.querySelector('.ExportForm')||undefined);
  if(form.project!==plan.project)throw Error('O projeto mudou.');
  const configure=()=>{form.contentRow.updateValue('selectedClips');form.selectedClips={clips:plan.clips,start:plan.start,end:plan.end};form.timeTrimRow.updateStartValue(plan.start);form.timeTrimRow.updateDurationValue(plan.end-plan.start);form.scaleRow.updateValue('');form.render();};configure();
  for(const row of [form.contentRow,form.timeTrimRow,form.scaleRow])for(const input of row.querySelectorAll('input,select,button'))input.disabled=true;
  form.timeTrimRow.style.display='none';
  const note=doc.createElement('p');note.className='ws-merge-note';note.textContent=`Mesclar ${clips.size} clipes em um vídeo (${(plan.end-plan.start).toFixed(2)} s). Revise vídeo e áudio abaixo antes de continuar. Os efeitos serão renderizados; a transparência depende do formato escolhido. A mídia gerada ficará na Biblioteca. Os originais só serão removidos após a verificação.`;
  form.closest('.ExportPopup').prepend(note);form.exportButton.textContent='Mesclar clipes';
  const original=form.submit;let watcher:MutationObserver|undefined;restore=()=>{watcher?.disconnect();form.submit=original;note.remove();if(submitted&&form.isConnected)form.closest('dialog')?.querySelector('button.close')?.click();};
  form.submit=function(){if(submitted)return;
   try{assertPlan(plan);if(!plan.project.output.video||!plan.project.output.audio)throw Error('Ative vídeo e áudio nas configurações de saída antes de mesclar.');configure();submitted=true;watcher?.disconnect();original.call(form);
    const action=form.action;if(!action)throw Error('A renderização não foi iniciada.');
    void (async()=>{status(doc,'Mesclando: renderizando a seleção com o motor do Wide…');
     const outcome=await action.promise;if(outcome.kind!=='complete')throw Error(outcome.kind==='cancel'?'Mesclagem cancelada. Os originais foram mantidos.':'A renderização falhou. Os originais foram mantidos.');
     const file:File=await until(()=>{const popup=[...doc.querySelectorAll('.ShowProgressPopup')].find((n:any)=>n.mainAction?.data?.service?.project===plan.project&&n.serviceName==='Export') as any;return popup&&[...popup.mainBarMap.values()].map((v:any)=>v.data.result).find((r:any)=>r?.kind==='export')?.file?.file;});
     await replaceFromFile(plan,file);
    })().catch(e=>{status(doc,String(e).replace(/^Error: /,''));}).finally(()=>{restore?.();busy=false;});
   }catch(e){submitted=false;if(form.isConnected)watcher?.observe(doc.body,{subtree:true,childList:true});else busy=false;status(doc,String(e).replace(/^Error: /,''));}
  };
  // Closing the settings without submitting must release the operation lock.
  watcher=new MutationObserver(()=>{if(!form.isConnected&&!submitted){restore?.();busy=false;}});watcher.observe(doc.body,{subtree:true,childList:true});
 }catch(e){restore?.();busy=false;throw e;}
}
