import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../../src/model.js';
import {addNote,applyResult,undoResult,pollIds,PERSONAL_AUTH,personalRequest} from '../../src/inbox.js';
import {validateNote,validateResult} from '../../src/inbox-contract.js';
import {exportBackup,importBackup,sane} from '../../src/store.js';
import {reminderItems} from '../../src/reminders.js';
const id='12345678-1234-4123-8123-123456789abc';
const note=()=>addNote(emptyState(),'Compra oggetto di prova; aggiungi Serie Esempio alle serie',123,id);
const result=(operations)=>({schema:1,note_id:id,summary:'Nota organizzata',operations});
const ops=[{id:'a',type:'task',text:'Compra oggetto di prova'},{id:'b',type:'list',list:'Serie',text:'Serie Esempio'},{id:'c',type:'idea',text:'Prova un nuovo hobby'}];
test('strict note/result allowlist rejects arbitrary state, code, malformed dates and operations',()=>{
 const s=note();assert.equal(s.personalInbox.notes[0].status,'queued');
 assert.throws(()=>addNote(s,' '));assert.throws(()=>addNote(s,'x'.repeat(4001)));
 const n=s.personalInbox.notes[0].note;assert.throws(()=>validateNote({...n,settings:{}}));assert.throws(()=>validateNote({...n,id:'../public'}));
 for(const op of [{id:'a',type:'delete',text:'x'},{id:'a',type:'task',text:'x',due:'2026-02-31'},{id:'a',type:'task',text:'x',priority:'P0'},{id:'a',type:'task',text:'x',remind_at:Infinity}])assert.throws(()=>validateResult(result([op]),id));
 assert.throws(()=>validateResult(result([ops[0],ops[0]]),id));assert.throws(()=>validateResult({...result(ops),note_id:crypto.randomUUID()},id));
});
test('atomic add-only apply is idempotent, does not overwrite completed duplicates or private calendar',()=>{
 const s=note();s.backlog.push({id:'manual',text:ops[0].text,done:true,priority:'P0',act:'vita',at:1});
 const before=structuredClone(s), r=applyResult(s,result(ops),1000);
 assert.deepEqual(s,before);assert.equal(r.backlog.length,1);assert.equal(r.backlog[0].done,true);assert.equal(r.personalInbox.items.length,2);
 assert.equal(r.personalInbox.receipts[0].skipped,1);assert.deepEqual(r.template,before.template);assert.deepEqual(r.settings,before.settings);assert.deepEqual(r.entries,[]);
 assert.deepEqual(applyResult(r,result(ops)),r);assert.throws(()=>applyResult(emptyState(),result(ops)));
 const invalid=[ops[0],{id:'z',type:'replace',text:'x'}];assert.throws(()=>applyResult(s,result(invalid)));assert.deepEqual(s,before);
});
test('undo removes only unchanged additions; local changes and completion survive; no replay after undo',()=>{
 const r=applyResult(note(),result(ops),1234);r.backlog[0].done=true;
 const {state,kept}=undoResult(r,id);assert.equal(kept,1);assert.equal(state.backlog[0].done,true);assert.equal(state.personalInbox.items.length,0);
 assert.deepEqual(applyResult(state,result(ops)),state);assert.deepEqual(undoResult(state,id).state,state);
});
test('poll rotates pending notes, backup round trip preserves notes and never exports authentication',()=>{
 let s=note();s=addNote(s,'Seconda nota',124,'12345678-1234-4123-8123-123456789abd');s.personalInbox.notes.forEach(x=>x.status='sent');s.personalInbox.notes[0].checkedAt=999;
 assert.equal(pollIds(s,1)[0],s.personalInbox.notes[1].note.id);
 const fakeSecret='secret-must-not-appear';const storage={getItem:k=>k===PERSONAL_AUTH?fakeSecret:null};
 const b=exportBackup(s,storage);assert.equal(b.includes(fakeSecret),false);assert.equal(sane(s),true);assert.deepEqual(importBackup(b,emptyState()).personalInbox,s.personalInbox);
 assert.equal(sane({...s,personalInbox:{notes:'wrong'}}),false);
});
test('only explicit reminder instants are scheduled and distinct operations have distinct bounded IDs',()=>{
 const now=Date.parse('2026-10-21T12:00:00+02:00');const s=applyResult(note(),result([{id:'one',type:'task',text:'Una',due:'2026-10-22',remind_at:now+3600000},{id:'two',type:'task',text:'Due',remind_at:now+3600000},{id:'three',type:'task',text:'Senza orario',due:'2026-10-22'}]));
 const items=reminderItems(s,now,'https://app.test/').filter(x=>x.id.startsWith('n_'));assert.equal(items.length,2);assert.notEqual(items[0].id,items[1].id);assert.ok(items.every(x=>x.id.length<=64));
 s.backlog[0].done=true;assert.equal(reminderItems(s,now,'https://app.test/').filter(x=>x.id.startsWith('n_')).length,1);
});
test('request sends only explicit data, uses auth and preserves errors without silent success',async()=>{
 const n=note().personalInbox.notes[0].note;let sent;
 await personalRequest('https://w.test','x'.repeat(32),'/v1/personal/notes',n,async(url,init)=>{sent=init;return Response.json({received:true,id});});
 assert.deepEqual(JSON.parse(sent.body),n);assert.equal(sent.headers.authorization,'Bearer '+'x'.repeat(32));assert.equal(sent.redirect,'error');
 await assert.rejects(()=>personalRequest('https://w.test','x'.repeat(32),'/v1/personal/notes',n,async()=>Response.json({error:'Configurazione mancante'},{status:503})),/Configurazione mancante/);
});
