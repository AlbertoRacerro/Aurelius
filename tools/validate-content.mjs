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
 validateCatalog(await read('ideas.json'));
 const f=await read('feedback/ratings.json');if(f.schema!==1||!Array.isArray(f.ratings))throw Error('Feedback non valido');
 const q=await read('editorial/queue.json');if(q.schema!==1||!Array.isArray(q.ready))throw Error('Coda non valida');
 for(const name of q.ready){if(!/^\d{4}-\d{2}-\d{2}\.json$/.test(name))throw Error('Percorso coda non valido');const e=validateEdition(await read('reserve/'+name));if(name!==e.date+'.json')throw Error('Riserva non coerente');}
 return true;
}
if(process.argv[1]?.endsWith('validate-content.mjs'))await validateContent(process.argv[2]||'content');
