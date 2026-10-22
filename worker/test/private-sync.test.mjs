import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';
import {snapshotRequest,pausePrivate,refreshSuggestions,suggestionStillValid} from '../src/private-sync.js';import {makeSnapshot} from '../../src/private-sync.js';import {emptyState} from '../../src/model.js';import {b64uEncode} from '../src/webpush.js';
const now=Date.parse('2026-10-22T12:00:00+02:00'),token='x'.repeat(32),pushToken='synthetic-push-token-1234567890';
function setup(){const db=new DatabaseSync(':memory:');for(const file of ['schema.sql','migrations/0003_personal.sql','migrations/0004_private_sync.sql']){const sql=readFileSync(new URL('../'+file,import.meta.url),'utf8');db.exec(sql);db.exec(sql);}
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args),run:async()=>db.prepare(sql).run(...args),all:async()=>({results:db.prepare(sql).all(...args)})});
 return {db,env:{PERSONAL_REPO:'AlbertoRacerro/-Aurelius-Personal',PERSONAL_TOKEN:token,GITHUB_PERSONAL_TOKEN:'never-log-this',APP_URL:'https://example.test/',ALLOWED_ORIGIN:'https://example.test',DB:{prepare:sql=>stmt(sql),batch:async ss=>{db.exec('BEGIN');try{const result=[];for(const s of ss)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}}};}
function github(){const files=new Map(),calls=[];let privateRepo=true;return {files,calls,setPublic:()=>privateRepo=false,fetch:async(url,init)=>{calls.push(url);assert.equal(init.redirect,'manual');if(!url.includes('/contents/'))return Response.json({private:privateRepo});const path=url.split('/contents/')[1].split('?')[0];if(init.method==='PUT'){const body=JSON.parse(init.body),prior=files.get(path);if(prior&&body.sha!==prior.sha)return Response.json({},{status:409});files.set(path,{content:body.content,sha:String(calls.length)});return Response.json({content:{sha:String(calls.length)}});}return files.has(path)?Response.json(files.get(path)):Response.json({},{status:404});}};}
function store(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}
const req=body=>new Request('https://worker.test/v1/personal/snapshot',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify(body)});
async function bodyAt(s,storage,time){s.settings.push={token:pushToken};return {...await makeSnapshot(s,storage,time),device_token:pushToken};}
async function device(db){const hash=b64uEncode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pushToken))));db.prepare("INSERT INTO devices(id,token_hash,endpoint,p256dh,auth,created,seen) VALUES ('dev',?,'synthetic','p','a',0,0)").run(hash);}
test('snapshot uses private-only CAS, no credentials persisted, stale requests rejected and explicit device proof required',async()=>{
 const {env,db}=setup(),gh=github(),s=emptyState(),storage=store();await device(db);s.settings.push={token:pushToken};const b=await bodyAt(s,storage,now);
 const r=await snapshotRequest(req(b),env,gh.fetch,now);assert.equal(r.status,200,JSON.stringify(r));const raw=JSON.stringify([...gh.files.values()]);assert.doesNotMatch(Buffer.from([...gh.files.values()][0].content,'base64').toString(),/device_token|synthetic-push-token/);
 assert.equal(db.prepare('SELECT device FROM private_clients').get().device,'dev');
 s.backlog.push({id:'a',text:'changed'});const newer=await bodyAt(s,storage,now+100);assert.equal((await snapshotRequest(req(newer),env,gh.fetch,now+100)).status,200);assert.equal((await snapshotRequest(req(b),env,gh.fetch,now+200)).status,409);
 const pub=github();pub.setPublic();assert.equal((await snapshotRequest(req(newer),env,pub.fetch,now+100)).status,503);assert.equal(pub.calls.length,1);
 assert.equal((await snapshotRequest(req({...newer,device_token:'invalid'}),env,gh.fetch,now+100)).status,401);assert.ok(raw);
});
test('nightly suggestions reach existing schedule once, survive regular syncs, and are invalidated by completed tasks, withdrawal and expiry',async()=>{
 const {env,db}=setup(),gh=github(),storage=store(),s=emptyState();await device(db);s.template=Object.fromEntries(Array.from({length:7},(_,i)=>[i,[]]));s.backlog=[{id:'t',text:'Synthetic',done:false}];
 const b=await bodyAt(s,storage,now);assert.equal((await snapshotRequest(req(b),env,gh.fetch,now)).status,200);
 const r={id:'unique',at:now+3600000,expires_at:now+3700000,title:'Synthetic',body:'Synthetic',ref_type:'task',ref_id:'t'},doc={schema:1,generated_at:now,clients:[{client_id:b.snapshot.client_id,context_hash:b.context_hash,reminders:[r]}]};
 gh.files.set('planning/reminders.json',{sha:'one',content:Buffer.from(JSON.stringify(doc)).toString('base64')});await refreshSuggestions(env,now,gh.fetch);
 const scheduled=db.prepare('SELECT * FROM reminders').get();assert.equal(scheduled.title,'Synthetic');const normal=await worker.fetch(new Request('https://w.test/v1/schedule',{method:'PUT',headers:{authorization:'Bearer '+pushToken},body:JSON.stringify({items:[],rev:now})}),env);assert.equal(normal.status,200);assert.equal(db.prepare('SELECT count(*) AS n FROM reminders').get().n,1);assert.equal(await suggestionStillValid(env,scheduled,r.at),true);
 await refreshSuggestions(env,now+300001,gh.fetch);assert.equal(db.prepare('SELECT count(*) AS n FROM reminders').get().n,1);
 s.backlog[0].done=true;await snapshotRequest(req(await bodyAt(s,storage,now+400000)),env,gh.fetch,now+400000);assert.equal(await suggestionStillValid(env,scheduled,r.at),false);
 assert.equal(await suggestionStillValid(env,scheduled,r.expires_at+1),false);
 doc.clients=[];gh.files.set('planning/reminders.json',{sha:'two',content:Buffer.from(JSON.stringify(doc)).toString('base64')});await refreshSuggestions(env,now+600002,gh.fetch);assert.equal(db.prepare('SELECT count(*) AS n FROM reminders').get().n,0);
});

test('suspending private copy invalidates previously prepared suggestions and older in-flight bindings',async()=>{
 const {env,db}=setup(),gh=github(),storage=store(),s=emptyState();await device(db);const b=await bodyAt(s,storage,now);await snapshotRequest(req(b),env,gh.fetch,now);
 const paused=await pausePrivate(new Request('https://w.test/v1/personal/pause',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({client_id:b.snapshot.client_id})}),env,now+1000);assert.equal(paused.status,200);assert.equal(db.prepare('SELECT device FROM private_clients').get().device,'');
 await snapshotRequest(req(b),env,gh.fetch,now+1001);assert.equal(db.prepare('SELECT device FROM private_clients').get().device,'');
});
