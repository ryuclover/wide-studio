type Subscriber=()=>void;
/** Shared invalidation: native gestures stay native; idle polling reads references only. */
class EditorActivity{
  private listeners=new Set<Subscriber>();
  private frame:number|undefined;private pending=false;private retries:ReturnType<typeof setTimeout>[]=[];
  private previous:unknown[]=[];
  private observer:MutationObserver;private timer:ReturnType<typeof setInterval>;
  constructor(private doc:Document){
    const win=doc.defaultView!;
    this.observer=new win.MutationObserver(records=>{
      const meaningful=records.some(record=>{
        const target=record.target as Element;
        if(record.type==='attributes'){
          if(!target.matches?.('.TimelineClipContainer,.TimelineLayerRow'))return false;
          const clean=(value:string)=>value.split(/\s+/).filter(c=>c&&!c.startsWith('ws-')).sort().join(' ');
          return clean(record.oldValue||'')!==clean(target.className||'');
        }
        if(target.closest?.('.ws-link-controls,.ws-link-badge,.ws-history-panel,.ws-history-controls'))return false;
        return [...record.addedNodes,...record.removedNodes].some(node=>node instanceof win.Element&&(
          node.matches('#ProjectApp,.TimelineClipContainer,.TimelineLayerRow,.ws-region-heading')||!!node.querySelector('#ProjectApp,.TimelineClipContainer,.TimelineLayerRow,.ws-region-heading')
        ));
      });
      if(meaningful)this.schedule(true);
    });
    this.observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});
    for(const event of ['click','pointerup','keydown','visibilitychange','ws-ui-language'])doc.addEventListener(event,this.interaction,true);
    win.addEventListener('focus',this.interaction);win.addEventListener('pagehide',this.dispose);
    this.timer=setInterval(()=>{if(!doc.hidden)this.schedule(false);},1000);
  }
  subscribe(listener:Subscriber){this.listeners.add(listener);this.schedule(true);return()=>{this.listeners.delete(listener);if(!this.listeners.size)this.dispose();};}
  invalidate(){this.schedule(true);}
  private interaction=()=>{
    this.schedule(true);for(const timer of this.retries)clearTimeout(timer);
    this.retries=[150,400,800,1500].map(ms=>setTimeout(()=>this.schedule(false),ms));
  };
  private schedule(force:boolean){
    this.pending||=force;if(this.frame!==undefined)return;
    this.frame=this.doc.defaultView!.requestAnimationFrame(()=>{
      this.frame=undefined;const root=this.doc.querySelector('.ProjectApp') as any,p=root?.project,point=(root?.querySelector('.EditMenu') as any)?.data?.versionPoint;
      const values=[p,p?.metadata?.version,p?.selection,point?.current,point?.previous,point?.next,this.doc.documentElement.dataset.wsLanguage];
      const changed=values.some((v,i)=>v!==this.previous[i]);this.previous=values;
      const notify=this.pending||changed;this.pending=false;if(notify)for(const listener of this.listeners)listener();
    });
  }
  private dispose=()=>{
    this.observer.disconnect();clearInterval(this.timer);for(const timer of this.retries)clearTimeout(timer);
    if(this.frame!==undefined)this.doc.defaultView!.cancelAnimationFrame(this.frame);
    for(const event of ['click','pointerup','keydown','visibilitychange','ws-ui-language'])this.doc.removeEventListener(event,this.interaction,true);
    this.doc.defaultView!.removeEventListener('focus',this.interaction);this.doc.defaultView!.removeEventListener('pagehide',this.dispose);
    this.listeners.clear();instances.delete(this.doc);
  };
}
const instances=new WeakMap<Document,EditorActivity>();
export function observeEditor(listener:Subscriber,doc:Document=document){let activity=instances.get(doc);if(!activity){activity=new EditorActivity(doc);instances.set(doc,activity);}return activity.subscribe(listener);}
export function invalidateEditor(doc:Document=document){instances.get(doc)?.invalidate();}
