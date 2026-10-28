import {SmoothHistory} from './smoothHistory';
import {captureHistoryViewport,restoreHistoryViewport} from './historyViewport';
type Entry={version:number;reasons:string[];source:unknown};
type Point={current?:any;previous?:any;next?:any};
const KEY='__WIDE_STUDIO_HISTORY_UNINSTALL__';
export function historyLabel(reasons:string[]){const labels:Record<string,string>={'Create project':'Criar projeto','Open project':'Abrir projeto','Add clip':'Adicionar clipe','Remove clip':'Excluir clipe','Remove clips':'Excluir clipes','Add layer':'Adicionar camada','Remove layer':'Excluir camada','Update scene':'Ajustar cena','Update filter Start Time':'Mover clipe','Add filter Position':'Adicionar posicionamento','Update filter Position':'Ajustar posicionamento','Split clip':'Dividir clipe'};return reasons.length?reasons.map(reason=>labels[reason]||reason).join(' · '):'Estado do projeto';}
export function mergeHistory(entries:Map<number,Entry>,point:Point,oldPoint?:Point){
 const current=point.current;
 if(current&&oldPoint?.current&&current.version>oldPoint.current.version&&oldPoint.next&&current!==oldPoint.next){for(const version of entries.keys())if(version>=current.version)entries.delete(version);}
 for(const source of [point.previous,current,point.next])if(source&&Number.isSafeInteger(source.version))entries.set(source.version,{version:source.version,reasons:Array.isArray(source.reasons)?source.reasons.filter((r:unknown)=>typeof r==='string').map((r:string)=>r.slice(0,180)):[],source});
 while(entries.size>20)entries.delete(Math.min(...entries.keys()));
}
export function installHistoryControls(){
 (window as any)[KEY]?.();let identity='',busy=false,stopped=false,renderKey='',feedback='',lastPanel:Element|null=null;
 const root=()=>document.querySelector<HTMLElement>('#ProjectApp') as any;
 const parts=()=>{const r=root(),p=r?.project,m=r?.querySelector('.MenuBar .EditMenu') as any;return p?.metadata?.appVersion==='1.7.12'&&m?.project===p?{r,p,m}:undefined;};
 const smooth=new SmoothHistory(parts,direction=>{void perform(direction<0?0:1);});
 const render=()=>{
  if(stopped)return;const live=parts(),toolbar=document.querySelector('#wide-studio-workspace');
  if(toolbar&&!toolbar.querySelector('.ws-history-controls')){
   const controls=document.createElement('div');controls.className='ws-history-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Histórico de edição');
   for(const [action,icon,label]of [['undo','↶','Desfazer'],['redo','↷','Refazer']]){const b=document.createElement('button');b.type='button';b.textContent=icon;b.dataset.wsHistoryAction=action;b.setAttribute('aria-label',label);b.title=label;b.disabled=true;controls.append(b);}
   toolbar.insertBefore(controls,toolbar.querySelector('.ws-quick-bar'));
  }
  const panel=document.querySelector<HTMLElement>('.ws-history-panel');
  if(!live){document.querySelectorAll<HTMLButtonElement>('[data-ws-history-action]').forEach(b=>b.disabled=true);return;}
  const {p,m}=live,key=String(p.metadata.createdTime?.getTime?.()??'')+'|'+String(p.directory?.setup?.path??'');
  if(key!==identity){identity=key;smooth.reset();renderKey='';feedback='';}
  const next=m.data?.versionPoint as Point|undefined;
  if(next)smooth.observe(p,next);

  for(const [index,action]of ['undo','redo'].entries()){
   const b=document.querySelector<HTMLButtonElement>(`[data-ws-history-action="${action}"]`);if(!b)continue;
   const disabled=busy||!smooth.can(index===0?-1:1);if(b.disabled!==disabled)b.disabled=disabled;
   const title=(action==='undo'?'Desfazer':'Refazer')+(smooth.label(index===0?-1:1)?': '+historyLabel([smooth.label(index===0?-1:1)]):'');if(b.title!==title)b.title=title;
  }
  const nativeMenu=document.querySelector<HTMLDialogElement>('dialog.ContextMenu.menuBarMenu[open]');const nativeButtons=nativeMenu?.querySelectorAll<HTMLButtonElement>('button');
  if(nativeButtons&&/^Undo(?:\b|:)/.test(nativeButtons[0]?.querySelector('.label')?.textContent||'')&&/^Redo(?:\b|:)/.test(nativeButtons[1]?.querySelector('.label')?.textContent||'')){
   for(const [index,action]of ['undo','redo'].entries()){const button=nativeButtons[index],disabled=busy||!smooth.can(index===0?-1:1);button.dataset.wsHistoryAction=action;button.classList.toggle('disabled',disabled);if(button.disabled!==disabled)button.disabled=disabled;button.setAttribute('aria-disabled',String(disabled));const label=button.querySelector('.label'),text=(index===0?'Undo':'Redo')+(smooth.label(index===0?-1:1)?': '+smooth.label(index===0?-1:1):'');if(label&&label.textContent!==text)label.textContent=text;}
  }
  if(!panel)return;
  const current=smooth.cursor;const visible=smooth.states.map((state,index)=>({version:index,reasons:state.snapshot.reasons||[]}));
  const signature=JSON.stringify([identity,current,visible.map(e=>[e.version,e.reasons]),busy,feedback]);
  if(signature===renderKey&&panel===lastPanel)return;renderKey=signature;lastPanel=panel;
  const panelScroll=panel.scrollTop;panel.replaceChildren();const title=document.createElement('h3');title.textContent='Histórico de edição';
  const note=document.createElement('p');note.className='ws-history-note';note.textContent='Histórico da sessão. Movimentos compatíveis são restaurados diretamente, sem reabrir o projeto.';panel.append(title,note);
  const status=document.createElement('p');status.className='ws-history-status';status.setAttribute('role','status');status.textContent=busy?'Restaurando versão…':feedback|| (visible.length?'Etapa atual: '+(current+1):'Ainda não há alterações registradas.');panel.append(status);
  const list=document.createElement('ol');list.className='ws-history-list';
  for(const entry of visible.sort((a,b)=>b.version-a.version)){
   const row=document.createElement('li');row.classList.toggle('ws-history-future',entry.version>current);if(entry.version===current)row.setAttribute('aria-current','step');
   row.title=entry.reasons.join(' · ');const label=document.createElement('strong');label.textContent=historyLabel(entry.reasons);
   const detail=document.createElement('span');detail.textContent='Etapa '+(entry.version+1)+(entry.version===current?' · Atual':entry.version>current?' · Desfeita (pode refazer)':'');row.append(label,detail);list.append(row);
  }panel.append(list);panel.scrollTop=panelScroll;
 };
 const perform=async(index:number)=>{
  const live=parts();if(!live||busy||document.querySelector('dialog[open]:not(.ContextMenu)')||!smooth.can(index===0?-1:1))return;
  const oldIdentity=identity,viewport=captureHistoryViewport(live.r,live.p);busy=true;feedback='';render();
  try{await smooth.apply(index===0?-1:1);}catch(error){feedback=String(error).replace(/^Error: /,'');}
  finally{busy=false;render();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));const now=parts();if(!stopped&&now&&identity===oldIdentity)restoreHistoryViewport(now.r,now.p,viewport);}
 };
 const click=(event:MouseEvent)=>{const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-ws-history-action]'):null;if(!target||!event.isTrusted||target.disabled||busy||!document.documentElement.hasAttribute('data-wide-studio-workspace'))return;event.preventDefault();event.stopImmediatePropagation();target.closest<HTMLDialogElement>('dialog.ContextMenu')?.close();void perform(target.dataset.wsHistoryAction==='undo'?0:1);};
 const timer=setInterval(render,300);document.addEventListener('click',click,true);render();
 const uninstall=()=>{stopped=true;smooth.dispose();clearInterval(timer);document.removeEventListener('click',click,true);window.removeEventListener('pagehide',uninstall);document.querySelectorAll('.ws-history-controls').forEach(n=>n.remove());if((window as any)[KEY]===uninstall)delete(window as any)[KEY];};
 window.addEventListener('pagehide',uninstall);(window as any)[KEY]=uninstall;return uninstall;
}
