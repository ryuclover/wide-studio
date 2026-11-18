import {invalidateEditor} from './editorActivity';
type Listener=(project:any,busy:boolean)=>void;
const listeners=new Set<Listener>();
export const subscribeHistoryBatch=(listener:Listener)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export async function withHistoryBatch<T>(project:any,run:()=>Promise<T>):Promise<T>{
 for(const listener of listeners)listener(project,true);
 if(typeof document!=='undefined')invalidateEditor();
 try{return await run();}finally{
  for(const listener of listeners)listener(project,false);
  // Finishing a batch need not change the native version or DOM. Explicitly
  // repaint history so its controls cannot remain in the disabled busy state.
  if(typeof document!=='undefined')invalidateEditor();
 }
}
