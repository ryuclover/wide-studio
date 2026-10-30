import {puppeteer} from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const expectedError=process.env.EXTRACT_EXPECT_ERROR;
const url=process.env.EXTRACT_TEST_URL||'https://x.com/i/status/1790637656616943991',label=expectedError?'youtube-limit':url.includes('instagram')?'instagram':url.includes('x.com')?'x':'youtube';
const browser=await puppeteer.launch({executablePath:resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe'),headless:true,pipe:true,enableExtensions:true,protocolTimeout:90000,defaultViewport:{width:1440,height:900},args:['--no-first-run']});
const downloadSession=await browser.target().createCDPSession();let browserDownloads=0;
await downloadSession.send('Browser.setDownloadBehavior',{behavior:'deny',eventsEnabled:true});downloadSession.on('Browser.downloadWillBegin',()=>browserDownloads++);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 // The headless browser cannot accept Chrome's native optional-host permission prompt.
 // Grant only this test's source hosts in the disposable staged manifest, never in dist/release.
 const manifestPath=resolve('.browser/drive-test/manifest.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 const hosts=url.includes('youtube')||url.includes('youtu.be')?['https://tubdown.com/*']:url.includes('instagram')?['https://snapinsta.ai/*','https://d.rapidcdn.app/*']:['https://api.fxtwitter.com/*','https://video.twimg.com/*'];
 manifest.host_permissions=[...new Set([...manifest.host_permissions,...hosts])];writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
 const id=await browser.installExtension(resolve('.browser/drive-test'));
 const page=await browser.newPage();page.on('pageerror',e=>console.log('EDITOR ERROR',e.message));
 if(process.env.EXTRACT_SAVED_PROJECT)await page.evaluateOnNewDocument(()=>{window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('extract-saved-test',{create:true});};});
 await page.goto('https://wide.video/app/1.7.12/');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Open Temporary Project')));await page.evaluate(saved=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(saved?'Open Project':'Open Temporary Project')).click(),!!process.env.EXTRACT_SAVED_PROJECT);
 await page.waitForSelector('.ws-extract-panel');
 if(process.env.EXTRACT_FILTERED_LIBRARY){
  await page.evaluate(()=>{const files=new DataTransfer();for(let i=0;i<5;i++)files.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>'],`seed-${i}.svg`,{type:'image/svg+xml'}));document.querySelector('.MediaListView').dispatchEvent(new DragEvent('drop',{dataTransfer:files,bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>document.querySelectorAll('.MediaListView .MediaView.mediaContent-valid').length===5);
  await page.type('.MediaListView input.filter','nothing-matches-this-filter');await page.waitForFunction(()=>document.querySelectorAll('.MediaListView .MediaView').length===0);
 }
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Extrair').click());let frame=await page.waitForFrame(f=>f.url().includes('extract.html'));await frame.waitForSelector('#extract-link');
 assert.equal(await frame.$$eval('input',e=>e.length),1);assert.equal(await frame.$$eval('button',e=>e.length),1);assert.equal(await frame.$$eval('select,details,input[type=password],input[type=checkbox]',e=>e.length),0);
 await frame.type('#extract-link',url);await frame.click('button');
 if(process.env.EXTRACT_TEST_RECOVERY){await browser.waitForTarget(t=>t.url().includes('extract-worker.html'),{timeout:15000});const cdp=await page.createCDPSession();const versions=[];cdp.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions.filter(v=>v.scriptURL.startsWith('chrome-extension://'+id+'/'))));await cdp.send('ServiceWorker.enable');await sleep(300);assert.ok(versions.length,'extension worker observed');for(const version of versions)await cdp.send('ServiceWorker.stopWorker',{versionId:version.versionId});await Promise.all([frame.waitForNavigation({waitUntil:'domcontentloaded'}),page.$eval('.ws-extract-panel iframe',el=>{el.src=el.src;})]);await frame.waitForSelector('#extract-link');console.log('RECOVERY extension service worker stopped and Extract iframe reloaded');}

 for(let n=0;n<115;n++){await sleep(3000);const text=await frame.$eval('.extract-feedback',e=>e.textContent);if(n%5===0){console.log('STAGE',text);for(const site of await browser.pages())if(site.url().startsWith('https://tubdown.com/'))console.log('PROVIDER',await site.evaluate(()=>({duration:document.querySelector('#r-duration')?.textContent,rows:document.querySelectorAll('#r-list-video > div').length,progress:document.querySelector('#j-label')?.textContent,jobVisible:!document.querySelector('#r-job')?.hidden,ready:!document.querySelector('#r-done')?.hidden,error:document.querySelector('#r-job-error')?.textContent})));}if(await frame.$('[role=alert]')){if(expectedError)break;throw new Error(text);}if(text.includes('adicionado à Biblioteca.'))break;}
 const feedback=await frame.$eval('.extract-feedback',e=>e.textContent);let media=[];
 if(expectedError){assert.ok(feedback.includes(expectedError));assert.equal(await page.$$eval('.MediaView.mediaContent-valid',e=>e.length),0);await page.screenshot({path:`../docs/evidence/extract-web-${label}.png`});}
 else{
 assert.match(feedback,/adicionado à Biblioteca/);await page.screenshot({path:`../docs/evidence/extract-web-${label}.png`});
 if(process.env.EXTRACT_FILTERED_LIBRARY){assert.equal(await page.$$eval('.MediaListView .MediaView',e=>e.length),0,'native receipt succeeds even while Library filter hides the imported media');await page.$eval('.MediaListView input.filter',input=>{input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));});}
 await page.evaluate(()=>[...document.querySelectorAll('.MediaPanel [role=tab]')].find(b=>b.textContent==='Biblioteca').click());await page.waitForSelector('.MediaListView .MediaView.mediaContent-valid',{timeout:30000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.MediaView')].some(e=>e.textContent.includes('Video')),{timeout:30000});media=await page.$$eval('.MediaView',views=>views.filter(e=>e.textContent.includes('Video')).map(e=>({name:e.title,classes:e.className,text:e.textContent})));
 assert.ok(!media[0].name.includes('[0-3s]'),'whole video name, no hidden excerpt');if(label==='youtube'){if(process.env.EXTRACT_EXPECT_LONG){const time=media[0].text.match(/Audio(\d+):(\d\d)/);assert.ok(time&&Number(time[1])>=10&&Number(time[1])<=30,'complete long video');}else assert.match(media[0].text,/00:19/,'complete 19-second video');assert.match(media[0].classes,/selection-audioVideo/,'YouTube imports video with audio');}

 }
 assert.equal(browserDownloads,0,'no automatic copy in Downloads');assert.ok(!(await browser.pages()).some(p=>p.url().startsWith('https://tubdown.com/')||p.url().startsWith('https://snapinsta.ai/')),'own temporary service tab closes');
 const job=await frame.evaluate(async()=>{const id=Number(new URLSearchParams(location.search).get('editorTabId'));return (await chrome.runtime.sendMessage({type:'SW_WEB_STATUS',editorTabId:id})).data;});if(!expectedError)assert.equal(media.length,1,'one video, no duplicate import');
 let repeatEvidence;
 if(process.env.EXTRACT_REPEAT_NATIVE){
  const data=await page.evaluate(async()=>{const file=document.querySelector('.ProjectApp').project.mediaList.find(m=>m.original?.file?.type==='video/mp4').original.file;const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {name:file.name,base64:btoa(binary),bytes:bytes.length};});
  await page.$eval('.MediaListView input.filter',input=>{input.value='nothing-matches-this-filter';input.dispatchEvent(new Event('input',{bubbles:true}));});
  const repeated=await frame.evaluate(async({job,data})=>{
   const id=crypto.randomUUID(),send=async(type,extra={})=>{const response=await chrome.tabs.sendMessage(job.tabId,{type,transferId:id,expectedProjectId:job.project,projectBinding:job.binding,...extra});if(!response.success)throw new Error(response.error);return response.data;};
   await send('EXTRACT_IMPORT_BEGIN',{name:data.name});
   // The control video is small; split base64 at a multiple of 4 for valid chunks.
   let index=0;for(let i=0;i<data.base64.length;i+=262144)await send('EXTRACT_IMPORT_CHUNK',{index:index++,base64:data.base64.slice(i,i+262144)});
   const started=Date.now();let receipt=await send('EXTRACT_IMPORT_FINISH',{bytes:data.bytes});const ackMs=Date.now()-started;
   for(let n=0;n<150&&receipt.phase==='processing';n++){await new Promise(r=>setTimeout(r,400));receipt=await send('EXTRACT_IMPORT_STATUS');}
   const repeatedFinish=await send('EXTRACT_IMPORT_FINISH',{bytes:data.bytes});return {receipt,repeatedFinish,ackMs};
  },{job,data});
  assert.equal(repeated.receipt.phase,'done');assert.equal(repeated.repeatedFinish.phase,'done');assert.match(repeated.receipt.result.name,/\(2\)\.mp4$/);assert.ok(repeated.ackMs<5000,'FINISH is a short acknowledgement');
  assert.equal(await page.$$eval('.MediaListView .MediaView',e=>e.length),0);
  const nativeCount=await page.evaluate(()=>document.querySelector('.ProjectApp').project.mediaList.filter(m=>m.original?.file?.type==='video/mp4').length);assert.equal(nativeCount,2,'same-name file and retry of FINISH produce exactly two intentional imports');
  repeatEvidence=repeated;console.log('REPEATED IMPORT PASS',JSON.stringify(repeated));
 }
 writeFileSync(`../docs/evidence/extract-web-${label}.json`,JSON.stringify({url,job,savedProject:!!process.env.EXTRACT_SAVED_PROJECT,filteredLibrary:!!process.env.EXTRACT_FILTERED_LIBRARY,repeatedImport:repeatEvidence,workerRestartRecovery:!!process.env.EXTRACT_TEST_RECOVERY,media,feedback,inputs:1,buttons:1,browserDownloads,connection:'free website flow, no key, no native host, no localhost helper'},null,2));console.log('PASS',JSON.stringify(media));
}catch(e){for(const [i,p] of (await browser.pages()).entries()){if(p.url().includes('ssstwitter.com')||p.url().includes('snapinsta.ai')||p.url().includes('tubdown.com')){writeFileSync(`../docs/evidence/extract-site-debug-${i}.html`,await p.content());await p.screenshot({path:`../docs/evidence/extract-site-debug-${i}.png`});}}throw e;}finally{await browser.close();}
