import {validateRating} from '../../src/editorial-contract.js';
const reply=(status,body)=>({status,body});
function equal(a,b){let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
export async function feedback(req,env){
 if(!env.FEEDBACK_TOKEN||env.FEEDBACK_TOKEN.length<32)return reply(503,{error:'Feedback pubblico non configurato; voto conservato sul dispositivo'});
 if(!equal(req.headers.get('authorization')||'',`Bearer ${env.FEEDBACK_TOKEN}`))return reply(401,{error:'Codice editoriale non valido'});
 const bucket=Math.floor(Date.now()/60000);
 const limit=await env.DB.prepare('INSERT INTO editorial_limits(bucket,count) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first();
 if(limit.count>30)return reply(429,{error:'Troppi invii; riprova tra un minuto'});
 let r;try{const t=await req.text();if(t.length>4000)return reply(413,{error:'Voto troppo grande'});r=validateRating(JSON.parse(t));if(r.revision>Date.now()+300000)throw Error('Orologio del dispositivo troppo avanti');}catch(err){return reply(400,{error:err.message});}
 const prior=await env.DB.prepare('SELECT * FROM editorial_ratings WHERE article_id=?').bind(r.article_id).first();
 if(prior&&(r.revision<prior.revision||(r.revision===prior.revision&&prior.payload!==JSON.stringify(r))))return reply(409,{error:'Esiste un voto più recente: modifica il voto per inviarlo di nuovo'});
 await env.DB.prepare('INSERT INTO editorial_ratings(article_id,payload,revision) VALUES (?,?,?) ON CONFLICT(article_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision WHERE excluded.revision>editorial_ratings.revision').bind(r.article_id,JSON.stringify(r),r.revision).run();
 const row=await env.DB.prepare('SELECT * FROM editorial_ratings WHERE article_id=?').bind(r.article_id).first();
 if(row.revision!==r.revision)return reply(409,{error:'Esiste un voto più recente'});
 return reply(200,{received:true,published:row.published_revision===r.revision});
}
export async function flushFeedback(env,fetchImpl=fetch,now=Date.now()){
 if(!env.GITHUB_EDITORIAL_TOKEN||!/^[\w.-]+\/[\w.-]+$/.test(env.CONTENT_REPO||''))return {configured:false};
 if(!await env.DB.prepare('SELECT article_id FROM editorial_ratings WHERE revision>published_revision LIMIT 1').first())return {published:0};
 const owner=crypto.randomUUID();
 const lock=await env.DB.prepare("INSERT INTO editorial_locks(name,owner,expires) VALUES ('github',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE editorial_locks.expires<? RETURNING owner").bind(owner,now+120000,now).first();
 if(lock?.owner!==owner)return {busy:true};
 try {
 const {results:rows}=await env.DB.prepare('SELECT * FROM editorial_ratings ORDER BY article_id').all();
 const ratings=rows.map(row=>{const {revision,...data}=validateRating(JSON.parse(row.payload));return data;});
 const bytes=new TextEncoder().encode(JSON.stringify({schema:1,ratings},null,2)+'\n');let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const content=btoa(binary);
 const path=env.FEEDBACK_PATH||'feedback/ratings.json',branch=env.CONTENT_BRANCH||'main';
 if(!/^[a-zA-Z0-9_/-]+\.json$/.test(path)||path.includes('..')||!/^[\w./-]+$/.test(branch))throw Error('Invalid publication target');
 const url=`https://api.github.com/repos/${env.CONTENT_REPO}/contents/${path}`,headers={authorization:`Bearer ${env.GITHUB_EDITORIAL_TOKEN}`,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'Aurelius-Editorial'};
 for(let attempt=0;attempt<3;attempt++){
 const res=await fetchImpl(url+'?ref='+encodeURIComponent(branch),{headers,signal:AbortSignal.timeout(10000)});if(!res.ok&&res.status!==404)throw Error('GitHub read failed');const prior=res.ok?await res.json():null;
 const write=await fetchImpl(url,{method:'PUT',headers,signal:AbortSignal.timeout(10000),body:JSON.stringify({message:'editorial: synchronize public ratings',branch,content,...(prior?.sha?{sha:prior.sha}:{})})});
 if([409,422].includes(write.status))continue;if(!write.ok)throw Error('GitHub publication failed');
 await env.DB.batch(rows.map(r=>env.DB.prepare('UPDATE editorial_ratings SET published_revision=? WHERE article_id=? AND revision=?').bind(r.revision,r.article_id,r.revision)));
 await env.DB.prepare('DELETE FROM editorial_limits WHERE bucket<?').bind(Math.floor(now/60000)-60).run();return {published:rows.length};
 }throw Error('GitHub conflict: pending retained');
 }finally{await env.DB.prepare("DELETE FROM editorial_locks WHERE name='github' AND owner=?").bind(owner).run();}
}
