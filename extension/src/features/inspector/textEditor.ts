import {observeEditor,invalidateEditor} from '../../core/editorActivity';
import {beforeHistory} from '../../core/historyBarrier';
import {supportsEditor} from '../../integrations/wide/compatibility';
import {createNativeTextWriter} from '../../integrations/wide/legacy/textEdit';
import {waitForNativeSave} from '../../integrations/wide/legacy/clipActions';
import {translateUiText,validLanguage} from '../../i18n/common';

type Binding={root:HTMLElement;project:any;clip:any;form:any;section:HTMLElement;input:HTMLTextAreaElement;status:HTMLElement;save:HTMLButtonElement;base:string;saved:string;unsaved:boolean;write?:ReturnType<typeof createNativeTextWriter>;confirming?:Promise<void>;timer?:ReturnType<typeof setTimeout>;previewTimer?:ReturnType<typeof setTimeout>;composing:boolean};
const KEY='__WIDE_STUDIO_TEXT_EDITOR_STOP__';
export function validateTextTarget(root:HTMLElement,project:any,clip:any,baseline:string){
 if((root as any).project!==project)throw Error('O projeto mudou. O texto não foi salvo.');
 const layer=project.presentation.layer.find((layer:any)=>layer.clip.includes(clip));
 if(!layer||clip.load?.source!=='text')throw Error('O clipe de texto não está mais disponível.');
 if(clip.locked||layer.locked)throw Error('Desbloqueie o clipe e sua camada para editar o texto.');
 if(clip.load.text!==baseline)throw Error('O texto mudou no editor. Selecione o clipe novamente antes de salvar.');
}

export function installTextEditor(doc:Document=document){
 const win=doc.defaultView!;(win as any)[KEY]?.();
 let current:Binding|undefined,stopped=false;
 const pending=new Set<Binding>();
 const localize=(text:string)=>{const language=doc.documentElement.dataset.wsLanguage;return translateUiText(text,validLanguage(language)?language:'original');};
 const paint=(binding:Binding)=>{
  const layer=binding.project.presentation.layer.find((layer:any)=>layer.clip.includes(binding.clip));
  const locked=!layer||!!binding.clip.locked||!!layer.locked;
  binding.input.readOnly=locked;binding.input.setAttribute('aria-readonly',String(locked));
  binding.save.disabled=locked||!binding.unsaved&&binding.input.value===binding.base;
 };
 const fail=(binding:Binding,error:unknown)=>{binding.status.textContent=String(error).replace(/^Error: /,'');binding.status.setAttribute('role','alert');paint(binding);};
 const preview=(binding:Binding)=>{
  clearTimeout(binding.previewTimer);binding.previewTimer=undefined;
  const value=binding.input.value;if(value===binding.base||binding.composing||stopped)return;
  validateTextTarget(binding.root,binding.project,binding.clip,binding.base);
  binding.write??=createNativeTextWriter(binding.form,binding.project,binding.clip);
  // Wide's own input path: repaint without serializing/saving the project.
  // The writer is captured once; each frame consumes only the newest draft.
  binding.write(value,'fast');
  if(binding.clip.load.text!==value)throw Error('A atualização do texto não foi confirmada.');
  binding.base=value;binding.unsaved=true;paint(binding);
 };
 const commit=(binding:Binding):Promise<void>=>{
  clearTimeout(binding.timer);
  if(binding.composing||stopped)return Promise.resolve();
  try{
   preview(binding);
   if(!binding.unsaved)return binding.confirming||Promise.resolve();
   validateTextTarget(binding.root,binding.project,binding.clip,binding.base);
   binding.write!(binding.base,'save');binding.saved=binding.base;binding.unsaved=false;
  }catch(error){fail(binding,error);return Promise.resolve();}
  binding.status.textContent=localize('Salvando…');paint(binding);
  // Confirmation is independent of preview. New input must never wait for disk.
  if(!binding.confirming){
   pending.add(binding);
   binding.confirming=waitForNativeSave(binding.root,binding.project).then(()=>{
    if(!binding.unsaved&&binding.input.value===binding.saved&&binding.status.getAttribute('role')!=='alert')binding.status.textContent=localize('Salvo');
   }).catch(error=>fail(binding,error)).finally(()=>{binding.confirming=undefined;pending.delete(binding);paint(binding);invalidateEditor(doc);});
  }
  return binding.confirming;
 };
 const schedule=(binding:Binding)=>{
  clearTimeout(binding.timer);if(binding.composing)return;
  if(binding.previewTimer===undefined)binding.previewTimer=setTimeout(()=>{try{preview(binding);}catch(error){fail(binding,error);}},40);
  binding.timer=setTimeout(()=>void commit(binding),350);
 };
 const create=(root:HTMLElement,project:any,clip:any,form:any):Binding=>{
  const section=doc.createElement('section');section.className='ws-text-editor';
  const label=doc.createElement('label');label.textContent=localize('Conteúdo do texto');label.htmlFor='ws-text-content';
  const input=doc.createElement('textarea');input.id='ws-text-content';input.rows=3;input.value=clip.load.text;input.spellcheck=true;input.setAttribute('data-ws-no-translate','');input.setAttribute('aria-label',localize('Conteúdo do texto'));
  const footer=doc.createElement('div');footer.className='ws-text-editor-footer';
  const hint=doc.createElement('small');hint.textContent=localize('Salva automaticamente · Ctrl+Enter');
  const save=doc.createElement('button');save.type='button';save.className='ws-text-save';save.textContent=localize('Salvar');
  const status=doc.createElement('small');status.className='ws-text-editor-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  footer.append(hint,save);section.append(label,input,footer,status);
  const binding:Binding={root,project,clip,form,section,input,status,save,base:clip.load.text,saved:clip.load.text,unsaved:false,composing:false};
  input.addEventListener('input',event=>{event.stopPropagation();status.setAttribute('role','status');status.textContent='';paint(binding);schedule(binding);});
  input.addEventListener('change',event=>event.stopPropagation());
  input.addEventListener('compositionstart',()=>{binding.composing=true;clearTimeout(binding.timer);clearTimeout(binding.previewTimer);binding.previewTimer=undefined;});
  input.addEventListener('compositionend',()=>{binding.composing=false;schedule(binding);});
  input.addEventListener('blur',()=>void commit(binding));save.onclick=()=>void commit(binding);
  input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void commit(binding);}});
  paint(binding);return binding;
 };
 const refresh=()=>{
  if(stopped)return;
  const root=doc.querySelector<HTMLElement>('#ProjectApp'),project=(root as any)?.project;
  const explorer=root?.querySelector('.ClipExplorer') as any,clip=explorer?.clip,form=explorer?.form;
  const usable=doc.documentElement.hasAttribute('data-wide-studio-workspace')&&supportsEditor(project?.metadata?.appVersion)&&explorer?.project===project&&clip?.load?.source==='text'&&form?.isConnected;
  if(!usable||current?.project!==project||current?.clip!==clip||current?.form!==form){
   if(current){void commit(current);current.section.remove();current=undefined;}
   if(!usable)return;
   current=create(root!,project,clip,form);explorer.insertBefore(current.section,explorer.firstChild);
  }
  if(!current)return;
  if(!current.section.isConnected)explorer.insertBefore(current.section,explorer.firstChild);
  if(!current.unsaved&&!current.confirming&&current.input.value===current.base&&clip.load.text!==current.base){current.base=clip.load.text;current.saved=clip.load.text;current.input.value=clip.load.text;current.status.textContent='';}
  paint(current);
 };
 const stopActivity=observeEditor(refresh,doc);refresh();
 const stopHistory=beforeHistory(async project=>{
  const waits=new Set<Promise<void>>();
  const binding=current;if(binding&&binding.project===project)waits.add(commit(binding));
  for(const binding of pending)if(binding.project===project&&binding.confirming)waits.add(binding.confirming);
  await Promise.all(waits);
 });
 const stop=()=>{if(current)void commit(current);stopped=true;stopHistory();stopActivity();if(current){clearTimeout(current.timer);clearTimeout(current.previewTimer);current.section.remove();}for(const binding of pending){clearTimeout(binding.timer);clearTimeout(binding.previewTimer);}win.removeEventListener('pagehide',stop);if((win as any)[KEY]===stop)delete (win as any)[KEY];};
 win.addEventListener('pagehide',stop);(win as any)[KEY]=stop;return stop;
}
