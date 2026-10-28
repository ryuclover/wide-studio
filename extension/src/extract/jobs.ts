import {extractionUrl} from './client';
import {websiteOrigins} from './websites';
export type WebJob={id:string;tabId:number;project:string;binding:'instance'|'persistent';url:string;phase:'queued'|'preparing'|'downloading'|'importing'|'done'|'error'|'unknown';created:number;updated:number;workerTabId?:number;providerTabId?:number;bytes?:number;name?:string;detail?:string;error?:string;result?:{imported:boolean;name:string;bytes:number}};
export const jobKey=(id:string)=>'webImportJob:'+id;
const activeKey=(tab:number)=>'webImportActive:'+tab;
const terminal=(j:WebJob)=>['done','error','unknown'].includes(j.phase);
export async function readJob(id:string){return (await chrome.storage.session.get(jobKey(id)))[jobKey(id)] as WebJob|undefined;}
export async function updateJob(id:string,patch:Partial<WebJob>){const job=await readJob(id);if(!job)throw new Error('Importação não encontrada.');const next={...job,...patch,updated:Date.now()};await chrome.storage.session.set({[jobKey(id)]:next});return next;}
export async function getWebJob(tabId:number,id?:string){
 const active=(await chrome.storage.session.get(activeKey(tabId)))[activeKey(tabId)];if(!active)return null;
 if(id&&id!==active)throw new Error('Importação de outra aba ou já substituída.');
 const job=await readJob(active);if(!job||job.tabId!==tabId)return null;
 if(job.phase==='queued'&&Date.now()-job.updated>30000){if(job.workerTabId)await chrome.tabs.remove(job.workerTabId).catch(()=>{});return updateJob(job.id,{phase:'error',error:'O processamento não iniciou. Tente novamente.'});}
 if(!terminal(job)&&job.workerTabId){let exists=true;try{await chrome.tabs.get(job.workerTabId);}catch{exists=false;}
  if(!exists){if(job.providerTabId){const tab=await chrome.tabs.get(job.providerTabId).catch(()=>undefined);if(tab?.url?.startsWith('https://tubdown.com/')||tab?.url?.startsWith('https://snapinsta.ai/'))await chrome.tabs.remove(job.providerTabId).catch(()=>{});}
   await chrome.tabs.sendMessage(tabId,{type:'EXTRACT_IMPORT_ABORT',transferId:job.id,expectedProjectId:job.project,projectBinding:job.binding}).catch(()=>{});
   return updateJob(job.id,{phase:job.phase==='importing'?'unknown':'error',error:job.phase==='importing'?'A importação foi interrompida. Confira a Biblioteca antes de repetir.':'A aba de processamento foi fechada. Tente novamente.'});
  }
 }
 return job;
}
export async function startWebJob(tabId:number,project:string,source:unknown,requestId:unknown,binding:'instance'|'persistent'='instance'){
 if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/.test(requestId))throw new Error('Identificador de importação inválido.');
 const url=extractionUrl(source);if(!await chrome.permissions.contains({origins:websiteOrigins(url)}))throw new Error('Permita o acesso ao site de extração para continuar.');
 const same=await readJob(requestId);if(same){if(same.tabId!==tabId||same.project!==project||same.url!==url||same.binding!==binding)throw new Error('Importação de outro projeto.');return same;}
 const old=await getWebJob(tabId);if(old&&!terminal(old))throw new Error('Aguarde a importação atual.');
 const job:WebJob={id:requestId,tabId,project,binding,url,phase:'queued',created:Date.now(),updated:Date.now()};
 await chrome.storage.session.set({[jobKey(job.id)]:job,[activeKey(tabId)]:job.id});
 try{const worker=await chrome.tabs.create({url:chrome.runtime.getURL('extract-worker.html?jobId='+job.id),active:false});if(!worker.id)throw new Error('Não foi possível iniciar o processamento.');return updateJob(job.id,{workerTabId:worker.id});}
 catch(error){await updateJob(job.id,{phase:'error',error:String(error)});throw error;}
}
