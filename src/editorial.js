import {validateEdition,validDate,validateRating} from './editorial-contract.js';
import {partsAt} from './time.js';
export const CACHE_KEY='aurelius.editions.v1', FEEDBACK_KEY='aurelius.feedback.local.v1', AUTH_KEY='aurelius.editorial.auth.v1';
export const romeDate=(now=Date.now())=>partsAt(now,'Europe/Rome').date;
export function readFeedback(storage) {try {const o=JSON.parse(storage.getItem(FEEDBACK_KEY)||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{};}catch{return {};} }
export function cachedEditions(storage) {try {return JSON.parse(storage.getItem(CACHE_KEY)||'[]').map(validateEdition);}catch{return [];} }
export async function loadEdition(storage,base,date=romeDate(),fetchImpl=fetch) {
 if(!validDate(date))throw Error('Data non valida');
 const cached=cachedEditions(storage);
 const get=async path=>{const r=await fetchImpl(new URL(path,base),{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('Edizione assente');const t=await r.text();if(t.length>500000)throw Error('File troppo grande');return JSON.parse(t);};
 let e;
 try {e=validateEdition(await get(`editions/${date}.json`));if(e.date!==date)throw Error('Data diversa');}
 catch {e=null;try {const m=await get('manifest.json');if(!validDate(m.latest)||m.latest>date)throw Error('Manifest non valido');e=validateEdition(await get(`editions/${m.latest}.json`));if(e.date!==m.latest)throw Error('Manifest incoerente');}catch{e=cached.filter(x=>x.date<=date).sort((a,b)=>b.date.localeCompare(a.date))[0];}}
 if(!e)return {edition:null,stale:true};
 try {storage.setItem(CACHE_KEY,JSON.stringify([e,...cached.filter(x=>x.date!==e.date)].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7)));}catch{/* storage full: reader still works */}
 return {edition:e,stale:e.date!==date};
}
export function queueRating(storage,input) {
 const all=readFeedback(storage), old=all[input.article_id];
 const rating=validateRating({...input,revision:Math.max(Date.now(),(old?.rating?.revision||0)+1),rated_at:new Date().toISOString()});
 all[rating.article_id]={rating,status:'queued'};storage.setItem(FEEDBACK_KEY,JSON.stringify(all));return rating;
}
let syncing=false;
export async function syncFeedback(storage,api,fetchImpl=fetch) {
 const token=storage.getItem(AUTH_KEY);if(syncing||!token||!api)return;syncing=true;
 try {for(const [id,snapshot]of Object.entries(readFeedback(storage))) {
  if(snapshot.status==='published')continue;
  try {const r=await fetchImpl(api+'/v1/feedback',{method:'PUT',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(validateRating(snapshot.rating)),signal:AbortSignal.timeout(10000)});const body=await r.json();if(!r.ok)throw Error(body.error||`Server ${r.status}`);
   const all=readFeedback(storage);if(all[id]?.rating.revision!==snapshot.rating.revision)continue;all[id]={...snapshot,status:body.published?'published':'received',error:''};storage.setItem(FEEDBACK_KEY,JSON.stringify(all));
  }catch(err){const all=readFeedback(storage);if(all[id]?.rating.revision===snapshot.rating.revision){all[id].error=err.message;storage.setItem(FEEDBACK_KEY,JSON.stringify(all));}}
 }}finally{syncing=false;}
}
