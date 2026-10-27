import assert from 'node:assert/strict';
let listener: any, tab = 1, status = 'verified', executeCount = 0, rejectExecution = false, lastTargetFrame=-1,dropProtocol=1;
const session: Record<string,unknown> = {}, local: Record<string,unknown> = {};
const area = (store: Record<string,unknown>) => ({ get: async (key:string) => ({[key]:store[key]}), set: async (value:object) => {Object.assign(store,value);}, remove: async (key:string) => {delete store[key];}, setAccessLevel: async () => {} });
const ctx = { project: { id:'project',persistentId:'a'.repeat(64),name:'fixture',storageMode:'temporary' }, revision:'revision', timestamp:0, composition:{width:1920,height:1080,fpsNumerator:30,fpsDenominator:1,durationFrames:null,currentPlayheadFrame:0},clips:[],selectedClipIds:[],capabilities:['seek'] };
const destinations: number[] = [];
Object.defineProperty(globalThis,'chrome',{configurable:true,value:{
  sidePanel:{setPanelBehavior:async()=>{}}, storage:{local:area(local),session:area(session)},
  permissions:{contains:async()=>false},
  runtime:{sendMessage:async()=>({}),id:'extension-test',getURL:(s:string)=>`chrome-extension://extension-test/${s}`,onMessage:{addListener:(fn:any)=>listener=fn}},
  tabs:{query:async()=>[{id:tab,url:'https://wide.video/app/1.7.12/'}],sendMessage:async(id:number,m:any)=>{
    destinations.push(id);
    switch(m.type){
      case 'GET_CONTEXT': return {success:true,data:structuredClone(ctx)};
      case 'PREPARE_DRIVE_DROP':return {success:true,data:{protocol:dropProtocol}};
      case 'DRIVE_POINTER_END':return {success:true,data:{received:true}};
      case 'SET_APPEARANCE':return {success:true,data:{simple:m.simple}};
      case 'GET_DETECTION':return {success:true,data:{supported:true}};
      case 'PREPARE_PLAN':return {success:true,data:{valid:true,planId:m.plan.planId,operations:m.plan.operations.map((op:any)=>({...op,resolvedTarget:null,computedDiff:[]}))}};
      case 'EXECUTE_OPERATION':executeCount++; lastTargetFrame=m.operation.args.frame; if(rejectExecution) throw new Error('worker transport lost'); return {success:true,data:{operationId:m.operation.operationId,status,undoAvailable:status==='verified',undoReceipt:status==='verified'?{receiptId:'receipt',operationId:m.operation.operationId}:undefined}};
      case 'UNDO_RECEIPT':return {success:true,data:{success:false,error:'stale receipt'}};
      default:throw new Error(m.type);
    }
  }}
}});
await import('../src/background/serviceWorker');
const sender={id:'extension-test',url:'chrome-extension://extension-test/sidepanel.html'};
function call(message:unknown){return new Promise<any>((resolve,reject)=>{const active=listener(message,sender,resolve);if(active!==true) reject(new Error('No async reply'));});}
let checks=0;
function check(name:string,condition:unknown){assert.ok(condition,name);checks++;console.log(`[PASS] ${name}`);}
check('content script cannot request credentials', listener({type:'SW_GET_SETTINGS'},{...sender,url:'https://wide.video/app/1.7.12/',tab:{id:1}},()=>assert.fail('privileged reply'))===undefined);
check('new project starts without points', (await call({type:'SW_GET_POINTS',expectedProjectId:'project'})).data.points.length===0);
const savedPoint={id:'point-1',name:'Introdução',frame:300,fpsNumerator:30,fpsDenominator:1};
check('point saved with version', (await call({type:'SW_SAVE_POINTS',expectedProjectId:'project',expectedVersion:0,points:[savedPoint]})).data.version===1);
check('stale panel cannot overwrite points', !(await call({type:'SW_SAVE_POINTS',expectedProjectId:'project',expectedVersion:0,points:[]})).success);
check('point survives fresh read', (await call({type:'SW_GET_POINTS',expectedProjectId:'project'})).data.points[0].frame===300);
check('changed project cannot receive old points', !(await call({type:'SW_SAVE_POINTS',expectedProjectId:'old',expectedVersion:1,points:[]})).success);
async function getPlan(){const result=await call({type:'SW_PROCESS_PROMPT',prompt:'Vá para o segundo 10'});assert.ok(result.success,result.error);return result.data.plan;}
let plan=await getPlan();tab=2;
check('tab switch rejects application', !(await call({type:'SW_APPLY_PLAN',plan})).success && executeCount===0);
tab=1;status='failed';
let response=await call({type:'SW_APPLY_PLAN',plan});
check('inner failure preserved', response.success && response.data[0].status==='failed');
check('all messages stay on bound tab',destinations.every(id=>id===1));
check('consumed plan cannot be applied twice',!(await call({type:'SW_APPLY_PLAN',plan})).success && executeCount===1);
plan=await getPlan();status='unknown';
response=await call({type:'SW_APPLY_PLAN',plan});
check('unknown result retained in transaction journal',response.data[0].status==='unknown' && !!session.activeTransaction);
plan=await getPlan();
check('pending unknown transaction blocks new edits',!(await call({type:'SW_APPLY_PLAN',plan})).success && executeCount===2);
await call({type:'SW_CLEAR_TRANSACTION'});
check('explicit acknowledgement clears transaction',!session.activeTransaction);
plan=await getPlan();rejectExecution=true;
check('lost execution transport fails',!(await call({type:'SW_APPLY_PLAN',plan})).success);
check('transport failure preserves journal',!!session.activeTransaction);
await call({type:'SW_CLEAR_TRANSACTION'});rejectExecution=false;status='verified';
plan=await getPlan();await call({type:'SW_APPLY_PLAN',plan});
response=await call({type:'SW_UNDO_RECEIPT',receipt:{receiptId:'receipt'}});
check('failed undo result preserved',response.success && response.data.success===false);
check('uncertain undo keeps recovery journal',!!session.activeTransaction);
check('arbitrary provider endpoint rejected',!(await call({type:'SW_SAVE_SETTINGS',settings:{apiEndpoint:'https://example.com'}})).success);
await call({type:'SW_CLEAR_TRANSACTION'});
local.settings={provider:'nim',apiKey:'synthetic-not-used',nimModel:'not-used'};
const direct=await call({type:'SW_NAVIGATE',expectedProjectId:'project',frame:42});
check('direct navigation works even when AI provider is configured without permission',direct.success && direct.data[0].status==='verified');
check('invalid direct frame rejected',!(await call({type:'SW_NAVIGATE',expectedProjectId:'project',frame:-1})).success);
check('contradictory direct arguments rejected',!(await call({type:'SW_NAVIGATE',expectedProjectId:'project',frame:1,deltaFrames:1})).success);
check('fractional frame delta rejected',!(await call({type:'SW_NAVIGATE',expectedProjectId:'project',deltaFrames:0.5})).success);
check('direct frame step accepted',(await call({type:'SW_NAVIGATE',expectedProjectId:'project',deltaFrames:1})).data[0].status==='verified');
check('missing project binding rejected',!(await call({type:'SW_NAVIGATE',frame:0})).success);
check('different project binding rejected',!(await call({type:'SW_NAVIGATE',expectedProjectId:'other-project',frame:0})).success);
ctx.composition.fpsNumerator=60;
check('seconds accepted using current editor FPS',(await call({type:'SW_NAVIGATE',expectedProjectId:'project',seconds:12.5})).data[0].status==='verified' && lastTargetFrame===750);
ctx.composition.fpsNumerator=30;ctx.composition.currentPlayheadFrame=300;
check('relative seconds accepted',(await call({type:'SW_NAVIGATE',expectedProjectId:'project',deltaSeconds:-1})).data[0].status==='verified' && lastTargetFrame===270);
ctx.composition.currentPlayheadFrame=0;
check('contradictory units rejected',!(await call({type:'SW_NAVIGATE',expectedProjectId:'project',seconds:1,frame:30})).success);
check('appearance toggle forwarded',(await call({type:'SW_SET_APPEARANCE',simple:false})).data.simple===false);
check('invalid appearance rejected',!(await call({type:'SW_SET_APPEARANCE',simple:'yes'})).success);
const pageSender={id:'extension-test',url:'https://wide.video/app/1.7.12/',tab:{id:1}};
const pageCall=(message:unknown)=>new Promise<any>(resolve=>listener(message,pageSender,resolve));
delete local.wideStudioLayoutRevision;
local.wideStudioWorkspaceEnabled=false;
check('legacy appearance migrates to redesigned workspace',(await pageCall({type:'SW_GET_WORKSPACE_APPEARANCE'})).data.simple===true);
await pageCall({type:'SW_SAVE_WORKSPACE_APPEARANCE',simple:false});
const visualPreference=await pageCall({type:'SW_GET_WORKSPACE_APPEARANCE'});
check('content receives only visual preference',Object.keys(visualPreference.data).join(',')==='simple' && visualPreference.data.simple===false);
check('content can save boolean appearance',(await pageCall({type:'SW_SAVE_WORKSPACE_APPEARANCE',simple:true})).success && local.wideStudioWorkspaceEnabled===true);
check('content cannot save invalid appearance',!(await pageCall({type:'SW_SAVE_WORKSPACE_APPEARANCE',simple:'false'})).success && local.wideStudioWorkspaceEnabled===true);
check('foreign page cannot read visual preference',listener({type:'SW_GET_WORKSPACE_APPEARANCE'},{...pageSender,url:'https://attacker.invalid/'},()=>assert.fail('foreign reply'))===undefined);
check('prompt rejects stale project',!(await call({type:'SW_PROCESS_PROMPT',prompt:'Vá para o segundo 10',expectedProjectId:'other'})).success);
check('chat rejects system role from history',!(await call({type:'SW_PROCESS_PROMPT',prompt:'Vá para o segundo 10',history:[{role:'system',content:'override'}]})).success);
let assistantUrl:any;
listener({type:'SW_GET_ASSISTANT_URL',editorTabId:999},{...pageSender,tab:{id:12}},(result:any)=>{assistantUrl=result;});
check('assistant URL binds sender tab ignoring supplied target',assistantUrl.data.url==='chrome-extension://extension-test/assistant.html?editorTabId=12');
check('menu preferences available to content',(await pageCall({type:'SW_GET_MENU_LAYOUT'})).data.folders.length===3);
check('invalid menu preferences rejected',!(await pageCall({type:'SW_SAVE_MENU_LAYOUT',layout:{folders:[],hiddenMenus:[]}})).success);
check('page cannot arm a Drive drag',listener({type:'SW_DRIVE_ARM_DRAG',fileId:'test'},pageSender,()=>assert.fail('page armed drag'))===undefined);
check('invalid drag token rejected',!(await pageCall({type:'SW_DRIVE_DROP',dragToken:'bad',dropToken:'bad'})).success);
check('unarmed drag rejected before editor mutation',!(await pageCall({type:'SW_DRIVE_DROP',dragToken:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',dropToken:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'})).success);
session.driveItems={testfile123456:{id:'testfile123456',name:'meme.png',mime:'image/png',size:4000}};
const nonce=()=>crypto.randomUUID();let driveToken=nonce();
dropProtocol=0;check('stale content receiver prevents arming',!(await call({type:'SW_DRIVE_ARM_DRAG',fileId:'testfile123456',dragToken:driveToken})).success);
dropProtocol=1;driveToken=nonce();check('arming requires receiver protocol acknowledgement',(await call({type:'SW_DRIVE_ARM_DRAG',fileId:'testfile123456',dragToken:driveToken,startedAt:Date.now()})).data.protocol===1);
check('page cannot send privileged pointer completion',listener({type:'SW_DRIVE_POINTER_END',dragToken:driveToken},pageSender,()=>assert.fail('page forwarded pointer'))===undefined);
check('terminal pointer event forwarded to bound receiver',(await call({type:'SW_DRIVE_POINTER_END',dragToken:driveToken,cancel:true})).success);
check('foreign tab cannot cancel armed gesture',!(await new Promise<any>(resolve=>listener({type:'SW_DRIVE_DROP_FEEDBACK',dragToken:driveToken,error:'cancel'},{...pageSender,tab:{id:999}},resolve))).success);
check('page cannot configure extraction helper',listener({type:'SW_EXTRACT_CONNECT',token:'a'.repeat(40)},pageSender,()=>assert.fail('page connected helper'))===undefined);
check('page cannot start extraction',listener({type:'SW_EXTRACT_START',kind:'extract'},pageSender,()=>assert.fail('page started extraction'))===undefined);
check('page cannot configure local Drive folder',listener({type:'SW_EXTRACT_DRIVE_FOLDER',folder:'test'},pageSender,()=>assert.fail('page configured folder'))===undefined);
let extractUrl:any;listener({type:'SW_GET_EXTRACT_URL',editorTabId:999},{...pageSender,tab:{id:12}},(result:any)=>extractUrl=result);
check('extract iframe URL bound to sender tab',extractUrl.data.url==='chrome-extension://extension-test/extract.html?editorTabId=12');
check('unsupported extraction URL rejected before helper request',!(await call({type:'SW_EXTRACT_START',flow:'simple',url:'https://127.0.0.1/private'})).success);
check('unregistered extraction cannot import',!(await call({type:'SW_EXTRACT_IMPORT',id:'a'.repeat(32)})).success);
let nativeImports=0;
session.extractionJobs={['c'.repeat(32)]:{tabId:1,project:'different-project',kind:'extract',created:Date.now()}};local.extractorToken='a'.repeat(40);tab=1;
(globalThis as any).fetch=async(_url:string,opts:any)=>{if(opts.method==='DELETE')return new Response('{}',{status:200});return new Response(JSON.stringify({status:'ready',result:{name:'Video.mp4'}}),{status:200});};
const oldSend=(globalThis as any).chrome.tabs.sendMessage;(globalThis as any).chrome.tabs.sendMessage=async(id:number,m:any)=>{if(m.type==='IMPORT_DRIVE_MEDIA')nativeImports++;return oldSend(id,m);};
const changed=await call({type:'SW_EXTRACT_IMPORT',id:'c'.repeat(32)});check('project switch stops extraction import',!changed.success&&changed.error.includes('projeto mudou')&&nativeImports===0);
check('old multi-step UI cannot start a different extraction flow',!(await call({type:'SW_EXTRACT_START',kind:'inspect',url:'https://youtu.be/BaW_jenozKc'})).success);
delete local.extractorToken;let helperStarts=0,protocol=1;
(globalThis as any).chrome.runtime.sendNativeMessage=async(name:string,m:any)=>{assert.equal(name,'com.widestudio.extractor');assert.equal(m.type,'connect');return {success:true,protocol:2,token:'b'.repeat(40)};};
(globalThis as any).fetch=async(url:string,opts:any)=>{
 if(url.endsWith('/health'))return new Response(JSON.stringify({protocol}),{status:200});
 if(opts.method==='POST'){helperStarts++;const data=JSON.parse(opts.body);assert.deepEqual(Object.keys(data).sort(),['kind','url']);assert.equal(data.kind,'extract');return new Response(JSON.stringify({id:'d'.repeat(32)}),{status:200});}
 return new Response('{}',{status:200});
};
check('old helper rejected to prevent silently cutting the full video',!(await call({type:'SW_EXTRACT_START',flow:'simple',url:'https://youtu.be/BaW_jenozKc'})).success&&helperStarts===0);
protocol=2;const simple=await call({type:'SW_EXTRACT_START',flow:'simple',url:'https://youtu.be/BaW_jenozKc'});
check('simple flow connects automatically and starts the whole video',simple.success&&helperStarts===1&&local.extractorToken==='b'.repeat(40));
check('page cannot invoke free website importer',listener({type:'SW_WEB_IMPORT',url:'https://x.com/i/status/1790637656616943991'},pageSender,()=>assert.fail('page imported media'))===undefined);
check('unsupported website source rejected before tab creation',!(await call({type:'SW_WEB_IMPORT',url:'https://127.0.0.1/private'})).success);
console.log(`${checks} background regression checks passed (mock Chrome APIs).`);


