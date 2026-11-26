type Favorite={provider:'local'|'google'|'file';value:string;project?:string};
const STORAGE='wide-studio.font-favorites.v1';
const KEY='__WIDE_STUDIO_FONT_FAVORITES_STOP__';
export function parseFavorites(raw:string|null):Favorite[]{
 try{const value=JSON.parse(raw||'[]');if(!Array.isArray(value))return [];
  const seen=new Set<string>();return value.slice(0,1000).filter((item:any)=>{
   if(!item||!['local','google','file'].includes(item.provider)||typeof item.value!=='string'||!item.value.length||item.value.length>2048||item.provider==='file'&&(typeof item.project!=='string'||item.project.length>2048))return false;
   const key=JSON.stringify([item.provider,item.value,item.provider==='file'?item.project:null]);if(seen.has(key))return false;seen.add(key);return true;
  }).map(({provider,value,project})=>provider==='file'?{provider,value,project}:{provider,value});
 }catch{return [];}
}
const same=(a:Favorite,b:Favorite)=>a.provider===b.provider&&a.value===b.value&&(a.provider!=='file'||a.project===b.project);
const words={
 'pt-BR':['Favoritos','Favoritar fonte','Remover dos favoritos','Nenhuma fonte favorita. Marque a estrela de uma fonte nas outras abas.','Fontes do projeto aparecem nos favoritos deste projeto.','Não foi possível salvar os favoritos neste navegador.'],
 en:['Favorites','Favorite font','Remove from favorites','No favorite fonts yet. Star a font in another tab.','Project fonts appear in favorites for this project.','Could not save favorites in this browser.'],
 es:['Favoritos','Marcar fuente favorita','Quitar de favoritos','No hay fuentes favoritas. Marca una estrella en otra pestaña.','Las fuentes del proyecto aparecen en los favoritos de este proyecto.','No se pudieron guardar los favoritos.'],
 fr:['Favoris','Ajouter aux favoris','Retirer des favoris','Aucune police favorite. Cliquez sur une étoile dans un autre onglet.','Les polices du projet restent dans les favoris de ce projet.','Impossible de sauvegarder les favoris.'],
 de:['Favoriten','Schrift favorisieren','Aus Favoriten entfernen','Noch keine Favoriten. Markieren Sie eine Schrift mit einem Stern.','Projektschriften erscheinen in den Favoriten dieses Projekts.','Favoriten konnten nicht gespeichert werden.']
};
export function installFontFavorites(doc:Document=document){
 const win=doc.defaultView!;(win as any)[KEY]?.();
 let favorites:Favorite[]=[];try{favorites=parseFavorites(win.localStorage.getItem(STORAGE));}catch{}
 const patches=new Map<any,{render:any;scheduled:any;wrapper:any;observer:MutationObserver;button:HTMLButtonElement;note:HTMLElement;decorate:()=>void}>();
 const text=(index:number)=>((words as any)[doc.documentElement.dataset.wsLanguage||'en']||words.en)[index];
 const projectKey=(selector:any)=>JSON.stringify([selector.init.project.directory?.setup?.path||selector.init.project.directory?.root?.name||'',selector.init.project.metadata?.createdTime?.getTime?.()??selector.init.project.metadata?.createdTime??'']);
 const record=(selector:any,renderer:any):Favorite|undefined=>{
  if(!['local','google','file'].includes(renderer.provider)||typeof renderer.value!=='string')return;
  return {provider:renderer.provider,value:renderer.value,...(renderer.provider==='file'?{project:projectKey(selector)}:{})};
 };
 const attach=(selector:any)=>{
  if(patches.has(selector)||selector.init?.project?.metadata?.appVersion!=='1.8.0'||typeof selector.addRenderer!=='function'||typeof selector.render!=='function')return;
  const google=selector.querySelector('.bar button.google'),bar=google?.parentElement;
  if(!bar||!selector.listElement)return;
  const button=doc.createElement('button');button.type='button';button.className='ws-font-favorites-tab';button.dataset.wsNoTranslate='';google.after(button);
  const note=doc.createElement('p');note.className='ws-font-favorites-note';note.dataset.wsNoTranslate='';note.setAttribute('role','status');selector.append(note);
  const decorate=()=>{
   button.textContent=text(0);const active=selector.data.kind==='ws-favorites';button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
   selector.classList.toggle('ws-font-favorites-active',active);
   for(const renderer of selector.querySelectorAll('.FontRenderer')){
    const favorite=record(selector,renderer);if(!favorite)continue;
    let star=renderer.querySelector('.ws-font-star') as HTMLButtonElement|null;
    if(!star){
     star=doc.createElement('button');star.type='button';star.className='ws-font-star';star.dataset.wsNoTranslate='';
     star.addEventListener('pointerdown',event=>event.stopPropagation());star.addEventListener('keydown',event=>event.stopPropagation());
     star.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      const entry=record(selector,renderer);if(!entry)return;
      const next=favorites.some(item=>same(item,entry))?favorites.filter(item=>!same(item,entry)):[...favorites,entry];
      try{if(next.length>1000)throw Error('limit');win.localStorage.setItem(STORAGE,JSON.stringify(next));favorites=next;}
      catch{note.textContent=text(5);return;}
      for(const [other,patch]of patches)if(other.data.kind==='ws-favorites')other.scheduleRender();else patch.decorate();
     });renderer.append(star);
    }
    const selected=favorites.some(item=>same(item,favorite)),label=text(selected?2:1);
    if(star.textContent!==(selected?'★':'☆'))star.textContent=selected?'★':'☆';
    star.classList.toggle('is-favorite',selected);star.setAttribute('aria-pressed',String(selected));star.setAttribute('aria-label',`${label}: ${renderer.label||favorite.value}`);star.title=label;
   }
  };
  const original=selector.render,scheduled=selector._render;
  const wrapper=function(this:any,...args:any[]){
   const result=original.apply(this,args);
   if(this.data.kind==='ws-favorites'){
    const available=favorites.filter(item=>item.provider!=='file'||item.project===projectKey(this));
    for(const item of available)this.addRenderer(item.provider,item.value,this.getFilter());
    if(this.hintElement)this.hintElement.textContent='';
    note.textContent=text(available.length?4:3);
   }else note.textContent='';
   decorate();return result;
  };
  // Observe only this dialog. Native Google/project lists can arrive asynchronously.
  const observer=new win.MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n instanceof win.Element&&(n.matches('.FontRenderer')||n.querySelector('.FontRenderer')))))decorate();});
  observer.observe(selector,{childList:true,subtree:true});
  selector.unscheduleRender();patches.set(selector,{render:original,scheduled,wrapper,observer,button,note,decorate});selector.render=wrapper;selector._render=wrapper.bind(selector);
  button.onclick=()=>selector.scheduleUpdate({kind:'ws-favorites'});decorate();
 };
 const scan=()=>{
  for(const [selector,patch]of patches)if(!selector.isConnected){patch.observer.disconnect();if(selector.render===patch.wrapper){selector.unscheduleRender();selector.render=patch.render;selector._render=patch.scheduled;}patch.button.remove();patch.note.remove();patches.delete(selector);}
  for(const selector of doc.querySelectorAll('.FontSelector'))attach(selector);
 };
 const observer=new win.MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n instanceof win.Element&&(n.matches('.FontSelector,dialog')||n.querySelector('.FontSelector')))))scan();});
 observer.observe(doc.body,{childList:true,subtree:true});scan();
 const storage=(event:StorageEvent)=>{if(event.key!==STORAGE)return;favorites=parseFavorites(event.newValue);for(const [selector,patch]of patches)if(selector.data.kind==='ws-favorites')selector.scheduleRender();else patch.decorate();};
 const language=()=>{for(const [selector,patch]of patches)if(selector.data.kind==='ws-favorites')selector.scheduleRender();else patch.decorate();};
 win.addEventListener('storage',storage);doc.addEventListener('ws-ui-language',language);
 const stop=()=>{observer.disconnect();for(const [selector,patch]of patches){patch.observer.disconnect();if(selector.render===patch.wrapper){selector.unscheduleRender();selector.render=patch.render;selector._render=patch.scheduled;}patch.button.remove();patch.note.remove();selector.querySelectorAll('.ws-font-star').forEach((star:Element)=>star.remove());selector.classList.remove('ws-font-favorites-active');}patches.clear();win.removeEventListener('storage',storage);doc.removeEventListener('ws-ui-language',language);win.removeEventListener('pagehide',stop);if((win as any)[KEY]===stop)delete(win as any)[KEY];};
 win.addEventListener('pagehide',stop);(win as any)[KEY]=stop;return stop;
}
