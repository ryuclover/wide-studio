export const EDITOR_VERSIONS=['1.7.12','1.8.0'] as const;
export const supportsEditor=(version:unknown):boolean=>EDITOR_VERSIONS.includes(version as any);
export const usesOfficialApi=(version:unknown)=>version==='1.8.0';

/** Private event names are confined here; official operations take precedence. */
const events={move:['NY','BZ'],history:['mA','nE'],deleteClips:['Ng','bg']} as const;
export function listenLegacyEvent(doc:Document,kind:keyof typeof events,handler:EventListener){
  for(const name of events[kind])doc.addEventListener(name,handler,true);
  return()=>{for(const name of events[kind])doc.removeEventListener(name,handler,true);};
}
