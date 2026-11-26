type BeforeHistory=(project:any)=>Promise<unknown>;
const listeners=new Set<BeforeHistory>();
export function beforeHistory(listener:BeforeHistory){listeners.add(listener);return()=>{listeners.delete(listener);};}
/** Finish pending input saves before choosing which native snapshot to restore. */
export async function settlePendingEdits(project:any){await Promise.all([...listeners].map(listener=>listener(project)));}
