import fs from 'node:fs';import path from 'node:path';
const files=['PROXIMOS-PASSOS.md'];
const missing=[];let checked=0;for(const file of files){const text=fs.readFileSync(file,'utf8');for(const m of text.matchAll(/\]\(([^)]+)\)/g)){let ref=m[1];if(/^https?:|^#/.test(ref))continue;ref=ref.split('#')[0];if(!ref)continue;checked++;if(!fs.existsSync(path.resolve(path.dirname(file),decodeURIComponent(ref))))missing.push({file,ref});}}
const index=JSON.parse(fs.readFileSync('docs/mapping/bundle-index.json','utf8')),inventory=JSON.parse(fs.readFileSync('docs/mapping/inventory.json','utf8'));if(index.classes.length!==inventory.counts.classNodes)throw Error('Class count mismatch');
const split=JSON.parse(fs.readFileSync('docs/mapping/live-split.json','utf8')),undo=JSON.parse(fs.readFileSync('docs/mapping/live-undo.json','utf8'));if(split.clips.length!==2||split.time!==2||undo.clips!==1)throw Error('Evidence does not match documentation');
console.log({markdownFiles:files.length,localLinksChecked:checked,missing,verifiedEvidence:{splitClips:split.clips.length,undoClips:undo.clips}});if(missing.length)process.exitCode=1;
