import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const win=new Window({url:'https://example.test/drive.html?editorTabId=1'});
for(const key of ['window','document','location','HTMLElement','Event','Node','IntersectionObserver'])Object.defineProperty(globalThis,key,{value:key==='window'?win:(win as any)[key],configurable:true});
const store:Record<string,any>={};let imports=0;const messages:any[]=[];
Object.defineProperty(globalThis,'chrome',{value:{permissions:{contains:async()=>true,request:async()=>true},storage:{local:{get:async()=>store,set:async(v:any)=>Object.assign(store,v)}},runtime:{sendMessage:async(m:any)=>{messages.push(m);if(m.type==='SW_DRIVE_LIST')return {success:true,data:[{id:'largeimageid123',name:'Papel original.jpg',mime:'image/jpeg',size:40*1048576},{id:'smallgifid1234',name:'Meme.gif',mime:'image/gif',size:80000}]};if(m.type==='SW_DRIVE_PREVIEW')return {success:true,data:{mime:'image/gif',base64:'R0lGODlh'}};if(m.type==='SW_DRIVE_THUMB')return {success:true,data:{mime:'image/png',base64:'iVBORw0KGgo='}};if(m.type==='SW_GET_CONTEXT')return {success:true,data:{project:{id:'project'}}};if(m.type==='SW_DRIVE_IMPORT'){imports++;await new Promise(r=>setTimeout(r,50));return {success:true,data:{imported:true,name:'Papel original-leve.jpg'}};}throw new Error(m.type);}}},configurable:true});
const {render,h,options}=await import('preact');options.requestAnimationFrame=f=>setTimeout(f,0) as any;
const {Drive}=await import('../src/ui/DriveBrowser');
win.document.body.innerHTML='<div id="app"></div>';render(h(Drive,{}),win.document.querySelector('#app') as any);
const pause=(ms=80)=>new Promise(r=>setTimeout(r,ms));await pause();
const button=(text:string)=>{const b=[...win.document.querySelectorAll('button')].find(b=>b.textContent?.trim().replace(/\s+/g,' ')===text||b.getAttribute('aria-label')===text);assert.ok(b,text);return b;};
button('Visualizar Papel original.jpg').click();await pause();
assert.notEqual(button('Adicionar cópia leve · largura até 1920 px').getAttribute('draggable'),'true','pointer gestures do not start competing HTML drag');assert.notEqual(button('Visualizar Papel original.jpg').getAttribute('draggable'),'true','large original cannot be dragged silently');
assert.ok(button('Adicionar original à Biblioteca').disabled,'known oversize prevented before download');
assert.ok(win.document.body.textContent.includes('40.0 MB'),'size visible before import');
button('Adicionar cópia leve · largura até 1920 px').click();button('Adicionar cópia leve · largura até 1920 px').click();await pause(150);
assert.equal(imports,1,'rapid double click imports once');assert.ok(messages.find(m=>m.type==='SW_DRIVE_IMPORT'&&m.light===true&&m.expectedProjectId==='project'));
assert.ok(win.document.body.textContent.includes('na Biblioteca'),'native confirmation surfaced');
button('Fechar prévia').click();await pause();const search=win.document.querySelector<HTMLInputElement>('#drive-search')!;search.value='nothing';search.dispatchEvent(new win.Event('input',{bubbles:true}));await pause();assert.ok(win.document.body.textContent.includes('Nenhum resultado nesta pasta'));
button('Limpar filtros').click();await pause();button('Favoritar pasta').click();await pause();assert.equal(store.driveFavorites[0].name,'Seu pack');
assert.equal(messages.filter(m=>m.type==='SW_DRIVE_IMPORT').length,1,'browsing does not download originals');
button('Visualizar Meme.gif').click();await pause();button('▶ Ver animação').click();await pause();assert.ok(messages.some(m=>m.type==='SW_DRIVE_PREVIEW'));assert.equal(win.document.querySelectorAll('iframe').length,0,'no blocked Google preview embed');assert.ok(win.document.querySelector('.drive-native-player img')?.getAttribute('src')?.startsWith('blob:'));
render(null,win.document.querySelector('#app') as any);await win.happyDOM.close();console.log('Drive UI passed: preview, size guard, explicit light copy, double-click lock, confirmation, filters, favorites and no original prefetch.');






