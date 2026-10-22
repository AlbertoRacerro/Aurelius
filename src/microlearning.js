import {validDate} from './editorial-contract.js';
export const MICRO_CACHE='aurelius.microlearning.v1';
const id=/^[a-z0-9_-]{1,80}$/;
const txt=(x,n)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
export function validateMicroCard(c){
 const e={schema:1,date:'2026-10-22',cards:Array.from({length:4},(_,i)=>({...c,id:'validated-'+i}))};validateMicroEdition(e);if(!id.test(c.id))throw Error('ID scheda non valido');return c;
}
export function validateMicroEdition(e){
 if(e?.schema!==1||!validDate(e.date)||!Array.isArray(e.cards)||e.cards.length!==4)throw Error('Edizione microlearning non valida');
 const ids=new Set();
 for(const c of e.cards){
  if(!id.test(c.id)||ids.has(c.id)||!txt(c.topic,50)||!txt(c.title,100)||!txt(c.hook,180)||!Array.isArray(c.paragraphs)||c.paragraphs.length<1||c.paragraphs.length>3||c.paragraphs.some(p=>!txt(p,650))||!txt(c.takeaway,250)||!txt(c.basis,450)||!['automaton','flow','contrast','question'].includes(c.visual?.kind)||!Array.isArray(c.visual.labels)||c.visual.labels.length<1||c.visual.labels.length>3||c.visual.labels.some(x=>!txt(x,90))||!['sage','clay','plum','blue'].includes(c.tone)||!Array.isArray(c.sources)||!c.sources.length||c.sources.length>3)throw Error('Scheda microlearning non valida');
  for(const s of c.sources){if(!txt(s.title,200)||!txt(s.url,1200))throw Error('Fonte non valida');const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Fonte non sicura');}
  ids.add(c.id);
 }return e;
}
export function validateMicroManifest(m){
 if(m?.schema!==1||!Array.isArray(m.editions)||!m.editions.length||m.editions.length>10000||m.editions.some(x=>!validDate(x))||new Set(m.editions).size!==m.editions.length||[...m.editions].sort().at(-1)!==m.latest)throw Error('Archivio microlearning non valido');return m;
}
export function microCache(storage){try{const o=JSON.parse(storage.getItem(MICRO_CACHE)||'{"editions":{}}');if(!o||typeof o.editions!=='object')throw Error();return o;}catch{return {editions:{}};}}
export async function loadMicro(storage,base,date,fetchImpl=fetch){
 const cache=microCache(storage);let manifest;
 const get=async path=>{const r=await fetchImpl(new URL(path,base),{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Contenuto non disponibile');const text=await r.text();if(text.length>1000000)throw Error('Contenuto troppo grande');return JSON.parse(text);};
 let offline=false;
 try{manifest=validateMicroManifest(await get('microlearning/manifest.json'));cache.manifest=manifest;}catch{offline=true;try{manifest=validateMicroManifest(cache.manifest);}catch{return {edition:null,dates:[],offline:true,error:'Le schede non sono ancora disponibili. Riprova quando sei online.'};}}
 const dates=manifest.editions.filter(d=>d<=date).sort().reverse();const selected=manifest.editions.includes(date)?date:dates[0];
 if(!selected)return {edition:null,dates,offline,error:'Nessuna edizione disponibile per questa data.'};
 let edition;
 try{edition=validateMicroEdition(await get(`microlearning/editions/${selected}.json`));if(edition.date!==selected)throw Error('Data non coerente');cache.editions[selected]=edition;}catch{offline=true;try{edition=validateMicroEdition(cache.editions[selected]);if(edition.date!==selected)throw Error();}catch{return {edition:null,dates,offline,error:'Questa edizione non è salvata sul dispositivo. Riaprila quando sei online.'};}}
 try{storage.setItem(MICRO_CACHE,JSON.stringify(cache));}catch{/* No silent eviction of older editions. */}
 return {edition,dates,offline};
}
export function rule30(rows=24){
 let row=Array(rows*2+1).fill(0);row[rows]=1;const out=[];
 for(let r=0;r<rows;r++){out.push(row);row=row.map((_,i)=>(30>>(((row[i-1]||0)<<2)|(row[i]<<1)|(row[i+1]||0)))&1);}return out;
}
