import {stripCredentials,planningContext,digest,validateSnapshot} from './private-sync-contract.js';
import {PERSONAL_AUTH} from './inbox.js';
export const PRIVATE_META='aurelius.private.sync.v1';
const prefs=['aurelius.reader.v1','aurelius.feedback.local.v1'];
export function syncMeta(storage){let m;try{m=JSON.parse(storage.getItem(PRIVATE_META)||'null');}catch{}if(!m?.client_id){m={client_id:crypto.randomUUID(),revision:0};storage.setItem(PRIVATE_META,JSON.stringify(m));}return m;}
export async function makeSnapshot(state,storage,now=Date.now()){
 const meta=syncMeta(storage),clean=stripCredentials(state),preferences={};
 for(const k of prefs){const raw=storage.getItem(k);if(raw){try{preferences[k]=stripCredentials(JSON.parse(raw));}catch{}}}
 const snapshot={schema:1,client_id:meta.client_id,revision:Math.max(now,(meta.revision||0)+1),captured_at:now,notifications_enabled:!!state.settings.push?.token,state:clean,preferences};
 validateSnapshot(snapshot,now);const context=planningContext(clean,now);
 return {snapshot,context_hash:await digest(context),data_hash:await digest({state:clean,preferences,context,notifications_enabled:snapshot.notifications_enabled})};
}
export async function uploadSnapshot(state,storage,api,{force=false,fetchImpl=fetch,now=Date.now()}={}){
 const token=storage.getItem(PERSONAL_AUTH);if(!token||state.settings.privateSync===false)return null;
 const prepared=await makeSnapshot(state,storage,now),meta=syncMeta(storage);
 if(!force&&prepared.data_hash===meta.data_hash&&now-(meta.synced_at||0)<6*3600000)return meta;
 const r=await fetchImpl(api+'/v1/personal/snapshot',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),body:JSON.stringify({...prepared,device_token:state.settings.push?.token||''})});
 const raw=await r.text();if(raw.length>3000)throw Error('Risposta sincronizzazione non valida');let data;try{data=JSON.parse(raw);}catch{throw Error('Aggiorna il Worker per attivare la copia privata');}
 if(!r.ok)throw Error(data.error||'Copia privata non inviata');
 if(data.received!==true||data.context_hash!==prepared.context_hash||data.revision!==prepared.snapshot.revision)throw Error('Conferma copia privata non valida');
 const next={client_id:meta.client_id,revision:data.revision,data_hash:prepared.data_hash,synced_at:now,context_hash:data.context_hash};storage.setItem(PRIVATE_META,JSON.stringify(next));return next;
}
export async function pausePrivateCopy(storage,api,fetchImpl=fetch){
 const token=storage.getItem(PERSONAL_AUTH);if(!token)return;
 const r=await fetchImpl(api+'/v1/personal/pause',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),body:JSON.stringify({client_id:syncMeta(storage).client_id})});
 if(!r.ok)throw Error('Sospensione remota non confermata; riprova con rete disponibile');
 const body=await r.json();if(body.paused!==true)throw Error('Sospensione non confermata');
}
