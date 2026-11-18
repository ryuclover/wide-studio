import {supportsEditor,listenLegacyEvent} from '../compatibility';
// Native DeleteClips action in wide.video 1.7.12. Only suppress the clip
// confirmation; file, media, directory, project, and other dialogs are untouched.
export function installDirectClipDelete(doc:Document=document){
 const listener=(event:Event)=>{
  if(!doc.documentElement.hasAttribute('data-wide-studio-workspace'))return;
  const root=doc.querySelector('.ProjectApp') as any,project=root?.project;
  const action=(event as CustomEvent).detail,data=action?.data;
  if(!supportsEditor(project?.metadata?.appVersion)||action?.name!=='DeleteClips'||data?.project!==project||!(data.clips instanceof Set)||!data.clips.size)return;
  const edit=root.querySelector('.MenuBar .EditMenu');if(edit?.project!==project||!edit.data?.versionPoint)return;
  const clips=new Set(project.presentation?.layer?.flatMap((layer:any)=>layer.clip)||[]);
  if([...data.clips].some(clip=>!clips.has(clip)))return;
  data.confirm=false;
 };
 const stopDelete=listenLegacyEvent(doc,'deleteClips',listener);
 const uninstall=()=>{stopDelete();doc.defaultView?.removeEventListener('pagehide',uninstall);};
 doc.defaultView?.addEventListener('pagehide',uninstall);return uninstall;
}
