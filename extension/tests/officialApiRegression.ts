import assert from 'node:assert/strict';
import {OfficialApiClient} from '../src/integrations/wide/officialApi';
import {nativeMediaPhase} from '../src/integrations/wide/media';
let owner={metadata:{version:1}};
const calls:string[]=[];let active=0;
const api={async run<T>(name:string):Promise<T>{
 assert.equal(active++,0,'host operations must never overlap');calls.push(name);
 await new Promise(resolve=>setTimeout(resolve,5));active--;
 if(name==='fail')throw Error('host failure');
 return {metadata:{version:owner.metadata.version},activity:{currentTime:0}} as T;
}};
const client=new OfficialApiClient(()=>api,()=>owner);
await Promise.all([client.project(),client.project()]);
assert.deepEqual(calls,['operation-project-get'],'concurrent project reads coalesce');
await client.project();assert.equal(calls.length,1,'unchanged project is cached');
await Promise.allSettled([client.run('fail'),client.run('after-failure')]);
assert.deepEqual(calls.slice(1),['fail','after-failure'],'failure does not retry or block the queue');
await client.project();assert.equal(calls.at(-1),'operation-project-get','mutation invalidates cache');
const old=owner;const busy=client.run('first');const stale=client.run('stale',undefined,old);
await busy;owner={metadata:{version:2}};
await assert.rejects(stale,/PROJECT_CHANGED/);
assert.ok(!calls.includes('stale'),'stale queued actions cannot reach the host');
assert.equal(nativeMediaPhase({content:{kind:'valid'}}),'valid');
assert.equal(nativeMediaPhase({kind:'valid'}),'valid');
console.log('Official API: serialization, read coalescing, cache invalidation, failure recovery, stale project rejection and both media models passed.');

await assert.rejects(client.run("guarded-write",undefined,owner,()=>{throw Error("STALE_TEXT");}),/STALE_TEXT/);assert.ok(!calls.includes("guarded-write"),"queued preflight failure never reaches the host");
