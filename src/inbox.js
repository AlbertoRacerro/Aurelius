import {validateNote,validateResult} from './inbox-contract.js';
export const PERSONAL_AUTH='aurelius.personal.auth.v1';
export const freshInbox=()=>({notes:[],receipts:[],items:[]});
const key=s=>s.normalize('NFKC').trim().toLocaleLowerCase('it');
export function addNote(state,raw,now=Date.now(),id=crypto.randomUUID()) {
 const note=validateNote({schema:1,id,text:raw,created_at:now,timezone:'Europe/Rome'});
 const next=structuredClone(state);next.personalInbox ||=freshInbox();
 if(next.personalInbox.notes.length>=400)throw Error('Archivio locale pieno: esporta un backup prima di proseguire');
 next.personalInbox.notes.push({note,status:'queued'});return next;
}
export function applyResult(state,raw,now=Date.now()) {
 const result=validateResult(raw,raw?.note_id), next=structuredClone(state), box=next.personalInbox;
 const record=box?.notes.find(x=>x.note.id===result.note_id);
 if(!record)throw Error('Nota originale assente');
 if(box.receipts.some(x=>x.note_id===result.note_id))return next;
 const created=[];let skipped=0;
 for(const o of result.operations){
  const id=`inbox_${result.note_id}_${o.id}`;
  const collection=o.type==='task'?'backlog':'personalItems';
  const target=o.type==='task'?(next.backlog ||=[]):box.items;
  const duplicate=target.some(x=>x.id===id || (o.type==='task'?key(x.text)===key(o.text):(x.type===o.type&&key(x.text)===key(o.text)&&key(x.list||'')===key(o.list||''))));
  if(duplicate){skipped++;continue;}
  const item=o.type==='task'?{id,text:o.text,act:'vita',priority:'P3',due:o.due||'',done:false,at:now,sourceNote:result.note_id,...(o.remind_at?{remindAt:o.remind_at}:{})}:{...o,id,type:o.type,done:false,sourceNote:result.note_id};
  target.push(item);created.push({collection,id,snapshot:JSON.stringify(item)});
 }
 record.status='applied';record.result=result;delete record.error;
 box.receipts.push({note_id:result.note_id,at:now,summary:result.summary,created,skipped,undone:false});
 return next;
}
export function undoResult(state,noteId) {
 const next=structuredClone(state),box=next.personalInbox,receipt=box?.receipts.find(x=>x.note_id===noteId);
 if(!receipt||receipt.undone)return {state:next,kept:0};let kept=0;
 for(const c of receipt.created){const target=c.collection==='backlog'?next.backlog:box.items;const i=target.findIndex(x=>x.id===c.id);if(i<0)continue;if(JSON.stringify(target[i])!==c.snapshot){kept++;continue;}target.splice(i,1);}
 receipt.undone=true;return {state:next,kept};
}
export function pollIds(state,limit=10) {
 return (state.personalInbox?.notes||[]).filter(x=>x.status==='sent').sort((a,b)=>(a.checkedAt||0)-(b.checkedAt||0)).slice(0,limit).map(x=>x.note.id);
}
// No credentials, calendar, health, relationship, backups, or unrelated local state are included.
export async function personalRequest(api,token,path,body,fetchImpl=fetch) {
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(token||''))throw Error('Inserisci un codice personale valido');
 const r=await fetchImpl(api+path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(25000),cache:'no-store',redirect:'error'});
 const raw=await r.text();if(raw.length>120000)throw Error('Risposta troppo grande');
 let data;try{data=JSON.parse(raw);}catch{throw Error('Risposta del server non valida');}
 if(!r.ok)throw Error(data.error||'Sincronizzazione non riuscita');return data;
}
