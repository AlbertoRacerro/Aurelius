import {validateMicroEdition,validateMicroManifest} from '../src/microlearning.js';
import {readFile,readdir}from'node:fs/promises';
import {validateEdition,validDate,wordCount}from'../src/editorial-contract.js';
import {validateCatalog}from'../src/ideas.js';
export async function validateContent(root='content'){
 const read=async p=>JSON.parse(await readFile(root+'/'+p,'utf8'));
 const m=await read('manifest.json');if(m.schema!==1||!validDate(m.latest)||!Array.isArray(m.editions)||!m.editions.includes(m.latest)||new Set(m.editions).size!==m.editions.length)throw Error('Manifest non valido');
 const ids=new Map(), texts=new Set();
 for(const file of await readdir(root+'/editions')){if(!file.endsWith('.json'))continue;const e=validateEdition(await read('editions/'+file));if(file!==e.date+'.json')throw Error('Filename/data non coerenti');for(const a of e.articles){if(ids.has(a.id))throw Error('ID articolo già pubblicato: '+a.id);ids.set(a.id,e.date);const text=a.sections.flatMap(s=>s.paragraphs).join(' ').replace(/\s+/g,' ').trim();if(texts.has(text))throw Error('Testo identico già pubblicato');texts.add(text);}console.log(`${e.date}: ${e.articles.map(a=>a.slot+' '+wordCount(a)).join(', ')}`);}
 for(const date of m.editions){if(!validDate(date))throw Error('Data manifest non valida');const e=validateEdition(await read(`editions/${date}.json`));if(e.date!==date)throw Error('Manifest incoerente');}
 if([...m.editions].sort().at(-1)!==m.latest)throw Error('Latest non è l’ultima edizione');
 const micro=validateMicroManifest(await read('microlearning/manifest.json')), microIds=new Set();
 for(const date of micro.editions){const e=validateMicroEdition(await read('microlearning/editions/'+date+'.json'));if(e.date!==date)throw Error('Data microlearning incoerente');for(const c of e.cards){if(microIds.has(c.id))throw Error('Scheda duplicata');microIds.add(c.id);
  if(c.visual.kind==='image'){
   const asset=await readFile(root+'/'+c.visual.src.replace(/^content\//,''));
   if(!asset.length||asset.length>1000000)throw Error('Immagine vuota o troppo grande: '+c.visual.src);
   if(c.visual.src.endsWith('.svg')){
    const svg=asset.toString('utf8');
    if(!/<svg\b[^>]*viewBox=/.test(svg)||/<(?:script|foreignObject|image|use|style|a)\b|\bon[a-z]+\s*=|(?:href|src)\s*=|<!DOCTYPE|<!ENTITY|url\s*\(/i.test(svg))throw Error('SVG non statico: '+c.visual.src);
   }else{
    const ext=c.visual.src.split('.').at(-1);
    const ok=ext==='png'?asset.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):ext==='webp'?asset.toString('ascii',0,4)==='RIFF'&&asset.toString('ascii',8,12)==='WEBP':asset[0]===255&&asset[1]===216&&asset[2]===255;
    if(!ok)throw Error('Formato immagine incoerente: '+c.visual.src);
   }
  }}}
 validateCatalog(await read('ideas.json'));
 const f=await read('feedback/ratings.json');if(f.schema!==1||!Array.isArray(f.ratings))throw Error('Feedback non valido');
 const q=await read('editorial/queue.json');if(q.schema!==1||!Array.isArray(q.ready))throw Error('Coda non valida');
 for(const name of q.ready){if(!/^\d{4}-\d{2}-\d{2}\.json$/.test(name))throw Error('Percorso coda non valido');const e=validateEdition(await read('reserve/'+name));if(name!==e.date+'.json')throw Error('Riserva non coerente');}
 return true;
}
if(process.argv[1]?.endsWith('validate-content.mjs'))await validateContent(process.argv[2]||'content');
