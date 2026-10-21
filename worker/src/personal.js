import {validateNote,validateResult,NOTE_ID} from '../../src/inbox-contract.js';
const TARGET='AlbertoRacerro/-Aurelius-Personal';
const reply=(status,body)=>({status,body});
const equal=(a,b)=>{let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
function encode(value){let s='';for(const b of new TextEncoder().encode(JSON.stringify(value,null,2)+'\n'))s+=String.fromCharCode(b);return btoa(s);}
function decode(value){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))));}
async function limitedJson(req){
 const reader=req.body?.getReader();if(!reader)throw Error('Richiesta vuota');let bytes=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>18000)throw Error('Richiesta troppo grande');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(all));
}
export async function personal(req,env,fetchImpl=fetch) {
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(env.PERSONAL_TOKEN||'')||!env.GITHUB_PERSONAL_TOKEN||env.PERSONAL_REPO!==TARGET)return reply(503,{error:'Archivio personale non ancora configurato; nota conservata sul dispositivo'});
 if(!equal(req.headers.get('authorization')||'',`Bearer ${env.PERSONAL_TOKEN}`))return reply(401,{error:'Codice personale non valido'});
 const path=new URL(req.url).pathname;
 if(req.method!=='POST'||!['/v1/personal/notes','/v1/personal/poll'].includes(path))return reply(404,{error:'Non trovato'});
 let body;try{body=await limitedJson(req);}catch{return reply(400,{error:'Richiesta non valida o troppo grande'});}
 try{
 const bucket=Math.floor(Date.now()/60000);
 const count=await env.DB.prepare('INSERT INTO personal_limits(bucket,count) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first();
 await env.DB.prepare('DELETE FROM personal_limits WHERE bucket<?').bind(bucket-60).run();
 if(count.count>30)return reply(429,{error:'Troppi invii: riprova tra un minuto'});
 const headers={authorization:`Bearer ${env.GITHUB_PERSONAL_TOKEN}`,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'Aurelius-Personal'};
 const base=`https://api.github.com/repos/${TARGET}`;
 const gh=async(url,init={})=>{
  const res=await fetchImpl(url,{...init,headers,signal:AbortSignal.timeout(10000),redirect:'error'});
  const raw=await res.text();if(raw.length>2000000)throw Error('GitHub response limit');
  return {status:res.status,ok:res.ok,data:res.ok?JSON.parse(raw):null};
 };
 // Fail closed even if a token has accidentally been given access to a public repo.
 const meta=await gh(base);if(!meta.ok||meta.data.private!==true)return reply(503,{error:'Archivio privato non accessibile; nessun dato inviato'});
 if(path.endsWith('/notes')){
  let note;try{note=validateNote(body);if(note.created_at>Date.now()+300000)throw Error();}catch{return reply(400,{error:'Nota non valida'});}
  const url=base+'/contents/inbox/'+note.id+'.json';
  const prior=await gh(url+'?ref=main');
  if(prior.ok){if(JSON.stringify(validateNote(decode(prior.data.content)))!==JSON.stringify(note))return reply(409,{error:'Identificativo già usato da una nota diversa'});return reply(200,{received:true,id:note.id});}
  if(prior.status!==404)throw Error('GitHub read failed');
  const listing=await gh(base+'/contents/inbox?ref=main');
  if(listing.ok&&(!Array.isArray(listing.data)||listing.data.length>=900))return reply(409,{error:'Archivio da riordinare; nota conservata sul dispositivo'});
  if(!listing.ok&&listing.status!==404)throw Error('GitHub listing failed');
  const write=await gh(url,{method:'PUT',body:JSON.stringify({message:'personal: receive note',branch:'main',content:encode(note)})});
  if(!write.ok){if([409,422].includes(write.status))return reply(409,{error:'Invio concorrente: riprova'});throw Error('GitHub write failed');}
  return reply(200,{received:true,id:note.id});
 }
 if(!body||Object.keys(body).some(k=>k!=='ids')||!Array.isArray(body.ids)||body.ids.length>10||body.ids.some(id=>!NOTE_ID.test(id))||new Set(body.ids).size!==body.ids.length)return reply(400,{error:'Identificativi non validi'});
 const results=[],errors=[];
 // Bounded in-flight calls and independently recoverable malformed results.
 for(let i=0;i<body.ids.length;i+=3)await Promise.all(body.ids.slice(i,i+3).map(async id=>{
  const res=await gh(base+'/contents/outbox/'+id+'.json?ref=main');if(res.status===404)return;
  if(!res.ok)throw Error('GitHub result read failed');
  try{results.push(validateResult(decode(res.data.content),id));}catch{errors.push(id);}
 }));
 return reply(200,{results,errors});
 }catch{return reply(503,{error:'Archivio personale temporaneamente non disponibile; nessuna nota eliminata'});}
}
