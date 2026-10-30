import {languages,validLanguage,translateUiText,type Language} from './catalog';
const STORAGE='wsInterfaceLanguage';
async function preference(type:string,language?:Language){const response=await chrome.runtime.sendMessage({type,...(language?{language}:{})});if(!response?.success)throw new Error(response?.error||'Não foi possível salvar o idioma.');return response.data.language;}
export function installUiLanguage(doc:Document=document,withControl=false){
 const win=doc.defaultView!;let language:Language='original',stopped=false,scheduled=false,revision=0;
 const originalLanguage=doc.documentElement.lang;
 const textRecords=new WeakMap<Text,{source:string;rendered:string}>();
 const attributeRecords=new WeakMap<Element,Map<string,{source:string;rendered:string}>>();
 const protectedSelector='.drive-file-info strong,.drive-preview header strong,.drive-path nav,.drive-files .folder .drive-file,.conversation article,.review p,.MediaDescription .tag,.TimelineClipContainer,.TimelineLayerRow .name,.TimelineLayerRow .label,.SelectionBreadcrumbs,.SimpleValueRow .value,.ConfirmView .message strong,.ConfirmView .message q,.NotificationsContainer strong,.NotificationsContainer q,.ws-language-control,.MediaListView .path,script,style,code,pre,[contenteditable="true"],[data-ws-no-translate]';
 const permitted=(element:Element)=>{
  if(element.closest(protectedSelector))return false;
  if(element.closest('.MediaView')&&!element.closest('.MediaDescription .type,.MediaDescription .content'))return false;
  if(element.closest('.ExplorerButton .label')&&!element.closest('.ProjectExplorer .ExplorerButton:not(.ProjectExplorerLayerButton),.ClipExplorerButton,.ClipExplorer .ExplorerButton.icon'))return false;
  if(element.closest('.ProjectMetadataView')&&!element.closest('.label,button'))return false;
  return !!element.closest('#ProjectApp,dialog,#wide-studio-workspace,#app,.Tooltip,.Intro,.NotificationsContainer,.ProgressBar');
 };
 const observe=()=>observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});
 const refresh=()=>{
  scheduled=false;if(stopped)return;observer.disconnect();
  try{
   if(withControl){
    const bar=doc.querySelector('#wide-studio-workspace');
    if(bar&&!bar.querySelector('.ws-language-control')){
     const label=doc.createElement('label');label.className='ws-language-control';
     const caption=doc.createElement('span');caption.textContent='Idioma';
     const select=doc.createElement('select');select.setAttribute('aria-label','Idioma da interface');select.setAttribute('aria-description','Tradução local dos controles principais. Textos sem tradução mantêm o original.');
     for(const [id,name]of languages){const option=doc.createElement('option');option.value=id;option.textContent=name;select.append(option);}
     select.value=language;label.append(caption,select);bar.append(label);
     select.onchange=()=>{if(!validLanguage(select.value))return;apply(select.value);if(typeof chrome!=='undefined')void preference('SW_SAVE_INTERFACE_LANGUAGE',language).catch(()=>{select.setAttribute('aria-description','Não foi possível salvar o idioma. Sua escolha vale nesta página.');});};
    }
    const select=bar?.querySelector<HTMLSelectElement>('.ws-language-control select');if(select&&select.value!==language)select.value=language;
    const caption=bar?.querySelector('.ws-language-control span');const translated=translateUiText('Idioma',language);if(caption&&caption.textContent!==translated)caption.textContent=translated;
   }
   const containers=new Set<Element>();
   const userNames=new Set([...doc.querySelectorAll('.MediaView[title],.TimelineClipContainer[title]')].map(element=>element.getAttribute('title')));
   const walker=doc.createTreeWalker(doc.body,win.NodeFilter.SHOW_TEXT);let node:Node|null;
   while((node=walker.nextNode())){
    const text=node as Text,parent=text.parentElement;if(!parent||!permitted(parent)||parent.closest('input,textarea,[data-ws-history-action]'))continue;
    const value=text.data,old=textRecords.get(text);const source=old&&value===old.rendered?old.source:value;
    if(parent.closest('.Tooltip')&&userNames.has(source.trim()))continue;
    const rendered=translateUiText(source,language);textRecords.set(text,{source,rendered});
    if(value!==rendered){const container=parent.closest('.message,.label,h1,h2,h3,.hint');if(container)containers.add(container);text.data=rendered;}
    if(parent.childNodes.length===1&&source!==rendered){parent.setAttribute('data-ws-source-text',source);parent.setAttribute('data-ws-rendered-text',rendered);}
   }
   for(const element of doc.querySelectorAll('[title],[aria-label],[placeholder]')){
    if(!permitted(element)||element.closest('[data-ws-history-action]'))continue;
    let map=attributeRecords.get(element);if(!map)attributeRecords.set(element,map=new Map());
    for(const attribute of ['title','aria-label','placeholder']){if(attribute==='title'&&element.matches('.ProjectExplorerLayerButton'))continue;const value=element.getAttribute(attribute);if(value===null)continue;const old=map.get(attribute),source=old&&old.rendered===value?old.source:value,rendered=translateUiText(source,language);map.set(attribute,{source,rendered});if(value!==rendered)element.setAttribute(attribute,rendered);}
   }
   const original=(node:Node):string=>{if(node.nodeType===win.Node.TEXT_NODE){const record=textRecords.get(node as Text);return record&&record.rendered===node.textContent?record.source:node.textContent||'';}return [...node.childNodes].map(original).join('');};
   for(const container of containers){container.setAttribute('data-ws-source-text',original(container));container.setAttribute('data-ws-rendered-text',container.textContent||'');}
  }finally{observe();}
 };
 const schedule=()=>{if(!scheduled&&!stopped){scheduled=true;win.requestAnimationFrame(refresh);}};
 const observer=new win.MutationObserver(schedule);
 // Native tag/type filtering reads the clicked label's innerText, rather than a
 // stable value. Let that original click read its source text, then repaint.
 const nativeTypeClick=(event:Event)=>{
  const target=event.target;if(!(target instanceof win.Element)||!target.closest('.MediaDescription.clickableTags .type'))return;
  const restore=(node:Node)=>{if(node.nodeType===win.Node.TEXT_NODE){const text=node as Text,record=textRecords.get(text);if(record&&text.data===record.rendered)text.data=record.source;}else node.childNodes.forEach(restore);};
  restore(target);schedule();
 };
 doc.addEventListener('click',nativeTypeClick,true);
 const apply=(value:Language)=>{revision++;language=value;doc.documentElement.dataset.wsLanguage=value;doc.documentElement.lang=value==='original'?originalLanguage:value;schedule();};
 const changed=(changes:{[key:string]:chrome.storage.StorageChange},area:string)=>{if(area==='local'&&changes[STORAGE]&&validLanguage(changes[STORAGE].newValue))apply(changes[STORAGE].newValue);};
 const broadcast=(event:Event)=>{const value=(event as CustomEvent).detail;if(validLanguage(value))apply(value);};
 doc.addEventListener('ws-ui-language',broadcast);
 apply('original');observe();
 if(typeof chrome!=='undefined'){
  const initialRevision=revision;
  void preference('SW_GET_INTERFACE_LANGUAGE').then(value=>{if(!stopped&&revision===initialRevision&&validLanguage(value))apply(value);}).catch(()=>{});
  chrome.storage?.onChanged?.addListener(changed);
 }
 const uninstall=()=>{stopped=true;observer.disconnect();doc.removeEventListener('click',nativeTypeClick,true);doc.removeEventListener('ws-ui-language',broadcast);win.removeEventListener('pagehide',uninstall);if(typeof chrome!=='undefined')chrome.storage?.onChanged?.removeListener(changed);};
 win.addEventListener('pagehide',uninstall);return uninstall;
}
