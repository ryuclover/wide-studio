type NativeState={version:number;reasons?:string[];file:File};
type Move={project:any;Command:any;signature:string;changes:{clip:any;from:number;to:number}[]};
type State={snapshot:NativeState;move?:Move};
type Live={r:HTMLElement;p:any;m:any};
export class SmoothHistory{
 states:State[]=[];cursor=-1;applying=false;private native:any;private tx:any;private MoveCommand:any;private RestoreCommand:any;private pending:NativeState|undefined;private pendingProject:any;
 private ids=new WeakMap<object,number>();private id=0;
 constructor(private live:()=>Live|undefined,private request:(direction:number)=>void){window.addEventListener('blur',this.onCancel);document.addEventListener('pointerdown',this.onDown,true);document.addEventListener('pointerup',this.onUp,true);document.addEventListener('pointercancel',this.onCancel,true);document.addEventListener('NY',this.onMove,true);document.addEventListener('mA',this.onRestore,true);}
 reset(){this.states=[];this.cursor=-1;this.native=undefined;this.tx=undefined;}
 dispose(){window.removeEventListener('blur',this.onCancel);document.removeEventListener('pointerdown',this.onDown,true);document.removeEventListener('pointerup',this.onUp,true);document.removeEventListener('pointercancel',this.onCancel,true);document.removeEventListener('NY',this.onMove,true);document.removeEventListener('mA',this.onRestore,true);}
 private signature(p:any):string|null{try{if(p.presentation.layer.reduce((n:number,l:any)=>n+l.clip.length,0)>2000)return null;
  const layer=p.presentation.layer.map((l:any)=>({...l,clip:l.clip.map((c:any)=>{
   const delay=(c.filter||[]).filter((f:any)=>f.kind==='delay');if(delay.length>1||delay.some((f:any)=>Object.keys(f).some(k=>f[k]!==undefined&&!['kind','time'].includes(k))))throw new Error('complex timing');
   return {...c,filter:(c.filter||[]).filter((f:any)=>f.kind!=='delay')};
  })}));
  return JSON.stringify({scene:p.presentation.scene,layer},(key,value)=>{if(key==='cache')return undefined;if(key==='media'&&value&&typeof value==='object'){if(!this.ids.has(value))this.ids.set(value,++this.id);return {mediaReference:this.ids.get(value)};}return value;});
 }catch{return null;}}
 private nodes(){const live=this.live();return live?[...live.r.querySelectorAll('.TimelineClipContainer')] as any[]:[];}
 private onDown=(event:PointerEvent)=>{const live=this.live(),target=event.target instanceof Element?event.target:null;if(this.applying||event.button!==0||event.isPrimary===false||!live||!target?.closest('.TimelineClipContainer')||target.closest('button,input,select'))return;
  this.observe(live.p,live.m.data?.versionPoint);const nodes=this.nodes();this.tx={project:live.p,source:this.native,signature:this.signature(live.p),changes:new Map(),starts:new Map(nodes.map(n=>[n.init.clip,n.timing.presentation.start])),nodeMap:new Map(nodes.map(n=>[n.init.clip,n])),dragging:true};
 };
 private onUp=()=>{if(this.tx)this.tx.dragging=false;};
 private onCancel=()=>{this.tx=undefined;};
 private onMove=(event:Event)=>{const detail=(event as CustomEvent).detail,live=this.live();if(!live||detail?.data?.project!==live.p||!detail.data.clip||!Number.isFinite(detail.data.presentationTime))return;
  this.MoveCommand=detail.constructor;if(this.applying)return;
  if(this.tx?.project===live.p&&this.tx.changes.has(detail.data.clip))return;
  const node=this.tx?.nodeMap?.get(detail.data.clip)||this.nodes().find(n=>n.init?.clip===detail.data.clip);if(!node){if(this.tx)this.tx.untracked=true;return;}
  if(!this.tx||this.tx.project!==live.p||this.tx.source!==this.native)this.tx={project:live.p,source:this.native,signature:this.signature(live.p),changes:new Map()};
  if(!this.tx.changes.has(detail.data.clip))this.tx.changes.set(detail.data.clip,{clip:detail.data.clip,from:this.tx.starts?.get(detail.data.clip)??node.timing.presentation.start});
 };
 private onRestore=(event:Event)=>{const detail=(event as CustomEvent).detail,live=this.live();if(!live||detail?.data?.project!==live.p)return;
  this.RestoreCommand=detail.constructor;
  if(this.pending&&detail.data.project===this.pendingProject){detail.data.version=this.pending;this.pending=undefined;this.pendingProject=undefined;return;}if(this.applying){event.stopImmediatePropagation();return;}if(![-1,1].includes(detail.data.delta))return;
  if(!this.applying&&this.states.length){event.stopImmediatePropagation();this.request(detail.data.delta===1?1:-1);}
 };
 observe(project:any,point:any){const current=point?.current;if(!current||this.applying||current===this.native||this.tx?.dragging)return;
  if(!this.states.length){for(const s of [point.previous,current,point.next])if(s)this.states.push({snapshot:s});this.cursor=this.states.findIndex(s=>s.snapshot===current);this.native=current;this.tx=undefined;return;}
  const known=this.states.findIndex(s=>s.snapshot===current);if(known>=0){this.cursor=known;this.native=current;this.tx=undefined;return;}
  this.states.splice(this.cursor+1);
  if(point.previous&&point.previous!==this.native&&point.previous.version>this.states.at(-1)!.snapshot.version)this.states.push({snapshot:point.previous});
  let move:Move|undefined;const tx=this.tx;
  if(tx?.project===project&&!tx.untracked&&tx.source===this.native&&tx.signature&&tx.signature===this.signature(project)&&current.reasons?.every((r:string)=>/^(Update|Add) filter Start Time$/.test(r))){
   const nodes=this.nodes(),changes=[...tx.changes.values()].map((c:any)=>({...c,to:nodes.find(n=>n.init?.clip===c.clip)?.timing.presentation.start}));
   if(changes.length&&changes.every(c=>Number.isFinite(c.from)&&Number.isFinite(c.to))&&changes.some(c=>Math.abs(c.to-c.from)>.0001))move={project,Command:this.MoveCommand,signature:tx.signature,changes};
  }
  this.states.push({snapshot:current,move});while(this.states.length>20)this.states.shift();this.cursor=this.states.length-1;this.native=current;this.tx=undefined;
 }
 can(direction:number){return !this.applying&&(direction<0?this.cursor>0:this.cursor>=0&&this.cursor<this.states.length-1);}
 label(direction:number){return (direction<0?this.states[this.cursor]:this.states[this.cursor+1])?.snapshot.reasons?.join(' · ')||'';}
 private fastRecord(direction:number,live:Live){const move=(direction<0?this.states[this.cursor]:this.states[this.cursor+1])?.move;if(!move||move.project!==live.p||move.signature!==this.signature(live.p))return;
  const nodes=this.nodes();if(move.changes.every(c=>{const node=nodes.find(n=>n.init?.clip===c.clip);return node&&node.init.project===live.p&&!node.init.clip.locked&&!live.p.presentation.layer.find((l:any)=>l.clip.includes(c.clip))?.locked&&Math.abs(node.timing.presentation.start-(direction<0?c.to:c.from))<.0001;}))return move;
 }
 async apply(direction:number){const live=this.live();if(!live||!this.can(direction))throw new Error('Não há ação disponível.');
  const next=this.cursor+direction,target=this.states[next],move=this.fastRecord(direction,live);this.applying=true;this.tx=undefined;
  try{
   if(move){const nodes=this.nodes();for(const change of move.changes){const node=nodes.find(n=>n.init.clip===change.clip);node.trigger(new move.Command({project:live.p,clip:change.clip,presentationTime:direction<0?change.from:change.to,flush:'none'}));}
    nodes.find(n=>n.init.clip===move.changes[0].clip).onDragHandlerDraggableDrop();
   }else{
    this.pending=target.snapshot;this.pendingProject=live.p;
    if(this.RestoreCommand)live.m.trigger(new this.RestoreCommand({project:live.p,version:target.snapshot,delta:direction}));
    else{const item=live.m.createContextMenuItems().slice(0,2).find((i:any)=>typeof i.callback==='function');if(!item)throw new Error('Restauração nativa indisponível.');item.callback();}
   }
   const deadline=Date.now()+12000;let confirmed=false;
   while(Date.now()<deadline){await new Promise(r=>setTimeout(r,50));const now=this.live();if(!now)continue;if(now.p.metadata.createdTime?.getTime?.()!==live.p.metadata.createdTime?.getTime?.()||now.p.directory?.setup?.path!==live.p.directory?.setup?.path)throw new Error('O projeto mudou durante a restauração.');
    if(move){if(now.p!==live.p)throw new Error('O projeto mudou durante o movimento.');const nodes=this.nodes();confirmed=move.changes.every(c=>Math.abs((nodes.find(n=>n.init.clip===c.clip)?.timing.presentation.start??NaN)-(direction<0?c.from:c.to))<.0001)&&!!now.m.data?.versionPoint?.current&&now.m.data.versionPoint.current.version===now.p.metadata.version&&now.m.data.versionPoint.current!==this.native;}
    else confirmed=now.p!==live.p&&now.p.metadata.version===target.snapshot.version;
    if(confirmed){this.cursor=next;this.native=now.m.data?.versionPoint?.current;return {mode:move?'direct':'snapshot'};}
   }throw new Error('Restauração não confirmada. Confira o editor antes de repetir.');
  }finally{this.pending=undefined;this.pendingProject=undefined;this.applying=false;}
 }
}
