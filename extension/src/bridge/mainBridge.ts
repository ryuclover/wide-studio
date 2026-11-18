import {NativeDropReader} from './nativeDrop';
import {NativeMediaReceipts} from './mediaReceipt';
import { BridgeRequestSchema, BridgeResponse } from '../types/snapshot';
import { normalizeNativeProject } from './snapshotNormalizer';
import { withinMessageLimit } from './protocol';
import {supportsEditor,usesOfficialApi} from '../integrations/wide/compatibility';
import {officialApi} from '../integrations/wide/officialApi';
import {officialSnapshot} from '../integrations/wide/snapshot';
import {z} from 'zod';
const Action=z.discriminatedUnion('action',[
 z.object({action:z.literal('seek'),time:z.number().finite().nonnegative(),projectId:z.string(),revision:z.string()}).strict(),
 z.object({action:z.literal('addText')}).strict()
]);
const KEY='__WIDE_STUDIO_MAIN_BRIDGE_UNINSTALL__';
export function installMainBridge(initialSessionId?:string):()=>void {
  const previous=(window as any)[KEY];if(typeof previous==='function')previous();
  let activeSession=initialSessionId;const drops=new NativeDropReader(),receipts=new NativeMediaReceipts();
  let project:object|null=null;
  let clipIds=new WeakMap<object,string>();
  const listener=async(event:MessageEvent)=>{
    if(event.source!==window || !withinMessageLimit(event.data))return;
    const parsed=BridgeRequestSchema.safeParse(event.data);if(!parsed.success)return;
    const req=parsed.data;
    const reply=(success:boolean,data?:unknown,code?:string,message?:string)=>{
      let response:BridgeResponse={source:'wide-studio-main',target:'wide-studio-content',sessionId:req.sessionId,requestId:req.requestId,type:success?(req.type==='WIDE_BRIDGE_HANDSHAKE'?'WIDE_BRIDGE_HANDSHAKE_ACK':'WIDE_BRIDGE_RESPONSE'):'WIDE_BRIDGE_ERROR',success,data,...(!success?{error:{code:code!,message:message||code!}}:{})};
      if(!withinMessageLimit(response))response={...response,type:'WIDE_BRIDGE_ERROR',success:false,data:undefined,error:{code:'BRIDGE_PAYLOAD_TOO_LARGE',message:'Snapshot excede o limite da ponte.'}};
      window.postMessage(response,'*');
    };
    if(req.type==='WIDE_BRIDGE_HANDSHAKE' && !activeSession)activeSession=req.sessionId;
    if(req.sessionId!==activeSession){reply(false,undefined,'SESSION_MISMATCH');return;}
    try{
      const root=document.querySelector('.ProjectApp') as any;
      const p=root?.project;
      const found=!!p&&typeof p==='object';
      const version=found?String(p.metadata?.appVersion||'unknown'):'unknown';
      if(req.type==='WIDE_BRIDGE_HANDSHAKE'){reply(true,{bridgeReady:true,hasAppElement:!!root,hasProject:found,version,sessionId:activeSession});return;}
      if(req.type==='WIDE_BRIDGE_PROBE'){reply(true,{appElementFound:!!root,projectObjectFound:found,hasPresentation:!!p?.presentation,hasSelection:!!p?.selection,version:found?version:null});return;}
      if(!found){reply(false,undefined,'PROJECT_NOT_FOUND');return;}
      if(!supportsEditor(version)){reply(false,undefined,'UNSUPPORTED_EDITOR');return;}
      if(project!==p){project=p;clipIds=new WeakMap();}
      if(req.type==='WIDE_BRIDGE_DROP_TARGET'){reply(true,drops.handle(p,req.payload));return;}
      if(req.type==='WIDE_BRIDGE_IMPORT_RECEIPT'){reply(true,receipts.handle(p,req.payload));return;}
      if(req.type==='WIDE_BRIDGE_READ_SELECTION'){reply(true,{kind:p.selection?.kind||'unknown',hasValue:!!p.selection?.value});return;}
      if(req.type==='WIDE_BRIDGE_OPEN_SMART_TOOL'){
        const toolName=(req.payload as any)?.tool;
        const selectorClass=toolName==='silenceRemover'?'.icon.silenceRemover':toolName==='captionsGenerator'?'.icon.captionsGenerator':null;
        let triggered=false;
        if(selectorClass){
          const button=document.querySelector<HTMLElement>(selectorClass);
          if(button){button.click();triggered=true;}
        }
        triggered=triggered && !!document.querySelector('dialog[open]:not(.ContextMenu)');
        reply(true,{tool:toolName,triggered});return;
      }
      if(req.type==='WIDE_BRIDGE_ACTION'){
        if(!usesOfficialApi(version))throw Error('OFFICIAL_API_UNAVAILABLE');
        const action=Action.parse(req.payload);
        if(action.action==='seek'){
          const snapshot=officialSnapshot(await officialApi.context(p),p,activeSession!);
          if(snapshot.projectId!==action.projectId||snapshot.revision!==action.revision)throw Error('PROJECT_CHANGED');
          await officialApi.run('operation-project-activity-seek',action.time,p);
        }else{
          const clip=await officialApi.run<{ID:string}>('operation-clip-add',{data:{load:{kind:'load',source:'text',text:'Type here'}}},p);
          await officialApi.run('operation-clip-select-load',{clipId:clip.ID,seek:false},p);
        }
        reply(true,officialSnapshot(await officialApi.context(p),p,activeSession!));return;
      }
      if(req.type==='WIDE_BRIDGE_READ_SNAPSHOT'){
        if(usesOfficialApi(version)){
          const snapshot=officialSnapshot(await officialApi.context(p),p,activeSession!);
          const name=root.querySelector?.('.SelectionBreadcrumbs .project')?.textContent?.trim()||p.directory?.setup?.path?.split('/').filter(Boolean).pop();
          const date=new Date(p.metadata.createdTime);
          if(name&&Number.isFinite(date.getTime()))snapshot.identity={name,createdLabel:date.toLocaleString(),storageMode:p.directory?.root?.isOPFS?'temporary':'directory'};
          reply(true,snapshot);return;
        }
        const timings=new WeakMap();
        for(const element of Array.from(document.querySelectorAll?.('.TimelineClipContainer')||[]) as any[]){
          if(element.init?.project===p && element.init?.clip)timings.set(element.init.clip,element.timing);
        }
        const snapshot=normalizeNativeProject(p,activeSession,clipIds,timings);
        const view=root.querySelector?.('.ProjectMetadataView');
        const name=view?.querySelector('[title="Folder"] .value')?.textContent?.trim() || root.querySelector?.('.SelectionBreadcrumbs .project')?.textContent?.trim();
        const created=p.metadata?.createdTime;
        const date=created instanceof Date?created:new Date(created);
        const createdLabel=view?.querySelector('[title="Created"] .value')?.textContent?.trim() || (Number.isFinite(date.getTime())?date.toLocaleString():null);
        if(name&&createdLabel)snapshot.identity={name,createdLabel,storageMode:p.directory?.root?.isOPFS===true?'temporary':p.directory?.root?.isOPFS===false?'directory':'unknown'};
        reply(true,snapshot);return;
      }
      reply(false,undefined,'UNKNOWN_REQUEST_TYPE');
    }catch(e){reply(false,undefined,'BRIDGE_READ_FAILED',String(e));}
  };
  window.addEventListener('message',listener);
  const uninstall=()=>{window.removeEventListener('message',listener);if((window as any)[KEY]===uninstall)delete(window as any)[KEY];};
  (window as any)[KEY]=uninstall;return uninstall;
}
