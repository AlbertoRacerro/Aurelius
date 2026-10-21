import test from 'node:test';import assert from 'node:assert/strict';
import {validateEdition,validateRating,validDate} from '../../src/editorial-contract.js';
import {loadEdition,romeDate,queueRating,syncFeedback,FEEDBACK_KEY,AUTH_KEY} from '../../src/editorial.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
export function edition(date='2026-10-20'){return {schema:1,date,updated_at:date+'T07:00:00Z',articles:['philosophy','books','future'].map((slot,i)=>({id:slot+'-test',slot,title:slot,kind:'original',basis:'Test fixture only',sections:[{heading:'',paragraphs:[Array([500,2200,1200][i]).fill('x').join(' ')]}],sources:[{title:'Source',url:'https://example.org/source',edition:'Test fixture',accessed:date}]}))};}
test('edition enforces three ordered slots, real dates, sources and word ranges',()=>{const e=edition();validateEdition(e);for(const change of [x=>x.articles.pop(),x=>x.articles[1].id=x.articles[0].id,x=>x.articles[0].sources[0].url='javascript:alert(1)',x=>x.articles[0].sections[0].paragraphs=['troppo breve']]){const bad=structuredClone(e);change(bad);assert.throws(()=>validateEdition(bad));}assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('9999-99-99'),false);});
test('Rome midnight and DST calendar dates',()=>{assert.equal(romeDate(Date.parse('2026-10-24T22:30:00Z')),'2026-10-25');assert.equal(romeDate(Date.parse('2026-10-25T23:30:00Z')),'2026-10-26');});
test('missing edition falls back explicitly and offline cache survives',async()=>{const s=storage(),e=edition();const f=async u=>new Response(JSON.stringify(String(u).endsWith('manifest.json')?{latest:e.date}:e),{status:String(u).includes('2026-10-21')?404:200});assert.equal((await loadEdition(s,'https://example.org/','2026-10-21',f)).stale,true);const off=await loadEdition(s,'https://example.org/','2026-10-21',async()=>{throw Error('offline');});assert.equal(off.edition.date,e.date);assert.equal(off.stale,true);});
test('rejects mismatched day and malformed manifest; no partial edition admitted',async()=>{const result=await loadEdition(storage(),'https://example.org/','2026-10-20',async u=>new Response(JSON.stringify(String(u).endsWith('manifest.json')?{latest:'../../secret'}:edition('2026-10-21'))));assert.equal(result.edition,null);});
const input={article_id:'article-1',score:3,reasons:['too_short'],comment:''};
test('positive reasons allowed; public serializer excludes any private fields',()=>{const r=validateRating({...input,revision:1,rated_at:'2026-10-20T07:00:00Z',carePresence:{date:'secret'},token:'secret'});assert.deepEqual(r.reasons,['too_short']);assert.equal('carePresence'in r,false);assert.equal('token'in r,false);for(const comment of ['token=secret','diagnosi di esempio','github_pat_1234567890'])assert.throws(()=>validateRating({...r,comment}));});
test('offline queue replaces article vote and needs no push credential',async()=>{const s=storage();queueRating(s,input);queueRating(s,{...input,score:0});assert.equal(Object.keys(JSON.parse(s.getItem(FEEDBACK_KEY))).length,1);await syncFeedback(s,'https://worker.test',()=>assert.fail('no token'));s.setItem(AUTH_KEY,'x'.repeat(32));await syncFeedback(s,'https://worker.test',async()=>new Response(JSON.stringify({published:false})));assert.equal(JSON.parse(s.getItem(FEEDBACK_KEY))['article-1'].status,'received');await syncFeedback(s,'https://worker.test',async()=>new Response(JSON.stringify({published:true})));assert.equal(JSON.parse(s.getItem(FEEDBACK_KEY))['article-1'].status,'published');});
test('in-flight response cannot acknowledge a newer local edit',async()=>{const s=storage();s.setItem(AUTH_KEY,'x'.repeat(32));queueRating(s,input);await syncFeedback(s,'https://worker.test',async()=>{queueRating(s,{...input,score:1});return new Response(JSON.stringify({published:true}));});assert.equal(JSON.parse(s.getItem(FEEDBACK_KEY))['article-1'].status,'queued');});
test('bullets count as reading; chart rejects nonfinite, negative and unlabeled comparisons',()=>{
 const e=edition(),s=e.articles[2].sections[0];s.paragraphs=['Notizie'];s.bullets=[Array(1199).fill('x').join(' ')];
 // Max per-item length applies; multiple compact items reach the real word count.
 s.bullets=Array.from({length:4},(_,i)=>Array(i?300:299).fill('x').join(' '));
 s.chart={title:'Velocità',unit:'token/s',bars:[{label:'A',value:10},{label:'B',value:20}],note:'Stesso hardware e carico; dati degli autori',source_url:'https://example.org/benchmark'};
 assert.doesNotThrow(()=>validateEdition(e));
 for(const change of [c=>c.bars[0].value=-1,c=>c.bars[0].value=Infinity,c=>c.source_url='javascript:bad',c=>c.unit='',c=>c.bars.forEach(b=>b.value=0)]){const bad=structuredClone(e);change(bad.articles[2].sections[0].chart);assert.throws(()=>validateEdition(bad));}
});

test('compact Radar admits 500 words but retains a lower bound and the other slot ranges',()=>{
 const e=edition(),a=e.articles[2];a.sections=[{heading:'Notizie brevi',paragraphs:['Novità'],bullets:[Array(499).fill('dato').join(' ')]}];
 assert.doesNotThrow(()=>validateEdition(e));
 const short=structuredClone(e);short.articles[2].sections[0].bullets=[Array(498).fill('dato').join(' ')];assert.throws(()=>validateEdition(short),/Lunghezza future: 499/);
 for(const i of [0,1]){const bad=structuredClone(e);bad.articles[i].sections[0].paragraphs=[Array(i?2199:499).fill('x').join(' ')];assert.throws(()=>validateEdition(bad));}
 const tooLong=structuredClone(e);tooLong.articles[2].sections=[{heading:'',paragraphs:[Array(2001).fill('x').join(' ')]}];assert.throws(()=>validateEdition(tooLong),/Lunghezza future: 2001/);
});
