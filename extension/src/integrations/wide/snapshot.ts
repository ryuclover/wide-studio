import type {ProjectSnapshot} from '../../types/snapshot';
import {parseRationalFps} from '../../bridge/snapshotNormalizer';
import type {OfficialProject} from './officialApi';
let sequence=0;const projects=new WeakMap<object,string>();
/** Official data owns timing/IDs; the narrow native fallback supplies selection. */
export function officialSnapshot(model:OfficialProject,native:any,sessionId:string):ProjectSnapshot{
  let projectId=projects.get(native);if(!projectId){projectId=`api-project-${++sequence}-${model.metadata.createdTime}`;projects.set(native,projectId);}
  const scene=model.presentation.scene,fps=parseRationalFps(scene.frameRate),frame=(t:number)=>fps&&Number.isFinite(t)?Math.round(t*fps.numerator/fps.denominator):null;
  const selected=native.selection?.kind==='clips'?native.selection.value:new Set([native.selection?.value]);
  const tracks=model.presentation.layer.map((l,i)=>({id:l.ID,index:i,kind:'unknown' as const,name:l.name||`Track ${i+1}`,muted:null,locked:l.locked??null,visible:l.disabled===undefined?null:!l.disabled}));
  const selectedClipIds:string[]=[];
  const clips=model.presentation.layer.flatMap((layer,i)=>layer.clip.map((clip,j)=>{
    if(selected.has(native.presentation.layer[i]?.clip[j]))selectedClipIds.push(clip.ID);
    const streams=clip.load.media?.stream||[];
    const kinds=streams.map((s:any)=>s.kind),source=clip.load.source;
    const kind=source==='text'?'text':kinds.includes('video')?'video':kinds.some((kind:string)=>['image','svg','lottie'].includes(kind))||source==='shape'||source==='emoji'?'image':kinds.includes('audio')?'audio':'unknown';
    return {id:clip.ID,trackId:layer.ID,kind:kind as 'text'|'video'|'audio'|'image'|'unknown',name:clip.name||clip.load.text||clip.load.media?.file?.path?.split('/').pop()||`Clip ${j+1}`,startFrame:frame(clip.timing.start),durationFrames:frame(clip.timing.duration),sourceTrimStartFrames:frame(clip.load.trim?.start??0)??undefined,text:source==='text'?clip.load.text:undefined};
  }));
  const selection={kind:selectedClipIds.length>1?'multiple':selectedClipIds.length?'clip':native.selection?.kind==='layer'?'track':'none',clipIds:selectedClipIds,trackIds:tracks.filter((_,i)=>native.selection?.value===native.presentation.layer[i]).map(t=>t.id),playheadFrame:frame(model.activity.currentTime)} as ProjectSnapshot['selection'];
  return {schemaVersion:1,sessionId,projectId,editorVersion:model.metadata.appVersion,revision:JSON.stringify([model.metadata.version,model.activity.currentTime,selection]),composition:{width:scene.canvas.width,height:scene.canvas.height,fps,durationFrames:frame(scene.duration),playheadFrame:frame(model.activity.currentTime)},tracks,clips,selection,capabilities:[{id:'transport.seek',available:!!fps,confidence:'documented'},{id:'clip.read',available:true,confidence:'documented'}],collectedAt:Date.now()};
}
