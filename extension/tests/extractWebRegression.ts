import assert from 'node:assert/strict';
import {twitterVideo,websiteOrigins,websiteMediaUrl,downloadWebsite,youtubeQuality,resolveYoutube} from '../src/extract/websites';
const id='1790637656616943991',link='https://video.twimg.com/amplify_video/12345/vid/test.mp4';
assert.equal(twitterVideo({code:200,tweet:{id,media:{videos:[{url:link}]}}},id).url,link);
assert.throws(()=>twitterVideo({code:404},id));assert.throws(()=>twitterVideo({code:200,tweet:{id:'wrong',media:{videos:[{url:link}]}}},id));assert.throws(()=>twitterVideo({code:200,tweet:{id,media:{videos:[{url:link},{url:link}]}}},id));
for(const url of ['http://ssscdn.io/ssstwitter/12345/x','https://ssscdn.io.evil.test/ssstwitter/12345/x','https://user:pass@ssscdn.io/ssstwitter/12345/x','https://127.0.0.1/video.mp4','https://d.rapidcdn.app/other'])assert.throws(()=>websiteMediaUrl(url));
assert.deepEqual(websiteOrigins('https://x.com/i/status/1790637656616943991'),['https://api.fxtwitter.com/*','https://video.twimg.com/*']);assert.deepEqual(websiteOrigins('https://youtu.be/jNQXAC9IVRw'),['https://tubdown.com/*']);
const original=globalThis.fetch;try{globalThis.fetch=async(_url,init)=>{assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal(init?.headers,undefined);return new Response('<html>not video</html>',{headers:{'content-type':'text/html'}});};await assert.rejects(()=>downloadWebsite(link),/MP4/);
globalThis.fetch=async()=>new Response(new Uint8Array(120),{headers:{'content-type':'video/mp4'}});await assert.rejects(()=>downloadWebsite(link),/válido/);
globalThis.fetch=async()=>{const bytes=new Uint8Array(120);bytes.set([102,116,121,112],4);return new Response(bytes,{headers:{'content-type':'video/mp4'}});};assert.ok((await downloadWebsite(link)).base64);
globalThis.fetch=async()=>new Response('x',{headers:{'content-type':'video/mp4','content-length':String(21*1024*1024)}});await assert.rejects(()=>downloadWebsite(link),/20 MB/);
}finally{globalThis.fetch=original;}
console.log('Website extraction: observed forms, CDN allowlist, URL guards, no credentials, MP4 validation and size bounds passed.');
const yt='jNQXAC9IVRw',jobId='12345678-1234-1234-1234-123456789abc';
const info={id:yt,duration:19,video:[{quality:1080,format:'MP4',size:100},{quality:480,format:'MP4',size:201*1024*1024},{quality:360,format:'MP4',size:1000},{quality:240,format:'MP4',size:500}]};
assert.equal(youtubeQuality(info,yt),360);for(const duration of [601,1799,1800])assert.equal(youtubeQuality({...info,duration},yt),360);assert.equal(youtubeQuality({...info,duration:1800,video:[{quality:480,format:'MP4',size:180*1024*1024}]},yt),480);
for(const bad of [{...info,id:'wrong'},{...info,duration:1801},{...info,duration:NaN},{...info,video:[{quality:360,format:'WEBM'}]}])assert.throws(()=>youtubeQuality(bad,yt));
assert.throws(()=>websiteMediaUrl('https://tubdown.com/api/jobs/../../private/file'));
const oldChrome=(globalThis as any).chrome;let removed=0,step=0;const calls:any[]=[];
try{
 (globalThis as any).chrome={tabs:{create:async()=>({id:99}),get:async()=>({url:'https://tubdown.com/',status:'complete'}),remove:async(id:number)=>{assert.equal(id,99);removed++;}},scripting:{executeScript:async(message:any)=>{calls.push(message.args);return [{result:[{submitted:true},{duration:19,video:info.video},{selected:true},{ready:`https://tubdown.com/api/jobs/${jobId}/file`,name:'sample.mp4'}][step++]}];}}};
 const result=await resolveYoutube(`https://youtu.be/${yt}`);assert.equal(result.url,`https://tubdown.com/api/jobs/${jobId}/file`);assert.equal(calls[2][2],360);assert.equal(calls[2][3],true);assert.equal(removed,1,'temporary tab closes after success');
 (globalThis as any).chrome.scripting.executeScript=async()=>[{result:{blocked:true}}];await assert.rejects(()=>resolveYoutube(`https://youtu.be/${yt}`),/humana/);assert.equal(removed,2,'verification stops without solving and closes own tab');
 (globalThis as any).chrome.scripting.executeScript=async()=>[{result:{ready:'https://evil.test/video.mp4'}}];await assert.rejects(()=>resolveYoutube(`https://youtu.be/${yt}`),/autorizado/);assert.equal(removed,3,'invalid download closes own tab');
}finally{(globalThis as any).chrome=oldChrome;}
console.log('YouTube extraction: bounded quality, normal form flow, no keys, own-tab cleanup, verification stop and download allowlist passed.');
