import test from 'node:test';import assert from 'node:assert/strict';
import {emptyState} from '../../src/model.js';import {makeSnapshot,uploadSnapshot,syncMeta} from '../../src/private-sync.js';import {digest,planningContext,eligibleSuggestion,validateSuggestions} from '../../src/private-sync-contract.js';
const now=Date.parse('2026-10-22T12:00:00+02:00');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
test('private copy retains memories but excludes credentials; planner excludes relationship and health preferences',async()=>{
 const s=emptyState(),store=storage();s.settings.push={token:'DO-NOT-UPLOAD',endpoint:'https://private'};s.settings.ntfyTopic='PRIVATE_CHANNEL';s.backlog=[{id:'t',text:'Sintetico',done:false,due:'2026-10-23'}];
 store.setItem('aurelius.relationship.local.v1',JSON.stringify({consent:true,lastStart:'2026-10-01'}));store.setItem('aurelius.editorial.auth.v1','SECRET');
 const x=await makeSnapshot(s,store,now),raw=JSON.stringify(x);assert.doesNotMatch(raw,/DO-NOT-UPLOAD|PRIVATE_CHANNEL|SECRET/);assert.equal(x.snapshot.preferences['aurelius.relationship.local.v1'],undefined);assert.doesNotMatch(JSON.stringify(planningContext(x.snapshot.state,now)),/lastStart|relationship/);
 assert.equal(x.context_hash,await digest(planningContext(x.snapshot.state,now)));assert.equal(x.snapshot.client_id,syncMeta(store).client_id);
});
test('copy confirmation never overwrites state; network failure leaves acknowledgement unchanged and retry possible',async()=>{
 const s=emptyState(),store=storage();store.setItem('aurelius.personal.auth.v1','x'.repeat(32));let body;
 const fetchImpl=async(url,init)=>{body=JSON.parse(init.body);return Response.json({received:true,revision:body.snapshot.revision,context_hash:body.context_hash});};
 const before=JSON.stringify(s);await uploadSnapshot(s,store,'https://worker.test',{now,fetchImpl});assert.equal(JSON.stringify(s),before);assert.equal(syncMeta(store).synced_at,now);assert.equal(body.device_token,'');
 s.backlog.push({id:'new',text:'new'});await assert.rejects(uploadSnapshot(s,store,'https://worker.test',{now:now+1000,fetchImpl:async()=>Response.json({error:'unavailable'},{status:503})}));assert.equal(syncMeta(store).synced_at,now);
});
test('AI proposals require real open references, quiet hours, finite validity and a free moment',()=>{
 const s=emptyState();s.template=Object.fromEntries(Array.from({length:7},(_,i)=>[i,[]]));s.backlog=[{id:'t',text:'Synthetic',done:false}];const context=planningContext(s,now);
 const r={id:'one',at:now+3600000,expires_at:now+3600000+60000,title:'Synthetic',body:'Synthetic',ref_type:'task',ref_id:'t'};
 assert.equal(eligibleSuggestion(r,context,now),true);assert.equal(eligibleSuggestion({...r,ref_id:'invented'},context,now),false);assert.equal(eligibleSuggestion(r,{...context,tasks:[]},now),false);
 context.blocks=[{id:'b',act:'atp',start:r.at-1000,end:r.at+1000}];assert.equal(eligibleSuggestion(r,context,now),false);
 const doc={schema:1,generated_at:now,clients:[{client_id:crypto.randomUUID(),context_hash:'a'.repeat(64),reminders:[r]}]};validateSuggestions(doc,now);
 assert.throws(()=>validateSuggestions({...doc,clients:[{...doc.clients[0],reminders:[{...r,at:Date.parse('2026-10-22T23:00:00+02:00')}]}]},now));
});
