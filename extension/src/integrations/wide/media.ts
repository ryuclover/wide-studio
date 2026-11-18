/** Compatibility boundary for the native probing model changed in 1.8. */
export function nativeMediaPhase(media:any):'waiting'|'probing'|'valid'|'invalid'{
  if(!media)return 'waiting';
  if(media.content?.kind==='valid'||media.kind==='valid')return 'valid';
  if(media.content?.kind==='invalid'||media.kind==='invalid')return 'invalid';
  return 'probing';
}
export const nativeMediaError=(media:any)=>String(media?.content?.reason||media?.reason||'O editor recusou esta mídia.').slice(0,400);
