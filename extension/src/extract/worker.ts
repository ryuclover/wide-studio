import {readJob,updateJob} from './jobs';
import {resolveWebsite,transferWebsite} from './websites';
import {YOUTUBE_MAX_BYTES} from './limits';
import {EXTRACT_MAX_BYTES} from './client';
export async function runWebImportJob(id:string,workerTabId:number){
 if(!/^[a-f0-9-]{36}$/.test(id))return;
 let job=await readJob(id);for(let n=0;job&&!job.workerTabId&&n<200;n++){await new Promise(r=>setTimeout(r,100));job=await readJob(id);}
 if(!job||job.workerTabId!==workerTabId||job.phase!=='queued')return;
 const send=async(message:any)=>{const r=await chrome.tabs.sendMessage(job!.tabId,{...message,projectBinding:job!.binding});if(!r?.success)throw Object.assign(new Error(r?.error||'O editor não respondeu. Recarregue o wide.video.'),{code:r?.success===false?'EDITOR_REJECTED':'EDITOR_CONNECTION'});return r.data;};
 let phase='preparing',started=false;
 try{
  await updateJob(id,{phase:'preparing'});
  const initial=await send({type:'GET_CONTEXT'});if((job.binding==='persistent'?initial.project.persistentId:initial.project.id)!==job.project)throw new Error('O projeto mudou. O vídeo não foi importado.');
  const item=await resolveWebsite(job.url,async providerTabId=>{await updateJob(id,{providerTabId});},async detail=>{await updateJob(id,{detail});});
  await send({type:'EXTRACT_IMPORT_BEGIN',transferId:id,expectedProjectId:job.project,name:item.name});started=true;phase='downloading';await updateJob(id,{phase:'downloading',name:item.name,bytes:0});
  let index=0,received=0,last=0;
  const bytes=await transferWebsite(item.url,new URL(job.url).hostname==='www.youtube.com'?YOUTUBE_MAX_BYTES:EXTRACT_MAX_BYTES,async base64=>{
   await send({type:'EXTRACT_IMPORT_CHUNK',transferId:id,expectedProjectId:job!.project,index:index++,base64});received+=Math.floor(base64.length*3/4)-(base64.endsWith('==')?2:base64.endsWith('=')?1:0);
   if(Date.now()-last>500){last=Date.now();await updateJob(id,{bytes:received});}
  });
  phase='importing';await updateJob(id,{phase:'importing',bytes,detail:'Arquivo recebido. Adicionando à Biblioteca…'});
  let result:any;
  const status=async()=>{
   let last:unknown;
   for(let attempt=0;attempt<5;attempt++){
    try{return await send({type:'EXTRACT_IMPORT_STATUS',transferId:id,expectedProjectId:job!.project});}
    catch(error){if((error as any)?.code==='EDITOR_REJECTED')throw error;last=error;await new Promise(r=>setTimeout(r,500));}
   }
   throw last;
  };
  try{result=await send({type:'EXTRACT_IMPORT_FINISH',transferId:id,expectedProjectId:job.project,bytes});}
  catch(error){if((error as any)?.code==='EDITOR_REJECTED')throw error;result=await status();} // Never resend FINISH after a lost acknowledgement.
  // Finishing only starts native processing. Poll short receipts instead of leaving
  // another message channel open while the editor probes/saves a large file.
  const deadline=Date.now()+11*60*1000;
  while(result?.phase==='processing'&&Date.now()<deadline){
   await updateJob(id,{detail:result.detail||'O Wide está analisando o vídeo…'});
   await new Promise(r=>setTimeout(r,800));
   result=await status();
  }
  if(result?.phase==='error')throw new Error(result.error||'O Wide recusou o vídeo.');
  if(result?.phase==='done')result=result.result;
  if(!result?.imported)throw new Error('Importação não confirmada. Confira a Biblioteca antes de repetir.');
  await updateJob(id,{phase:'done',result});
 }catch(error){if(started)await send({type:'EXTRACT_IMPORT_ABORT',transferId:id,expectedProjectId:job.project}).catch(()=>{});
  const reason=String(error).replace(/^(?:Error: )+/,'');
  await updateJob(id,{phase:phase==='importing'?'unknown':'error',error:phase==='importing'?`${reason} Confira a Biblioteca antes de repetir.`:reason});
 }finally{await chrome.tabs.remove(workerTabId).catch(()=>{});}
}
