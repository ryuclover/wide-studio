import {z} from 'zod';

const Token=z.string().uuid();
export const MediaReceiptRequest=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('begin'),token:Token,name:z.string().min(1).max(180),bytes:z.number().int().min(100).max(200*1024*1024)}).strict(),
 z.object({mode:z.literal('status'),token:Token}).strict(),
]);
export const MediaReceiptSchema=z.object({phase:z.enum(['waiting','probing','valid','invalid']),name:z.string(),bytes:z.number().int().nonnegative(),reason:z.string().optional()}).strict();
export type MediaReceipt=z.infer<typeof MediaReceiptSchema>;
export type MediaReceiptClient={importReceipt(payload:unknown):Promise<MediaReceipt>};

// Read native media state, independent of the Library's filters and rendered rows.
export class NativeMediaReceipts {
 private records=new Map<string,{project:WeakRef<object>;previous:WeakSet<object>;name:string;bytes:number;created:number}>();
 handle(project:any,payload:unknown):MediaReceipt{
  const request=MediaReceiptRequest.parse(payload);
  const list=project.mediaList;if(!Array.isArray(list))throw new Error('Lista de mídias nativa indisponível.');
  for(const [id,record]of this.records)if(Date.now()-record.created>30*60*1000)this.records.delete(id);
  if(request.mode==='begin'){
   if(this.records.has(request.token))throw new Error('Recibo já iniciado.');
   const names=new Set(list.map((m:any)=>m.original?.file?.name||m.id?.name));
   const base=request.name.replace(/\.mp4$/i,'').slice(0,155);let name=request.name,index=2;
   while(names.has(name))name=`${base} (${index++}).mp4`;
   this.records.set(request.token,{project:new WeakRef(project),previous:new WeakSet(list),name,bytes:request.bytes,created:Date.now()});
   while(this.records.size>8)this.records.delete(this.records.keys().next().value!);
   return {phase:'waiting',name,bytes:request.bytes};
  }
  const record=this.records.get(request.token);if(!record)throw new Error('Recibo de importação expirado.');
  if(record.project.deref()!==project)throw new Error('O projeto mudou durante a importação.');
  const media=list.find((m:any)=>!record.previous.has(m)&&m.original?.file?.name===record.name&&m.original.file.size===record.bytes);
  const kind=media?.content?.kind;
  return {phase:kind==='valid'?'valid':kind==='invalid'?'invalid':media?'probing':'waiting',name:record.name,bytes:record.bytes,...(kind==='invalid'?{reason:String(media.content.reason||'O editor recusou esta mídia.').slice(0,400)}:{})};
 }
}
