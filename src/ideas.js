import {validId} from './editorial-contract.js';
export function validateCatalog(data){
 if(data?.schema!==1||!Array.isArray(data.ideas)||data.ideas.length>500)throw Error('Catalogo non valido');const ids=new Set();
 return data.ideas.map(x=>{
 if(!validId(x.id)||ids.has(x.id)||typeof x.title!=='string'||!x.title.trim()||x.title.length>100||!Array.isArray(x.variants)||!x.variants.length||x.variants.some(v=>typeof v!=='string'||!v.trim()||v.length>300)||!Array.isArray(x.contexts)||x.contexts.some(c=>!['solo','coppia','casa','spesa','pausa','sera','sociale','mattino','fuori'].includes(c))||!Number.isInteger(x.priority)||x.priority<0||x.priority>3||!Number.isInteger(x.duration_minutes)||x.duration_minutes<1||x.duration_minutes>240||!Number.isInteger(x.min_interval_days)||x.min_interval_days<1||x.min_interval_days>365||!Array.isArray(x.materials)||x.materials.some(m=>typeof m!=='string'||m.length>100)||(x.recipe&&(typeof x.recipe!=='string'||x.recipe.length>2000)))throw Error('Idea non valida');
 ids.add(x.id);return {id:x.id,title:x.title,variants:x.variants,contexts:x.contexts,priority:x.priority,duration_minutes:x.duration_minutes,min_interval_days:x.min_interval_days,materials:x.materials,recipe:x.recipe||'',category:typeof x.category==='string'?x.category:'hobby',action:'plan',enabled:x.enabled!==false};});
}
const hash=s=>[...s].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
export function chooseIdea(ideas,date,context,{maxMinutes=240,together=false,lastSuggested={}}={}){
 const day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000);
 return ideas.filter(x=>x.enabled&&x.priority>0&&x.contexts.includes(context)&&(together||!x.contexts.includes('coppia'))&&x.duration_minutes<=maxMinutes&&day%x.min_interval_days===hash(x.id)%x.min_interval_days&&(!lastSuggested[x.id]||day-Math.floor(Date.parse(lastSuggested[x.id]+'T12:00:00Z')/86400000)>=x.min_interval_days)).sort((a,b)=>(hash(date+a.id)%100)/a.priority-(hash(date+b.id)%100)/b.priority)[0]||null;
}
export function ideaText(x,date){const n=Math.floor(Date.parse(date+'T12:00:00Z')/86400000);return x.variants[((n%x.variants.length)+x.variants.length)%x.variants.length];}
export function ideaReminders(state,ideas,occs,now,base){
 if(!state.settings.habits.ideas?.enabled)return [];const acts=Object.fromEntries(state.activities.map(a=>[a.id,a]));const out=[],seen=new Set();
 for(const o of occs){const shopping=o.block.context==='shopping';if(!shopping&&acts[o.act]?.kind!=='break')continue;const at=o.startMs+(shopping?-10:5)*60000;
 if(at<=now||at>now+7*86400000||(!shopping&&o.endMs-at<10*60000)||occs.some(b=>b!==o&&b.startMs<=at&&b.endMs>at&&['study','lesson'].includes(acts[b.act]?.kind)))continue;
 const idea=chooseIdea(ideas.filter(x=>!seen.has(o.date+x.id)),o.date,shopping?'spesa':'pausa',{maxMinutes:shopping?240:Math.floor((o.endMs-at)/60000),lastSuggested:state.ideaLastSuggested||{}});
 if(!idea||seen.has(o.date+idea.id)||out.some(x=>Math.abs(x.at-at)<60000))continue;seen.add(o.date+idea.id);
 out.push({id:`idea_${o.startMs.toString(36)}_${idea.id.slice(0,32)}_${hash(idea.id).toString(36)}`,at,title:shopping?'Prima della spesa':'Un’idea per la pausa',body:ideaText(idea,o.date),url:`${base}#${shopping?'spesa':'idee'}`});
 }return out;
}
export function mergeShopping(existing,input){
 if(!Array.isArray(input)||input.length>1000)throw Error('Lista spesa non valida');const out=existing.map(x=>({...x})),key=s=>s.normalize('NFKC').trim().toLocaleLowerCase('it');
 for(const x of input){if(!x||typeof x.name!=='string'||!x.name.trim()||x.name.length>100||typeof x.inHouse!=='boolean')throw Error('Voce spesa non valida');if(!out.some(y=>key(y.name)===key(x.name)))out.push({id:crypto.randomUUID(),name:x.name.trim(),inHouse:x.inHouse});}return out;
}
