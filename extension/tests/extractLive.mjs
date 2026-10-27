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
 const page=await browser.newPage();await page.goto('https://wide.video/app/1.7.12/');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Open Temporary Project')));await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Open Temporary Project')).click());
 await page.waitForSelector('.ws-extract-panel');await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Extrair').click());const frame=await page.waitForFrame(f=>f.url().includes('extract.html'));await frame.waitForSelector('#extract-link');
 assert.equal(await frame.$$eval('input',e=>e.length),1);assert.equal(await frame.$$eval('button',e=>e.length),1);assert.equal(await frame.$$eval('select,details,input[type=password],input[type=checkbox]',e=>e.length),0);
 await frame.type('#extract-link',url);await frame.click('button');
 for(let n=0;n<115;n++){await sleep(3000);const text=await frame.$eval('.extract-feedback',e=>e.textContent);if(n%5===0){console.log('STAGE',text);for(const site of await browser.pages())if(site.url().startsWith('https://tubdown.com/'))console.log('PROVIDER',await site.evaluate(()=>({duration:document.querySelector('#r-duration')?.textContent,rows:document.querySelectorAll('#r-list-video > div').length,progress:document.querySelector('#r-job-status')?.textContent,error:document.querySelector('#r-job-error')?.textContent})));}if(await frame.$('[role=alert]')){if(expectedError)break;throw new Error(text);}if(text.includes('adicionado à Biblioteca.'))break;}
 const feedback=await frame.$eval('.extract-feedback',e=>e.textContent);let media=[];
 if(expectedError){assert.ok(feedback.includes(expectedError));assert.equal(await page.$$eval('.MediaView.mediaContent-valid',e=>e.length),0);await page.screenshot({path:`../docs/evidence/extract-web-${label}.png`});}
 else{
 assert.match(feedback,/adicionado à Biblioteca/);await page.screenshot({path:`../docs/evidence/extract-web-${label}.png`});
 await page.evaluate(()=>[...document.querySelectorAll('.MediaPanel [role=tab]')].find(b=>b.textContent==='Biblioteca').click());await page.waitForSelector('.MediaListView .MediaView.mediaContent-valid',{timeout:30000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.MediaView')].some(e=>e.textContent.includes('Video')),{timeout:30000});media=await page.$$eval('.MediaView',views=>views.map(e=>({name:e.title,classes:e.className,text:e.textContent})));
 assert.ok(!media[0].name.includes('[0-3s]'),'whole video name, no hidden excerpt');if(label==='youtube'){if(process.env.EXTRACT_EXPECT_LONG){const time=media[0].text.match(/Audio(\d+):(\d\d)/);assert.ok(time&&Number(time[1])>=10&&Number(time[1])<=30,'complete long video');}else assert.match(media[0].text,/00:19/,'complete 19-second video');assert.match(media[0].classes,/selection-audioVideo/,'YouTube imports video with audio');}

 }
 assert.equal(browserDownloads,0,'no automatic copy in Downloads');assert.ok(!(await browser.pages()).some(p=>p.url().startsWith('https://tubdown.com/')||p.url().startsWith('https://snapinsta.ai/')),'own temporary service tab closes');
 writeFileSync(`../docs/evidence/extract-web-${label}.json`,JSON.stringify({media,feedback,inputs:1,buttons:1,browserDownloads,connection:'free website flow, no key, no native host, no localhost helper'},null,2));console.log('PASS',JSON.stringify(media));
}catch(e){for(const [i,p] of (await browser.pages()).entries()){if(p.url().includes('ssstwitter.com')||p.url().includes('snapinsta.ai')||p.url().includes('tubdown.com')){writeFileSync(`../docs/evidence/extract-site-debug-${i}.html`,await p.content());await p.screenshot({path:`../docs/evidence/extract-site-debug-${i}.png`});}}throw e;}finally{await browser.close();}
