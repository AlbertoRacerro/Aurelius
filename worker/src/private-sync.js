import {validateSnapshot,planningContext,digest,validateSuggestions,eligibleSuggestion,MAX_SNAPSHOT_BYTES} from '../../src/private-sync-contract.js';
import {partsAt,instantOf,addDays} from '../../src/time.js';
import {b64uEncode} from './webpush.js';
const TARGET='AlbertoRacerro/-Aurelius-Personal';
const equal=(a,b)=>{let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
const decode=data=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(data.content),c=>c.charCodeAt(0))));
const encode=x=>{let s='';for(const b of new TextEncoder().encode(JSON.stringify(x)))s+=String.fromCharCode(b);return btoa(s);};
export async function privateGitHub(env,fetchImpl=fetch){
 if(env.PERSONAL_REPO!==TARGET||!env.GITHUB_PERSONAL_TOKEN)throw Error('private config');
 const base='https://api.github.com/repos/'+TARGET;
 const request=async(path,init={})=>{const r=await fetchImpl(base+path,{...init,headers:{authorization:'Bearer '+env.GITHUB_PERSONAL_TOKEN,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'Aurelius-Private'},redirect:'manual',signal:AbortSignal.timeout(10000)});if(r.status>=300&&r.status<400){await r.body?.cancel();throw Error('redirect rejected');}const text=await r.text();if(text.length>1800000)throw Error('response limit');return {status:r.status,ok:r.ok,data:r.ok?JSON.parse(text):null};};
 const meta=await request('');if(!meta.ok||meta.data.private!==true)throw Error('private repository unavailable');return request;
}
async function readBody(req){const reader=req.body?.getReader();if(!reader)throw Error();let size=0,chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_SNAPSHOT_BYTES+2000)throw Error();chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function snapshotRequest(req,env,fetchImpl=fetch,now=Date.now()){
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(env.PERSONAL_TOKEN||'')||env.PERSONAL_REPO!==TARGET||!env.GITHUB_PERSONAL_TOKEN)return {status:503,body:{error:'Copia privata non ancora configurata'}};
 if(!equal(req.headers.get('authorization')||'','Bearer '+env.PERSONAL_TOKEN))return {status:401,body:{error:'Codice personale non valido'}};
 if(req.method!=='POST')return {status:405,body:{error:'Metodo non valido'}};
 let body,snapshot,context,contextHash;
 try{body=await readBody(req);snapshot=validateSnapshot(body.snapshot,now);context=planningContext(snapshot.state,snapshot.captured_at);contextHash=await digest(context);if(body.context_hash!==contextHash||body.data_hash!==await digest({state:snapshot.state,preferences:snapshot.preferences,context,notifications_enabled:snapshot.notifications_enabled}))throw Error();}catch{return {status:400,body:{error:'Copia privata non valida o troppo grande; originale conservato'}};}
 try{
  // Durable rate limit before upstream traffic.
  const bucket=Math.floor(now/60000);const count=await env.DB.prepare('INSERT INTO personal_limits(bucket,count) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first();if(count.count>30)return {status:429,body:{error:'Sincronizzazione da riprovare fra un minuto'}};
  if(!!body.device_token!==snapshot.notifications_enabled)return {status:400,body:{error:'Stato notifiche non coerente'}};
  let device='';if(body.device_token){if(!/^[A-Za-z0-9_-]{20,100}$/.test(body.device_token))return {status:401,body:{error:'Registrazione notifiche non valida'}};const tokenHash=b64uEncode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.device_token))));const dev=await env.DB.prepare('SELECT id FROM devices WHERE token_hash=?').bind(tokenHash).first();if(!dev)return {status:401,body:{error:'Riattiva le notifiche per collegare i suggerimenti'}};device=dev.id;}
  const gh=await privateGitHub(env,fetchImpl),path='/contents/state/'+snapshot.client_id+'.json';
  const prior=await gh(path+'?ref=main');if(!prior.ok&&prior.status!==404)throw Error();
  if(prior.ok){const old=decode(prior.data);if(old.revision>snapshot.revision||(old.revision===snapshot.revision&&JSON.stringify(old)!==JSON.stringify({...snapshot,context,context_hash:contextHash,data_hash:body.data_hash})))return {status:409,body:{error:'Esiste una copia più recente di questo dispositivo; nessun dato sostituito'}};}
  const payload={...snapshot,context,context_hash:contextHash,data_hash:body.data_hash};
  if(new TextEncoder().encode(JSON.stringify(payload)).length>MAX_SNAPSHOT_BYTES)return {status:413,body:{error:'Copia privata troppo grande; esporta un backup, originale conservato'}};
  let sha=prior.data?.sha;
  if(!prior.ok||JSON.stringify(decode(prior.data))!==JSON.stringify(payload)){
   const write=await gh(path,{method:'PUT',body:JSON.stringify({message:'private: synchronize device state',branch:'main',content:encode(payload),...(sha?{sha}:{})})});
   if(!write.ok)return {status:write.status===409||write.status===422?409:503,body:{error:'Copia privata non confermata; originale conservato, riprova'}};sha=write.data.content?.sha||'';
  }
  // A late request can never restore an older context, even if GitHub accepted it earlier.
  await env.DB.prepare('INSERT INTO private_clients(client,revision,device,context_hash,context,captured,sha) VALUES (?,?,?,?,?,?,?) ON CONFLICT(client) DO UPDATE SET revision=excluded.revision,device=excluded.device,context_hash=excluded.context_hash,context=excluded.context,captured=excluded.captured,sha=excluded.sha WHERE excluded.revision>private_clients.revision').bind(snapshot.client_id,snapshot.revision,device,contextHash,JSON.stringify(context),snapshot.captured_at,sha).run();
  return {status:200,body:{received:true,revision:snapshot.revision,context_hash:contextHash}};
 }catch{return {status:503,body:{error:'Copia privata non confermata: aggiorna il Worker e riprova. I dati restano sul dispositivo.'}};}
}
export async function refreshSuggestions(env,now=Date.now(),fetchImpl=fetch){
 if(!env.GITHUB_PERSONAL_TOKEN||env.PERSONAL_REPO!==TARGET)return;
 // One refresh per five minutes, including overlapping cron invocations.
 const lease=await env.DB.prepare('UPDATE private_refresh SET until_ms=? WHERE id=1 AND until_ms<=? RETURNING id').bind(now+300000,now).first();if(!lease)return;
 const gh=await privateGitHub(env,fetchImpl),res=await gh('/contents/planning/reminders.json?ref=main');if(res.status===404)return;if(!res.ok)throw Error();
 const doc=validateSuggestions(decode(res.data),now);
 await env.DB.prepare('UPDATE private_suggestions SET active=0').run();
 await env.DB.prepare("DELETE FROM reminders WHERE substr(id,1,3)='ai_' AND state=0").run();
 for(const plan of doc.clients){
  const client=await env.DB.prepare('SELECT * FROM private_clients WHERE client=?').bind(plan.client_id).first();
  if(!client?.device||client.context_hash!==plan.context_hash||client.captured<now-36*3600000)continue;
  const context=JSON.parse(client.context),used=[];
  for(const r of plan.reminders){
   if(!eligibleSuggestion(r,context,now))continue;
   // Stable identity across retries; same target may not be nudged repeatedly in a day.
   const id='ai_'+r.id, date=partsAt(r.at,'Europe/Rome').date;
   const repeated=await env.DB.prepare('SELECT id FROM private_suggestions WHERE device=? AND ref_type=? AND ref_id=? AND at>=? AND at<? AND id<>?').bind(client.device,r.ref_type,r.ref_id,instantOf(date,0,'Europe/Rome'),instantOf(addDays(date,1),0,'Europe/Rome'),id).first();if(repeated)continue;
   used.push({r,id});
  }
  for(const {r,id} of used){
   const date=partsAt(r.at,'Europe/Rome').date;
   const already=await env.DB.prepare("SELECT id FROM reminders WHERE device=? AND substr(id,1,3)='ai_' AND at>=? AND at<? AND id<>?").bind(client.device,instantOf(date,0,'Europe/Rome'),instantOf(addDays(date,1),0,'Europe/Rome'),id).all();
   if(already.results.length>=3)continue;
   const collision=await env.DB.prepare("SELECT id FROM reminders WHERE device=? AND substr(id,1,3)!='ai_' AND at>? AND at<?").bind(client.device,r.at-10*60000,r.at+10*60000).first();if(collision)continue;
   // Context comparison is inside both INSERTs: concurrent plan changes invalidate the proposal.
   const gate='EXISTS(SELECT 1 FROM private_clients WHERE client=? AND context_hash=? AND device=?)';
   const url=(env.APP_URL||'https://albertoracerro.github.io/Aurelius/')+(r.ref_type==='task'?'#todos':'#piano');
   await env.DB.batch([
    env.DB.prepare(`INSERT INTO private_suggestions(device,id,at,client,context_hash,expires,ref_type,ref_id,active) SELECT ?,?,?,?,?,?,?,?,1 WHERE ${gate} ON CONFLICT(device,id,at) DO UPDATE SET active=1,context_hash=excluded.context_hash,expires=excluded.expires`).bind(client.device,id,r.at,client.client,plan.context_hash,r.expires_at,r.ref_type,r.ref_id,client.client,plan.context_hash,client.device),
    env.DB.prepare(`INSERT OR IGNORE INTO reminders(device,id,at,title,body,url,state) SELECT ?,?,?,?,?,?,0 WHERE ${gate}`).bind(client.device,id,r.at,r.title,r.body,url,client.client,plan.context_hash,client.device)
   ]);
  }
 }
}
export async function suggestionStillValid(env,r,now){
 const source=await env.DB.prepare('SELECT s.*,c.context_hash AS current_hash,c.context,c.captured,c.device AS current_device FROM private_suggestions s JOIN private_clients c ON c.client=s.client WHERE s.device=? AND s.id=? AND s.at=?').bind(r.device,r.id,r.at).first();
 if(!source||!source.active||source.context_hash!==source.current_hash||source.current_device!==r.device||source.captured<now-36*3600000||source.expires<now)return false;
 // Delivery-time evaluation, allowing the due instant itself.
 return eligibleSuggestion({at:r.at,expires_at:source.expires,ref_type:source.ref_type,ref_id:source.ref_id},JSON.parse(source.context),Math.min(now,r.at)-1);
}

export async function pausePrivate(req,env,now=Date.now()){
 if(!env.PERSONAL_TOKEN||!equal(req.headers.get('authorization')||'','Bearer '+env.PERSONAL_TOKEN))return {status:401,body:{error:'Codice personale non valido'}};
 try{
  const body=await readBody(req);if(req.method!=='POST'||!/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(body.client_id))return {status:400,body:{error:'Dispositivo non valido'}};
  await env.DB.prepare("UPDATE private_clients SET context_hash='disabled',device='',revision=MAX(revision+1,?) WHERE client=?").bind(now+1,body.client_id).run();
  return {status:200,body:{paused:true}};
 }catch{return {status:503,body:{error:'Sospensione remota non confermata; riprova con rete disponibile'}};}
}
