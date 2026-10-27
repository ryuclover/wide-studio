import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='docs/mapping/raw';await mkdir(out,{recursive:true});
const urls=['https://wide.video/app/1.7.12/','https://wide.video/app/1.7.12/studio.js','https://wide.video/app/1.7.12/studio.css','https://api.github.com/users/wide-video/repos?per_page=100','https://wide.video/app/1.7.12/docs/llms.txt'];
const manifest=[];
for(const [i,url] of urls.entries()){
 const r=await fetch(url,{headers:{'User-Agent':'Wide-Studio-ReadOnly-Audit'}});if(!r.ok)throw Error(`${r.status} ${url}`);
 const data=Buffer.from(await r.arrayBuffer()),file=['editor.html','studio.js','studio.css','github-repositories.json','llms.txt'][i];await writeFile(`${out}/${file}`,data);manifest.push({url,file,status:r.status,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),contentType:r.headers.get('content-type')});
}
await writeFile('docs/mapping/public-assets.json',JSON.stringify({capturedAt:new Date().toISOString(),assets:manifest},null,2));console.log(JSON.stringify(manifest,null,2));
