import {SerialQueue} from '../../core/serialQueue';
export interface OfficialClip{ID:string;name?:string;disabled?:boolean;locked?:boolean;load:any;filter?:any[];timing:{start:number;duration:number;end:number}}
export interface OfficialLayer{ID:string;name?:string;locked?:boolean;disabled?:boolean;clip:OfficialClip[]}
export interface OfficialProject{metadata:{appVersion:string;createdTime:number;version:number};activity:{currentTime:number;playbackRate:number};media:any[];presentation:{scene:any;layer:OfficialLayer[]};output:any}
type Api={run:<T=unknown>(operation:string,input?:unknown)=>Promise<T>;resolveBlob?:(id:string)=>Blob};
const reads=new Set(['operation-project-get','operation-project-activity-get','operation-scene-get','operation-media-get-list']);
/** One queue per page: the host rejects overlapping operations, including reads. */
export class OfficialApiClient{
  private queue=new SerialQueue();
  private cache:{owner:object;version:number;value:OfficialProject}|undefined;
  private pending:{owner:object;version:number;value:Promise<OfficialProject>}|undefined;
  constructor(private api:()=>Api|undefined,private current:()=>any){}
  run<T>(name:string,input?:unknown,owner=this.current()):Promise<T>{
    return this.queue.run(async()=>{
      if(!owner||this.current()!==owner)throw Error('PROJECT_CHANGED');
      const api=this.api();if(!api)throw Error('OFFICIAL_API_UNAVAILABLE');
      try{return await api.run<T>(name,input);}
      finally{if(!reads.has(name))this.cache=undefined;}
    });
  }
  async project(owner=this.current()):Promise<OfficialProject>{
    const version=owner?.metadata?.version;
    const cache=this.cache,pending=this.pending;
    if(cache&&cache.owner===owner&&cache.version===version)return cache.value;
    if(pending&&pending.owner===owner&&pending.version===version)return pending.value;
    const value=this.run<OfficialProject>('operation-project-get',undefined,owner).then(value=>{
      if(this.current()!==owner||owner.metadata.version!==value.metadata.version)throw Error('PROJECT_CHANGED');
      this.cache={owner,version:value.metadata.version,value};return value;
    }).finally(()=>{if(this.pending?.value===value)this.pending=undefined;});
    this.pending={owner,version,value};return value;
  }
  async context(owner=this.current()){
    // A native save may complete between these two reads. Refresh that read
    // once, only within the same project; mutations are never replayed.
    for(let attempt=0;attempt<2;attempt++){
      try{
        const project=await this.project(owner);
        const activity=await this.run<OfficialProject['activity']>('operation-project-activity-get',undefined,owner);
        if(this.current()!==owner||owner.metadata.version!==project.metadata.version)throw Error('PROJECT_CHANGED');
        return {...project,activity};
      }catch(error){
        if(attempt||this.current()!==owner||!(error instanceof Error)||error.message!=='PROJECT_CHANGED')throw error;
        this.cache=undefined;
      }
    }
    throw Error('PROJECT_CHANGED');
  }
}
export const officialApi=new OfficialApiClient(()=>typeof window==='undefined'?undefined:(window as any).api,()=>typeof document==='undefined'?undefined:(document.querySelector('.ProjectApp') as any)?.project);
