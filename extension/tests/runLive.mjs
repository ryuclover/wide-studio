import {spawn} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const version=process.env.WIDE_TEST_VERSION||'1.8.0';
const external=process.argv.includes('--external');
if(!existsSync('dist/manifest.json'))throw Error('Run npm run build first.');
mkdirSync('../docs/evidence',{recursive:true});
mkdirSync('../.local/validation',{recursive:true});
const checks=external?[
 ['extract-x','extractLive',{EXTRACT_TEST_URL:'https://x.com/i/status/1790637656616943991'}],
 ['extract-instagram','extractLive',{EXTRACT_TEST_URL:'https://www.instagram.com/p/aye83DjauH/'}],
 ['extract-youtube-long','extractLive',{EXTRACT_TEST_URL:'https://www.youtube.com/watch?v=KjBJjVghsmM',EXTRACT_EXPECT_LONG:'1',EXTRACT_SAVED_PROJECT:'1',EXTRACT_FILTERED_LIBRARY:'1',EXTRACT_TEST_RECOVERY:'1'}]
]:['fontFavoritesLive','textEditorLatencyLive','textEditorLive','multiClipLive','directTextLive','shortcutsLive','selectionLive','gapSelectionLive','linkedClipsContextLive','historyLive','mergeClipsLive','portugueseLive','unifiedMenusLive','languageHoverLive','drivePointerLive','testSilenceAndCaptionsLive'].map(name=>[name,name,{}]);
const results=[];
for(const [name,script,env]of checks){
 cpSync('dist','.browser/drive-test',{recursive:true});
 const started=Date.now();let log='';
 console.log(`Running ${name} on Wide ${version}`);
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[`tests/${script}.mjs`],{env:{...process.env,WIDE_TEST_VERSION:version,...env},stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log+=chunk;process.stdout.write(chunk);});
  child.on('error',reject);child.on('close',resolve);
 });
 writeFileSync(resolve('../.local/validation',`${name}.log`),log);
 results.push({name,version,passed:code===0,elapsedMs:Date.now()-started});
 writeFileSync(`../.local/validation/${external?'external':'editor'}-${version}.json`,JSON.stringify({date:new Date().toISOString(),results},null,2));
 if(code!==0){process.exitCode=1;break;}
}
console.log(`${results.filter(result=>result.passed).length}/${results.length} checks passed`);
