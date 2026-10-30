import {MediaReceiptSchema, type MediaReceipt} from './mediaReceipt';
import {DropResponseSchema} from './nativeDrop';
import { BridgeMessageType, BridgeRequest, BridgeResponseSchema, ProjectSnapshot, ProjectSnapshotSchema } from '../types/snapshot';
import { HandshakeSchema, ProbeSchema, SelectionSchema, SmartToolResponseSchema, withinMessageLimit } from './protocol';
interface PendingRequest {type:BridgeMessageType;resolve:(value:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}
export class ContentBridgeClient {
  private pending=new Map<string,PendingRequest>();
  private listening=false;
  private ready=false;
  private connecting:Promise<any>|null=null;
  constructor(private sessionId=`cs-runtime-${crypto.randomUUID()}`){}
  private listener=(event:MessageEvent)=>{
    if(event.source!==window || !withinMessageLimit(event.data))return;
    const parsed=BridgeResponseSchema.safeParse(event.data);if(!parsed.success)return;
    const res=parsed.data;if(res.sessionId!==this.sessionId)return;
    const pending=this.pending.get(res.requestId);if(!pending)return;
    const finish=(error?:Error,data?:unknown)=>{clearTimeout(pending.timer);this.pending.delete(res.requestId);if(error)pending.reject(error);else pending.resolve(data);};
    const expected=pending.type==='WIDE_BRIDGE_HANDSHAKE'?'WIDE_BRIDGE_HANDSHAKE_ACK':'WIDE_BRIDGE_RESPONSE';
    if(!res.success){
      if(res.type!=='WIDE_BRIDGE_ERROR'||!res.error)return finish(new Error('INVALID_BRIDGE_RESPONSE'));
      this.ready=false;return finish(Object.assign(new Error(res.error.message),{code:res.error.code}));
    }
    if(res.type!==expected || res.error)return finish(new Error('INVALID_BRIDGE_RESPONSE_TYPE'));
    const schema=pending.type==='WIDE_BRIDGE_IMPORT_RECEIPT'?MediaReceiptSchema:pending.type==='WIDE_BRIDGE_DROP_TARGET'?DropResponseSchema:pending.type==='WIDE_BRIDGE_HANDSHAKE'?HandshakeSchema:pending.type==='WIDE_BRIDGE_PROBE'?ProbeSchema:pending.type==='WIDE_BRIDGE_READ_SELECTION'?SelectionSchema:pending.type==='WIDE_BRIDGE_OPEN_SMART_TOOL'?SmartToolResponseSchema:ProjectSnapshotSchema;
    const payload=schema.safeParse(res.data);if(!payload.success)return finish(new Error('INVALID_BRIDGE_PAYLOAD'));
    if(pending.type==='WIDE_BRIDGE_HANDSHAKE'){
      if((payload.data as any).sessionId!==this.sessionId)return finish(new Error('INVALID_BRIDGE_SESSION'));
      this.ready=true;
    }
    if(pending.type==='WIDE_BRIDGE_READ_SNAPSHOT' && (payload.data as ProjectSnapshot).sessionId!==this.sessionId)return finish(new Error('INVALID_BRIDGE_SESSION'));
    finish(undefined,payload.data);
  };
  init(){if(!this.listening){window.addEventListener('message',this.listener);this.listening=true;}}
  sendRequest<T=unknown>(type:BridgeMessageType,payload?:unknown,timeoutMs=1500):Promise<T>{
    this.init();
    const requestId=crypto.randomUUID();
    const req:BridgeRequest={source:'wide-studio-content',target:'wide-studio-main',sessionId:this.sessionId,requestId,type,payload};
    if(!withinMessageLimit(req))return Promise.reject(new Error('BRIDGE_PAYLOAD_TOO_LARGE'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(requestId);this.ready=false;reject(Object.assign(new Error('BRIDGE_TIMEOUT'),{code:'BRIDGE_TIMEOUT'}));},timeoutMs);
      this.pending.set(requestId,{type,resolve,reject,timer});
      try{window.postMessage(req,'*');}catch(e){clearTimeout(timer);this.pending.delete(requestId);reject(e);}
    });
  }
  handshake():Promise<{bridgeReady:boolean;hasAppElement:boolean;hasProject:boolean;version:string;sessionId:string}>{
    if(!this.connecting)this.connecting=this.sendRequest<any>('WIDE_BRIDGE_HANDSHAKE').finally(()=>{this.connecting=null;});
    return this.connecting;
  }
  private async ensureReady(){if(!this.ready)await this.handshake();}
  async probe(){await this.ensureReady();return this.sendRequest<{appElementFound:boolean;projectObjectFound:boolean;hasPresentation:boolean;hasSelection:boolean;version:string|null}>('WIDE_BRIDGE_PROBE');}
  async readSnapshot(){await this.ensureReady();return this.sendRequest<ProjectSnapshot>('WIDE_BRIDGE_READ_SNAPSHOT');}
  async readSelection(){await this.ensureReady();return this.sendRequest<{kind:string;hasValue:boolean}>('WIDE_BRIDGE_READ_SELECTION');}
  async openSmartTool(tool:'silenceRemover'|'captionsGenerator'){await this.ensureReady();return this.sendRequest<{tool:string;triggered:boolean}>('WIDE_BRIDGE_OPEN_SMART_TOOL',{tool});}
  async importReceipt(payload:unknown):Promise<MediaReceipt>{await this.ensureReady();return this.sendRequest('WIDE_BRIDGE_IMPORT_RECEIPT',payload);}
  async dropTarget(payload:unknown):Promise<any>{await this.ensureReady();return this.sendRequest('WIDE_BRIDGE_DROP_TARGET',payload);}
  isReady(){return this.ready;}
  getSessionId(){return this.sessionId;}
  destroy(){window.removeEventListener('message',this.listener);this.listening=false;this.ready=false;this.connecting=null;for(const req of this.pending.values()){clearTimeout(req.timer);req.reject(new Error('BRIDGE_DESTROYED'));}this.pending.clear();}
}
