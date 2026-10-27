import {z} from 'zod';
export const DropRequestSchema=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('capture'),x:z.number().finite().nonnegative(),y:z.number().finite().nonnegative()}).strict(),
 z.object({mode:z.literal('resolve'),token:z.string().uuid()}).strict(),
 z.object({mode:z.literal('verify'),token:z.string().uuid(),name:z.string().min(1).max(180)}).strict()
]);
export const DropResponseSchema=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('capture'),token:z.string().uuid(),time:z.number().finite().nonnegative(),layer:z.string()}).strict(),
 z.object({mode:z.literal('resolve'),x:z.number().finite(),y:z.number().finite(),rowIndex:z.number().int().nonnegative()}).strict(),
 z.object({mode:z.literal('verify'),verified:z.boolean(),time:z.number().finite().nullable(),layer:z.string()}).strict()
]);
type DropState={project:any;layer:any;virtual:boolean;time:number;before:Set<any>;expires:number};
// Read native identities/conversions only. Clip insertion uses native DOM drag handlers.
export class NativeDropReader{
 private targets=new Map<string,DropState>();
 handle(project:any,input:unknown){
  const q=DropRequestSchema.parse(input);for(const [id,t]of this.targets)if(t.expires<Date.now())this.targets.delete(id);
  const rows=()=>[...document.querySelectorAll('.TimelineLayerRow')] as any[];
  const clips=()=>project.presentation.layer.flatMap((l:any)=>l.clip) as any[];
  if(q.mode==='capture'){
   const row=rows().find(r=>{const rect=r.clipsContainer?.getBoundingClientRect();return rect&&q.x>=rect.left&&q.x<=rect.right&&q.y>=rect.top&&q.y<=rect.bottom;});
   const container=row?.clipsContainer,rect=container?.getBoundingClientRect();
   if(!rect||row.init?.project!==project||q.x<rect.left||q.x>rect.right||q.y<rect.top||q.y>rect.bottom)throw new Error('Solte na área de clipes de uma camada.');
   if(row.init.layer.locked)throw new Error('A camada está bloqueada.');
   const time=row.init.conversion.pageXToPresentationTime(q.x+window.scrollX);if(!Number.isFinite(time)||time<0)throw new Error('Posição inválida.');
   const token=crypto.randomUUID();if(this.targets.size>=20)this.targets.delete(this.targets.keys().next().value!);
   this.targets.set(token,{project,layer:row.init.layer,virtual:!!row.init.virtual,time,before:new Set(clips()),expires:Date.now()+120000});
   return {mode:'capture',token,time,layer:row.init.virtual?'Nova camada':String(row.init.layer.name||row.label?.textContent||'Camada')};
  }
  const t=this.targets.get(q.token);if(!t||t.project!==project)throw new Error('O projeto ou destino mudou. Arraste novamente.');
  if(q.mode==='verify'){
   const fresh=clips().filter(c=>!t.before.has(c)&&c.load?.source==='media'&&c.load.media?.id?.name===q.name);
   const owner=project.presentation.layer.find((l:any)=>fresh.some(c=>l.clip.includes(c)));
   const node=[...document.querySelectorAll('.TimelineClipContainer')].find((e:any)=>e.init?.clip===fresh[0]) as any;
   const time=node?.timing?.presentation?.start;
   const verified=fresh.length===1&&!!owner&&(t.virtual||owner===t.layer)&&Number.isFinite(time)&&Math.abs(time-t.time)<.0001;
   if(verified)this.targets.delete(q.token);
   return {mode:'verify',verified,time:Number.isFinite(time)?time:null,layer:String(owner?.name||'Camada')};
  }
  const row=rows().find(r=>r.init?.project===project&&r.init.layer===t.layer);
  if(!row||row.init.layer.locked)throw new Error('A camada foi removida ou bloqueada. A mídia continua na Biblioteca.');
  const rect=row.clipsContainer.getBoundingClientRect(),rawX=row.init.conversion.presentationTimeToPageX(t.time)-window.scrollX;
  const x=[Math.round(rawX),Math.floor(rawX),Math.ceil(rawX)].find(pixel=>Math.abs(row.init.conversion.pageXToPresentationTime(pixel+window.scrollX)-t.time)<.0001)??NaN,y=rect.top+Math.min(rect.height/2,16);
  if(!Number.isFinite(x))throw new Error('O zoom mudou e o frame exato não está acessível. A mídia está na Biblioteca; arraste novamente.');
  if(!Number.isFinite(x)||rect.height<=0||x<Math.max(rect.left,0)||x>Math.min(rect.right,window.innerWidth)||y<0||y>window.innerHeight)throw new Error('O destino saiu da área visível. A mídia continua na Biblioteca; arraste novamente.');
  if(Math.abs(row.init.conversion.pageXToPresentationTime(x+window.scrollX)-t.time)>.0001)throw new Error('O zoom mudou e o frame exato não está acessível. A mídia está na Biblioteca; arraste novamente.');
  if([...document.querySelectorAll('dialog[open]:not(.ContextMenu)')].some(d=>d.matches(':modal')))throw new Error('Feche o diálogo do editor antes de inserir. A mídia está na Biblioteca.');
  return {mode:'resolve',x,y,rowIndex:rows().indexOf(row)};
 }
}





