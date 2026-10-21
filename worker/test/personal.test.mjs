import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {personal} from '../src/personal.js';import worker from '../src/index.js';
const id='12345678-1234-4123-8123-123456789abc', token='x'.repeat(32);
const note={schema:1,id,text:'Nota sintetica di prova',created_at:123,timezone:'Europe/Rome'};
const result={schema:1,note_id:id,summary:'Organizzata',operations:[{id:'a',type:'task',text:'Attività sintetica'}]};
const encoded=x=>Buffer.from(JSON.stringify(x)).toString('base64');
function setup(){const db=new DatabaseSync(':memory:');const sql=readFileSync(new URL('../migrations/0003_personal.sql',import.meta.url),'utf8');db.exec(sql);db.exec(sql);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args),run:async()=>db.prepare(sql).run(...args)});return {DB:{prepare:sql=>stmt(sql)},PERSONAL_REPO:'AlbertoRacerro/-Aurelius-Personal',PERSONAL_TOKEN:token,GITHUB_PERSONAL_TOKEN:'fake-secret'};}
function req(path,body,auth=token){return new Request('https://w.test/v1/personal/'+path,{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json'},body:JSON.stringify(body)});}
function fake({isPrivate=true,existing=null,invalidResult=false}={}){const calls=[];const fn=async(url,init)=>{calls.push({url,init});assert.equal(init.redirect,'error');if(!url.includes('/contents/'))return Response.json({private:isPrivate});if(url.includes('/outbox/'))return Response.json({content:encoded(invalidResult?{...result,operations:[{id:'a',type:'delete',text:'x'}]}:result)});if(url.includes('/inbox?'))return Response.json([]);if(init.method==='PUT')return Response.json({commit:{sha:'test'}});return existing?Response.json({content:encoded(existing)}):Response.json({},{status:404});};return {fn,calls};}
test('personal authorization and explicit configuration fail closed independently of push/editorial',async()=>{
 const env=setup(),f=fake();assert.equal((await personal(req('notes',note,'bad'),env,f.fn)).status,401);assert.equal(f.calls.length,0);
 assert.equal((await personal(req('notes',note),{...env,PERSONAL_REPO:'AlbertoRacerro/Aurelius'},f.fn)).status,503);assert.equal(f.calls.length,0);
 assert.equal((await personal(req('notes',note),{...env,PERSONAL_TOKEN:''},f.fn)).status,503);
 const route=await worker.fetch(req('notes',note),{});assert.equal(route.status,503);assert.equal(route.headers.get('cache-control'),'no-store');
});
test('refuses public repositories before any note read/write; errors never contain upstream payloads',async()=>{
 const env=setup(),f=fake({isPrivate:false});const r=await personal(req('notes',note),env,f.fn);assert.equal(r.status,503);assert.equal(f.calls.length,1);
 const failure=await personal(req('notes',note),env,async()=>{throw Error('fake-secret personal-text');});assert.equal(JSON.stringify(failure).includes('fake-secret'),false);
});
test('immutable private note upload, Unicode, repeat acknowledgement and collision detection',async()=>{
 const env=setup(),f=fake();const unicode={...note,text:'Nota di prova 日本語 è'};const r=await personal(req('notes',unicode),env,f.fn);assert.equal(r.status,200);
 const write=f.calls.find(x=>x.init.method==='PUT');const body=JSON.parse(write.init.body);assert.deepEqual(JSON.parse(Buffer.from(body.content,'base64')),unicode);assert.equal(body.message,'personal: receive note');assert.equal(write.url.includes('/-Aurelius-Personal/'),true);
 assert.equal((await personal(req('notes',note),env,fake({existing:note}).fn)).status,200);
 assert.equal((await personal(req('notes',note),env,fake({existing:{...note,text:'Altra'}}).fn)).status,409);
 assert.equal((await personal(req('notes',{...note,text:'x'.repeat(4001)}),env,f.fn)).status,400);
 assert.equal((await personal(req('notes',{...note,id:'../public'}),env,f.fn)).status,400);
});
test('polling rejects path injection, bounds work and quarantines invalid AI operations',async()=>{
 const env=setup();assert.equal((await personal(req('poll',{ids:['../public']}),env,fake().fn)).status,400);assert.equal((await personal(req('poll',{ids:Array(11).fill(id)}),env,fake().fn)).status,400);
 const r=await personal(req('poll',{ids:[id]}),env,fake().fn);assert.deepEqual(r.body.results,[result]);
 const invalid=await personal(req('poll',{ids:[id]}),env,fake({invalidResult:true}).fn);assert.deepEqual(invalid.body.results,[]);assert.deepEqual(invalid.body.errors,[id]);
 const pending=await personal(req('poll',{ids:[id]}),env,async url=>url.includes('/contents/')?Response.json({},{status:404}):Response.json({private:true}));assert.deepEqual(pending.body.results,[]);
});
test('bounded request body and rate limiting retain queued notes',async()=>{
 const env=setup(),f=fake();const large=new Request('https://w.test/v1/personal/notes',{method:'POST',headers:{authorization:'Bearer '+token},body:'x'.repeat(20000)});assert.equal((await personal(large,env,f.fn)).status,400);
 for(let i=0;i<30;i++)assert.equal((await personal(req('poll',{ids:[]}),env,f.fn)).status,200);
 assert.equal((await personal(req('poll',{ids:[]}),env,f.fn)).status,429);
});

test('operational diagnostics distinguish database, read and write failures without leaking upstream content',async()=>{
 const broken={...setup(),DB:{prepare(){throw Error('private SQL data fake-secret');}}};
 const db=await personal(req('notes',note),broken,fake().fn);assert.equal(db.body.code,'PERSONAL_DATABASE_UNAVAILABLE');
 const network=await personal(req('notes',note),setup(),async()=>{throw Error('private network URL fake-secret');});assert.equal(network.body.code,'PERSONAL_REPOSITORY_UNAVAILABLE');
 const response=async(failStage,status)=>personal(req('notes',note),setup(),async(url,init)=>{
  const stage=!url.includes('/contents/')?'repository':init.method==='PUT'?'write':url.includes('/inbox?')?'list':'read';
  if(stage===failStage)return new Response('private upstream data fake-secret',{status});
  if(stage==='repository')return Response.json({private:true});
  if(stage==='list')return Response.json([]);
  return Response.json({},{status:404});
 });
 for(const [stage,code,status] of [['repository','REPOSITORY',401],['read','NOTE_READ',403],['list','INBOX_LIST',500],['write','NOTE_WRITE',403]]){
  const r=await response(stage,status);assert.equal(r.body.code,`PERSONAL_${code}_${status}`);assert.equal(r.status,503);assert.equal(JSON.stringify(r).includes('fake-secret'),false);assert.equal(JSON.stringify(r).includes('private upstream data'),false);
 }
 const parse=await personal(req('notes',note),setup(),async()=>new Response('secret invalid JSON'));assert.equal(parse.body.code,'PERSONAL_REPOSITORY_UNAVAILABLE');assert.equal(JSON.stringify(parse).includes('secret invalid JSON'),false);
});
