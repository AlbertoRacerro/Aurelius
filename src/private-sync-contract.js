import {sane} from './store.js';
import {occurrencesBetween} from './schedule.js';
import {partsAt,addDays} from './time.js';
export const CLIENT_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const MAX_SNAPSHOT_BYTES=600000;
const forbidden=/^(?:push|pushApi|ntfyTopic|token|.*_token|.*Token|authorization|password|secret|.*_secret|endpoint|p256dh|auth)$/i;
export function stripCredentials(value){
 if(Array.isArray(value))return value.map(stripCredentials);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!forbidden.test(k)&&!['checkedAt','lastSync','syncedHash','error'].includes(k)).map(([k,v])=>[k,stripCredentials(v)]));
 return value;
}
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function planningContext(state,now){
 const date=partsAt(now,state.settings.tz).date;
 return {date,timezone:state.settings.tz,enabled:state.settings.aiSuggestions!==false,activities:state.activities.map(a=>({id:a.id,name:a.name,kind:a.kind})),blocks:occurrencesBetween(state,date,addDays(date,7)).map(o=>({id:o.id,act:o.act,start:o.startMs,end:o.endMs,note:o.block.note||'',provisional:!!o.block.provisional})),tasks:(state.backlog||[]).filter(t=>!t.done).map(t=>({id:t.id,text:t.text,due:t.due||'',act:t.act||'vita',priority:t.priority||'P3',remindAt:t.remindAt||null})),notes:(state.personalInbox?.notes||[]).filter(n=>n.status!=='applied').map(n=>({id:n.note.id,text:n.note.text,created_at:n.note.created_at}))};
}
export function validateSnapshot(x,now=Date.now()){
 if(x?.schema!==1||typeof x.notifications_enabled!=='boolean'||!CLIENT_ID.test(x.client_id)||!Number.isSafeInteger(x.revision)||x.revision<1||!Number.isSafeInteger(x.captured_at)||x.captured_at>now+300000||x.captured_at<now-86400000||!sane(x.state)||x.state.settings?.tz!=='Europe/Rome'||!Array.isArray(x.state.activities)||!x.preferences||typeof x.preferences!=='object')throw Error('Copia privata non valida');
 if(JSON.stringify(stripCredentials(x.state))!==JSON.stringify(x.state)||JSON.stringify(stripCredentials(x.preferences))!==JSON.stringify(x.preferences))throw Error('Credenziali non ammesse nella copia privata');
 if(new TextEncoder().encode(JSON.stringify(x)).length>MAX_SNAPSHOT_BYTES)throw Error('Copia privata troppo grande; i dati restano sul dispositivo');
 // Planning is derived from validated state, never accepted as an independent AI claim.
 return x;
}
export function validateSuggestions(doc,now=Date.now()){
 if(doc?.schema!==1||!Number.isSafeInteger(doc.generated_at)||doc.generated_at>now+300000||doc.generated_at<now-36*3600000||!Array.isArray(doc.clients)||doc.clients.length>10)throw Error('Suggerimenti non validi');
 const clients=new Set();
 for(const c of doc.clients){if(!CLIENT_ID.test(c.client_id)||clients.has(c.client_id)||!/^[a-f0-9]{64}$/.test(c.context_hash)||!Array.isArray(c.reminders)||c.reminders.length>3)throw Error('Piano notifiche non valido');clients.add(c.client_id);const ids=new Set();let prev=0;
 for(const r of [...c.reminders].sort((a,b)=>a.at-b.at)){
  if(!/^[a-z0-9_-]{1,45}$/.test(r.id)||ids.has(r.id)||!Number.isSafeInteger(r.at)||!Number.isSafeInteger(r.expires_at)||r.at<doc.generated_at||r.at>doc.generated_at+48*3600000||r.expires_at<r.at||r.expires_at>r.at+1800000||typeof r.title!=='string'||!r.title.trim()||r.title.length>100||typeof r.body!=='string'||!r.body.trim()||r.body.length>280||!['task','block'].includes(r.ref_type)||typeof r.ref_id!=='string'||!r.ref_id||r.ref_id.length>200||r.at-prev<90*60000)throw Error('Notifica AI non valida');
  const minute=partsAt(r.at,'Europe/Rome').minute;if(minute<8*60||minute>=21*60)throw Error('Notifica fuori orario');prev=r.at;ids.add(r.id);
 }}return doc;
}
export function eligibleSuggestion(r,context,now){
 if(!context.enabled||r.at<=now||r.expires_at<=now)return false;
 const ref=r.ref_type==='task'?context.tasks.find(t=>t.id===r.ref_id):context.blocks.find(b=>b.id===r.ref_id);
 if(!ref||(r.ref_type==='block'&&(ref.provisional||ref.end<=r.at)))return false;
 if(r.ref_type==='task'&&ref.remindAt&&Math.abs(ref.remindAt-r.at)<90*60000)return false;
 const acts=Object.fromEntries(context.activities.map(a=>[a.id,a]));
 return !context.blocks.some(b=>b.start<=r.at&&b.end>r.at&&['study','lesson'].includes(acts[b.act]?.kind));
}
