import {puppeteer} from '../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const browser=await puppeteer.launch({executablePath:resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe'),headless:true,pipe:true,enableExtensions:true,args:['--no-first-run']});
try{
 await browser.installExtension(resolve('.browser/drive-test'));
 const page=await browser.newPage();await page.goto(`https://wide.video/app/${process.env.WIDE_TEST_VERSION||'1.8.0'}/`);
 await page.waitForSelector('.Intro button.openProjectOPFS');await page.click('.Intro button.openProjectOPFS');
 const action=async id=>{await page.waitForSelector(`[data-native-action="${id}"]`);await page.$eval(`[data-native-action="${id}"]`,button=>button.click());};
 await action('addText');await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===1);
 await page.evaluate(async()=>{
  const node=document.querySelector('.TimelineClipContainer');node.onClick(new MouseEvent('click'));
  const time=node.timing.presentation;await api.run('operation-project-activity-seek',time.start+time.span/2);
 });
 await action('split');await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===2);
 await page.evaluate(()=>document.querySelector('.TimelineClipContainer').onClick(new MouseEvent('click')));
 await action('rippleDelete');await page.waitForFunction(()=>document.querySelectorAll('.TimelineClipContainer').length===1);
 assert.equal(await page.$('dialog[open] .ConfirmView'),null,'clip deletion requires no confirmation');
 await action('exportVideo');await page.waitForSelector('dialog[open] .ExportForm');
 await page.$eval('dialog[open] .ExportForm',form=>form.closest('dialog').querySelector('button.close').click());
 await page.screenshot({path:'../docs/evidence/shortcuts-live.png'});
 console.log('PASS extension shortcuts: direct text, split, ripple delete without confirmation and native export dialog');
}finally{await browser.close();}
