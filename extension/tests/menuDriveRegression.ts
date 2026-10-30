import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {MenuLayoutSchema,defaultMenuLayout} from '../src/storage/menuLayout';
import {driveId,parsePublicFolder,readBounded,publicThumbnail} from '../src/drive/publicDrive';
const win=new Window({url:'https://wide.video/app/1.7.12/'});
Object.defineProperty(globalThis,'document',{value:win.document,configurable:true});
const {runNativeAction}=await import('../src/content/nativeActions');
win.document.body.innerHTML='<div id="ProjectApp"><div id="wide-studio-workspace"><button>Export Screenshot</button><button>Ripple Delete</button></div><div class="MenuBar"><button class="ProjectMenu">Project</button><button class="EditMenu">Edit</button><button class="SmartToolsMenu">Smart</button></div><div class="PreviewPanel"><div class="Controls"><button class="exportScreenshot">Screenshot</button></div></div><div class="TimelinePanel"><div class="Controls"><button class="split" disabled>Split</button></div></div></div>';
const root=win.document.querySelector<HTMLElement>('#ProjectApp')!;
let exports=0,screenshots=0,undos=0,ripples=0;
win.document.querySelector<HTMLButtonElement>('.exportScreenshot')!.onclick=()=>{screenshots++;};
win.document.querySelector<HTMLButtonElement>('.ProjectMenu')!.onclick=()=>{
 win.document.querySelectorAll('dialog').forEach(d=>d.remove());const popup=win.document.createElement('dialog');popup.className='ContextMenu menuBarMenu';popup.setAttribute('open','');popup.innerHTML='<button class="icon export">Export</button><button class="icon exportScreenshot">Screenshot</button>';popup.querySelector<HTMLButtonElement>('.export')!.onclick=()=>{exports++;const dialog=win.document.createElement('dialog');dialog.setAttribute('open','');win.document.body.append(dialog);};win.document.body.append(popup);
};
await runNativeAction(root,'exportVideo');assert.equal(exports,1);assert.equal(screenshots,0,'video export never selects screenshot');
await runNativeAction(root,'exportScreenshot');assert.equal(screenshots,1);
let disabled=true;
win.document.querySelector<HTMLButtonElement>('.EditMenu')!.onclick=()=>{
 win.document.querySelectorAll('dialog').forEach(d=>d.remove());const popup=win.document.createElement('dialog');popup.className='ContextMenu menuBarMenu';popup.setAttribute('open','');popup.innerHTML=`<button ${disabled?'class="disabled"':''}>Undo</button><button><span class="label">Ripple Delete Clip</span></button>`;popup.querySelectorAll<HTMLButtonElement>('button')[0].onclick=()=>{undos++;};popup.querySelectorAll<HTMLButtonElement>('button')[1].onclick=()=>{ripples++;};win.document.body.append(popup);
};
await assert.rejects(()=>runNativeAction(root,'undo'),/indisponível/);disabled=false;await runNativeAction(root,'undo');assert.equal(undos,1);
await runNativeAction(root,'rippleDelete');assert.equal(ripples,1,'native action, never the quick button itself');
await assert.rejects(()=>runNativeAction(root,'split'),/indisponível/);
const mediaMenu=win.document.createElement('button');mediaMenu.className='MediaMenu';root.querySelector('.MenuBar')!.append(mediaMenu);
let texts=0;mediaMenu.onclick=()=>{
 win.document.querySelectorAll('dialog').forEach(d=>d.remove());const popup=win.document.createElement('dialog');popup.className='ContextMenu menuBarMenu';popup.setAttribute('open','');popup.innerHTML='<button class="icon addText">Text</button>';popup.querySelector('button')!.onclick=()=>{
  popup.remove();const dialog=win.document.createElement('dialog');dialog.setAttribute('open','');dialog.innerHTML='<form class="AddClipForm"><div class="source-text"></div><button type="submit">Create</button></form>';dialog.querySelector('form')!.onsubmit=e=>{e.preventDefault();texts++;dialog.remove();};win.document.body.append(dialog);
 };win.document.body.append(popup);
};
await runNativeAction(root,'addText');assert.equal(texts,1,'text creation submits the native form exactly once');assert.equal(win.document.querySelector('dialog[open] .AddClipForm'),null);
assert.ok(MenuLayoutSchema.safeParse(defaultMenuLayout).success);
const changed=structuredClone(defaultMenuLayout);changed.folders.reverse();changed.folders[0].name='Favoritos';changed.folders[0].actions.push('undo');assert.equal(MenuLayoutSchema.safeParse(changed).success,false,'duplicated action rejected');
assert.equal(driveId('https://drive.google.com/drive/folders/abcdefghijklm'),'abcdefghijklm');assert.throws(()=>driveId('https://attacker.invalid/drive/folders/abcdefghijklm'));
const raw=JSON.stringify([[['abcdefghijklm',null,'Meme.gif','image/gif'],['folderabcdefgh',null,'Subpasta','application/vnd.google-apps.folder']]]);
const literal=[...raw].map(char=>'\\x'+char.charCodeAt(0).toString(16).padStart(2,'0')).join('');
assert.equal(parsePublicFolder(`window['_DRIVE_ivd'] = '${literal}';`)[0].name,'Meme.gif');
assert.throws(()=>parsePublicFolder('<html>Sign in</html>'),/não está pública/);
await assert.rejects(()=>readBounded(new Response('large',{headers:{'content-length':'999999999'}}),1024),/limite/);
const sizedRow=['abcdefghijklm',null,'Texture.jpg','image/jpeg',null,null,null,null,null,null,null,null,null,'104857600'];
const sizedLiteral=JSON.stringify([[sizedRow]]).replace(/'/g,"\\'");
assert.equal(parsePublicFolder(`window['_DRIVE_ivd'] = '${sizedLiteral}';`)[0].size,104857600,'size available before import');
const originalFetch=globalThis.fetch;let fetched='';
globalThis.fetch=async(input)=>{fetched=String(input);return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}});};
assert.equal((await publicThumbnail('abcdefghijklm',true)).bytes,3);assert.ok(fetched.endsWith('=w1920'));
globalThis.fetch=async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}});
await assert.rejects(()=>publicThumbnail('abcdefghijklm'),/indisponível/);globalThis.fetch=originalFetch;
await win.happyDOM.close();console.log('Menu/Drive regressions passed: exact native targets, disabled actions, layout schema, public parsing, URL allowlist and download bounds.');
