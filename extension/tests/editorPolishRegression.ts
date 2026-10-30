import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {installUiLanguage} from '../src/i18n/interface';
import {translateUiText,sourceUiText} from '../src/i18n/catalog';
import {installDirectClipDelete} from '../src/content/directClipDelete';
const win=new Window({url:'https://wide.video/app/1.7.12/'}),doc=win.document;
let saved='original';const listeners=new Set<Function>();
(globalThis as any).chrome={runtime:{sendMessage:async(m:any)=>{if(m.type==='SW_SAVE_INTERFACE_LANGUAGE'){saved=m.language;for(const fn of listeners)fn({wsInterfaceLanguage:{newValue:saved}},'local');}return {success:true,data:{language:saved}};}},storage:{local:{get:async()=>({wsInterfaceLanguage:saved}),set:async(v:any)=>{saved=v.wsInterfaceLanguage;for(const fn of listeners)fn({wsInterfaceLanguage:{newValue:saved}},'local');}},onChanged:{addListener:(fn:Function)=>listeners.add(fn),removeListener:(fn:Function)=>listeners.delete(fn)}}};
doc.body.innerHTML='<div id="ProjectApp" class="ProjectApp"><div id="wide-studio-workspace"></div><button id="native">Project</button><div class="label">Delete Clip</div><div class="MediaView" title="Project"><span>Project</span></div><div class="TimelineClipContainer">Delete</div><input value="Project" placeholder="Cole o link aqui…"><textarea>Project</textarea><div class="ProjectMetadataView"><h1>Project</h1><div class="label">Folder</div><div class="value">Project</div></div><div class="MenuBar"><div class="EditMenu"></div></div></div>';

const pause=()=>new Promise(r=>setTimeout(r,80));
const stop=installUiLanguage(doc as any,true);await pause();let clicks=0;doc.querySelector('#native')!.addEventListener('click',()=>clicks++);
assert.equal(doc.querySelector('select')!.getAttribute('title'),null,'language help does not add a native hover title');assert.ok(doc.querySelector('select')!.getAttribute('aria-description'),'accessible language help is retained');
const choose=async(value:string)=>{const select=doc.querySelector('select')!;select.value=value;select.dispatchEvent(new win.Event('change'));await pause();};
await choose('pt-BR');assert.equal(doc.querySelector('#native')!.textContent,'Projeto');assert.equal(doc.querySelector('.label')!.textContent,'Excluir clipe');assert.equal(sourceUiText(doc.querySelector('.label') as any),'Delete Clip');
assert.equal(doc.querySelector('.MediaView')!.textContent,'Project');assert.equal(doc.querySelector('.TimelineClipContainer')!.textContent,'Delete');assert.equal(doc.querySelector('input')!.value,'Project');assert.equal(doc.querySelector('.ProjectMetadataView h1')!.textContent,'Project');
(doc.querySelector('#native') as any).click();assert.equal(clicks,1,'native event listener preserved');assert.equal(saved,'pt-BR');await choose('en');assert.equal(doc.querySelector('input')!.getAttribute('placeholder'),'Paste the link here…');assert.equal(doc.querySelector('textarea')!.textContent,'Project');
await choose('es');assert.equal(doc.querySelector('#native')!.textContent,'Proyecto');doc.querySelector('#native')!.textContent='Help';await pause();assert.equal(doc.querySelector('#native')!.textContent,'Ayuda');
await choose('original');assert.equal(doc.querySelector('#native')!.textContent,'Help');assert.equal(doc.querySelector('.label')!.textContent,'Delete Clip');
for(const [id,word]of [['en','Project'],['fr','Projet'],['de','Projekt']])assert.equal(translateUiText('Projeto',id as any),word);
// Capture native action metadata; never bypass confirmations for media/files.
const clip={},p={metadata:{appVersion:'1.7.12'},presentation:{layer:[{clip:[clip]}]}};
(doc.querySelector('.ProjectApp') as any).project=p;(doc.querySelector('.EditMenu') as any).project=p;(doc.querySelector('.EditMenu') as any).data={versionPoint:{current:{version:1}}};doc.documentElement.setAttribute('data-wide-studio-workspace','');
const stopDelete=installDirectClipDelete(doc as any);
const dispatch=(name:string,project:any=p,clips=new Set([clip]))=>{const action={name,data:{project,clips,confirm:true}};doc.dispatchEvent(new win.CustomEvent('Ng',{detail:action,bubbles:true}));return action.data.confirm;};
assert.equal(dispatch('DeleteClips'),false);assert.equal(dispatch('DeleteMedia'),true);assert.equal(dispatch('DeleteFile'),true);assert.equal(dispatch('DeleteClips',{}),true);assert.equal(dispatch('DeleteClips',p,new Set([{}])),true);
p.metadata.appVersion='future';assert.equal(dispatch('DeleteClips'),true);p.metadata.appVersion='1.7.12';doc.documentElement.removeAttribute('data-wide-studio-workspace');assert.equal(dispatch('DeleteClips'),true);
stopDelete();stop();await win.happyDOM.close();console.log('Editor polish: language switching/restoration, source labels, persistent preference, protected project/media text, native event preservation, and clip-only confirmation bypass passed.');
