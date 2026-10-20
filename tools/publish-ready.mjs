// Free fallback: only releases a genuinely prepared edition; never fabricates one.
import{readFile,writeFile,access}from'node:fs/promises';import{romeDate}from'../src/editorial.js';import{validateEdition}from'../src/editorial-contract.js';
const date=romeDate(),path=`content/reserve/${date}.json`;
try{await access(path);}catch{console.log('Nessuna edizione pronta per '+date+'; ultima edizione conservata.');process.exit(0);}
const e=validateEdition(JSON.parse(await readFile(path,'utf8')));if(e.date!==date)throw Error('Data riserva errata');
const m=JSON.parse(await readFile('content/manifest.json','utf8'));if(m.editions.includes(date)){console.log('Edizione già pubblicata');process.exit(0);}
await writeFile(`content/editions/${date}.json`,JSON.stringify(e,null,2)+'\n');
m.editions=[...new Set([...m.editions,date])].sort();m.latest=m.editions.at(-1);await writeFile('content/manifest.json',JSON.stringify(m,null,2)+'\n');
const q=JSON.parse(await readFile('content/editorial/queue.json','utf8'));q.ready=q.ready.filter(x=>x!==date+'.json');await writeFile('content/editorial/queue.json',JSON.stringify(q,null,2)+'\n');
