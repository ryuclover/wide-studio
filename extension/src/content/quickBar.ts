import {actionLabels,runNativeAction} from './nativeActions';
import {defaultMenuLayout,MenuLayoutSchema,type MenuLayout,ids,nativeMenus,nativeMenuLabels,folderKey} from '../storage/menuLayout';
let layout:MenuLayout=structuredClone(defaultMenuLayout);
function option(text:string,value:string){const element=document.createElement('option');element.textContent=text;element.value=value;return element;}
function applyLayout(root:HTMLElement){
 for(const name of nativeMenus){const element=root.querySelector<HTMLElement>(`.MenuBar .${name}`);if(element){element.classList.toggle('ws-user-hidden',layout.hiddenMenus.includes(name));element.style.order=String(10+layout.toolbarOrder.indexOf(name));}}
 for(const element of root.querySelectorAll<HTMLElement>('[data-ws-folder-id]')){const id=element.dataset.wsFolderId!;element.style.order=String(10+layout.toolbarOrder.indexOf(folderKey(id)));element.classList.toggle('ws-user-hidden',layout.hiddenFolders.includes(id));}
 root.querySelector('.MenuBar')?.classList.toggle('ws-hide-language',!layout.showLanguage);
}
export function syncQuickBar(root:HTMLElement){applyLayout(root);root.querySelectorAll<HTMLButtonElement>('[data-native-action="split"]').forEach(b=>{const n=root.querySelector<HTMLButtonElement>('.TimelinePanel .Controls button.split');if(b.disabled!==(!n||n.disabled))b.disabled=!n||n.disabled;});}
export function buildQuickBar(root:HTMLElement){
 const bar=document.createElement('div');bar.className='ws-quick-bar';
 const render=()=>{bar.replaceChildren();
  const status=document.createElement('span');status.className='ws-action-status';status.setAttribute('role','status');
  const close=()=>bar.querySelectorAll<HTMLButtonElement>('[aria-expanded]').forEach(b=>{b.setAttribute('aria-expanded','false');b.parentElement?.classList.remove('open');});
  for(const folder of layout.folders){
   const wrap=document.createElement('div');wrap.className='ws-folder';wrap.dataset.wsFolderId=folder.id;
   const trigger=document.createElement('button');trigger.className='ws-folder-trigger';if(!defaultMenuLayout.folders.some(f=>f.id===folder.id&&f.name===folder.name))trigger.dataset.wsNoTranslate='';trigger.textContent=folder.name+' ▾';trigger.type='button';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-haspopup','menu');
   const menu=document.createElement('div');menu.className='ws-folder-menu';menu.setAttribute('role','menu');
   trigger.onclick=e=>{e.stopPropagation();const was=trigger.getAttribute('aria-expanded')==='true';document.body.click();document.querySelectorAll<HTMLDialogElement>('dialog.ContextMenu[open]').forEach(dialog=>dialog.close());close();if(!was){trigger.setAttribute('aria-expanded','true');wrap.classList.add('open');}};
   for(const id of folder.actions){const b=document.createElement('button');b.type='button';b.className='ws-folder-item';b.dataset.nativeAction=id;b.textContent=actionLabels[id];b.setAttribute('role','menuitem');b.onclick=async e=>{e.stopPropagation();close();try{const live=document.querySelector<HTMLElement>('#ProjectApp');if(!live)throw new Error('Abra um projeto.');await runNativeAction(live,id);status.textContent='';}catch(error){status.textContent=String(error);}};menu.append(b);}
   wrap.onkeydown=e=>{const buttons=[...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(e.key==='Escape'){e.preventDefault();close();trigger.focus();}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();wrap.classList.add('open');trigger.setAttribute('aria-expanded','true');const current=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(current+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};
   wrap.append(trigger,menu);bar.append(wrap);
  }
  const customize=document.createElement('button');customize.type='button';customize.className='ws-folder-trigger ws-customize-trigger';customize.textContent='Personalizar';customize.onclick=()=>{close();editLayout(root,render,status);};bar.append(customize,status);syncQuickBar(document.querySelector<HTMLElement>('#ProjectApp')||root);
 };
 document.addEventListener('click',e=>{if(!(e.target as Element)?.closest?.('.ws-folder'))bar.querySelectorAll('.ws-folder.open').forEach(f=>{f.classList.remove('open');f.querySelector('button')?.setAttribute('aria-expanded','false');});},true);
 render();void chrome.runtime.sendMessage({type:'SW_GET_MENU_LAYOUT'}).then(response=>{const parsed=MenuLayoutSchema.safeParse(response?.data);if(response?.success&&parsed.success){layout=parsed.data;render();}}).catch(()=>{});return bar;
}
function editLayout(root:HTMLElement,render:()=>void,status:HTMLElement){
 if(document.querySelector('dialog.ws-customize[open]'))return;
 const draft=structuredClone(layout),dialog=document.createElement('dialog');dialog.className='ws-customize';
 const title=document.createElement('h2');title.textContent='Personalizar menus';dialog.append(title);
 const body=document.createElement('div'),feedback=document.createElement('p');body.className='ws-customize-body';feedback.setAttribute('role','alert');dialog.append(body,feedback);
 const button=(text:string,run:()=>void,label?:string)=>{const b=document.createElement('button');b.type='button';b.textContent=text;if(label)b.setAttribute('aria-label',label);b.onclick=run;return b;};
 const heading=(text:string)=>{const h=document.createElement('h3');h.textContent=text;body.append(h);};
 const draw=()=>{
  body.replaceChildren();heading('Menus da barra');const hint=document.createElement('p');hint.className='ws-customize-hint';hint.textContent='Use as setas para ordenar pastas e menus do Wide. Desmarque para ocultar.';body.append(hint);
  draft.toolbarOrder.forEach((key,index)=>{
   const folder=draft.folders.find(f=>folderKey(f.id)===key),native=nativeMenus.find(id=>id===key);if(!folder&&!native)return;
   const name=folder?.name||nativeMenuLabels[native!],row=document.createElement('div');row.className='ws-menu-order-row';row.dataset.menuKey=key;
   const visible=document.createElement('input');visible.type='checkbox';visible.checked=folder?!draft.hiddenFolders.includes(folder.id):!draft.hiddenMenus.includes(native!);visible.setAttribute('aria-label','Mostrar '+name);
   visible.onchange=()=>{if(folder){draft.hiddenFolders=draft.hiddenFolders.filter(id=>id!==folder.id);if(!visible.checked)draft.hiddenFolders.push(folder.id);}else{draft.hiddenMenus=draft.hiddenMenus.filter(id=>id!==native);if(!visible.checked)draft.hiddenMenus.push(native!);}};
   row.append(visible);
   if(folder){const input=document.createElement('input');input.value=folder.name;input.maxLength=30;input.setAttribute('aria-label','Nome da pasta');input.oninput=()=>folder.name=input.value;row.append(input);}
   else{const label=document.createElement('span');label.className='ws-native-menu-name';label.textContent=name;row.append(label);}
   const up=button('↑',()=>{[draft.toolbarOrder[index-1],draft.toolbarOrder[index]]=[key,draft.toolbarOrder[index-1]];draw();},'Mover '+name+' para a esquerda');up.disabled=index===0;
   const down=button('↓',()=>{[draft.toolbarOrder[index+1],draft.toolbarOrder[index]]=[key,draft.toolbarOrder[index+1]];draw();},'Mover '+name+' para a direita');down.disabled=index===draft.toolbarOrder.length-1;
   row.append(up,down);
   if(folder){const remove=button('Excluir pasta',()=>{draft.folders=draft.folders.filter(f=>f.id!==folder.id);draft.toolbarOrder=draft.toolbarOrder.filter(id=>id!==key);draft.hiddenFolders=draft.hiddenFolders.filter(id=>id!==folder.id);draw();});remove.disabled=draft.folders.length===1;row.append(remove);}
   body.append(row);
  });
  const language=document.createElement('label'),showLanguage=document.createElement('input');showLanguage.type='checkbox';showLanguage.checked=draft.showLanguage;showLanguage.onchange=()=>draft.showLanguage=showLanguage.checked;language.append(showLanguage,document.createTextNode(' Mostrar seletor de idioma à direita'));body.append(language);
  heading('Ações dentro das pastas');
  for(const id of [...draft.folders.flatMap(f=>f.actions),...ids.filter(id=>!draft.folders.some(f=>f.actions.includes(id)))]){
   const label=document.createElement('label');label.className='ws-action-layout-row';const name=document.createElement('span');name.textContent=actionLabels[id];const select=document.createElement('select');select.setAttribute('aria-label',actionLabels[id]);select.append(option('Oculto',''));draft.folders.forEach(f=>select.append(option(f.name,f.id)));select.value=draft.folders.find(f=>f.actions.includes(id))?.id||'';
   select.onchange=()=>{draft.folders.forEach(f=>f.actions=f.actions.filter(a=>a!==id));draft.folders.find(f=>f.id===select.value)?.actions.push(id);};
   label.append(name,select,button('↑',()=>{const f=draft.folders.find(f=>f.actions.includes(id)),i=f?.actions.indexOf(id)??-1;if(f&&i>0){[f.actions[i-1],f.actions[i]]=[id,f.actions[i-1]];draw();}}),button('↓',()=>{const f=draft.folders.find(f=>f.actions.includes(id)),i=f?.actions.indexOf(id)??-1;if(f&&i>=0&&i<f.actions.length-1){[f.actions[i+1],f.actions[i]]=[id,f.actions[i+1]];draw();}}));body.append(label);
  }
 };
 draw();const footer=document.createElement('div');footer.className='ws-customize-footer';footer.append(button('Nova pasta',()=>{if(draft.folders.length<10){const id=crypto.randomUUID();draft.folders.push({id,name:'Nova pasta',actions:[]});draft.toolbarOrder.push(folderKey(id));draw();}}),button('Cancelar',()=>{dialog.close();dialog.remove();}),button('Salvar',()=>{void(async()=>{try{const valid=MenuLayoutSchema.parse(draft);const response=await chrome.runtime.sendMessage({type:'SW_SAVE_MENU_LAYOUT',layout:valid});if(!response?.success)throw new Error(response?.error||'Falha ao salvar');layout=valid;render();dialog.close();dialog.remove();}catch(error){status.textContent=String(error);feedback.textContent=String(error);}})();}));dialog.append(footer);dialog.addEventListener('close',()=>dialog.remove());root.ownerDocument.body.append(dialog);dialog.showModal();
}
