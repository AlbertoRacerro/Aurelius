import { dayPlan, findOccurrence, occurrencesBetween, validateBlocks } from './schedule.js';
import { addDays, hm, instantOf, partsAt } from './time.js';

// Future planning only. Never writes accounts, actual entries or weekly templates.
export function remainingWindow(state, occ, at) {
 if (!occ || at >= occ.endMs) throw Error('Il blocco è terminato. Riapri il piano.');
 if (occ.endMs-occ.startMs !== (occ.endMin-occ.startMin)*60000)
  throw Error('Per questo cambio d’ora usa Modifica nel Piano.');
 const local=partsAt(at,state.settings.tz);
 const dayOffset=Math.round((Date.parse(local.date)-Date.parse(occ.date))/86400000);
 // Round forward: a saved plan must never claim already elapsed seconds.
 const exact=instantOf(local.date,local.minute,state.settings.tz);
 const start=Math.max(occ.startMin,dayOffset*1440+local.minute+(at>exact?1:0));
 return {start,minutes:Math.max(0,Math.floor((occ.endMin-start)/15)*15)};
}

export function replanRemaining(state, occId, expectedBlock, rows, at, makeId) {
 const occ=findOccurrence(state,occId);
 if(!occ||JSON.stringify(occ.block)!==expectedBlock)throw Error('Il piano è cambiato. Riapri il blocco.');
 const window=remainingWindow(state,occ,at);
 if(!rows.length||rows.some(r=>!state.activities.some(a=>a.id===r.act)||!Number.isInteger(r.minutes)||r.minutes<=0||r.minutes%15))
  throw Error('Scegli attività e durate in multipli di 15 minuti.');
 if(rows.reduce((n,r)=>n+r.minutes,0)>window.minutes)throw Error(`Restano ${window.minutes} minuti pianificabili. Riduci le durate.`);
 const next=structuredClone(state),plans=new Map([[occ.date,dayPlan(state,occ.date).blocks.filter(b=>b.id!==occ.block.id).map(b=>({...b}))]]);
 const append=(start,end,block)=>{
  if(end<=start)return;
  const date=addDays(occ.date,Math.floor(start/1440));
  if(!plans.has(date))plans.set(date,dayPlan(state,date).blocks.map(b=>({...b})));
  plans.get(date).push({...block,start:hm(start),end:hm(end)});
 };
 // Retain the source ID on elapsed time so existing actual accounting remains attached.
 append(occ.startMin,window.start,occ.block);
 let cursor=window.start;
 for(const r of rows){append(cursor,cursor+r.minutes,{id:makeId(),act:r.act,note:'',provisional:false});cursor+=r.minutes;}
 if(cursor<occ.endMin)append(cursor,occ.endMin,{...occ.block,id:makeId()});
 for(const [date,blocks] of plans){
  const checked=validateBlocks(blocks);
  if(checked.errors.length)throw Error(checked.errors.join('; '));
  next.dateOverrides[date]=checked.blocks;
 }
 // Also detect cross-date collisions with pre-existing overnight blocks.
 const dates=[...plans.keys()].sort(),all=occurrencesBetween(next,addDays(dates[0],-1),addDays(dates.at(-1),1)).sort((a,b)=>a.startMs-b.startMs);
 for(let i=1;i<all.length;i++)if(all[i].startMs<all[i-1].endMs&&(plans.has(all[i].date)||plans.has(all[i-1].date)))throw Error('Il nuovo piano si sovrappone a un altro blocco.');
 return next;
}
