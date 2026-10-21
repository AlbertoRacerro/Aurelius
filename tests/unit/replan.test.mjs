import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../../src/model.js';
import {occurrences} from '../../src/schedule.js';
import {remainingWindow,replanRemaining} from '../../src/replan.js';
const date='2026-10-21',at=hm=>Date.parse(`${date}T${hm}+02:00`);
function fixture(start='10:00',end='12:00'){
 const s=emptyState();s.dateOverrides[date]=[{id:'source',start,end,act:'poci',note:'Originale',context:'shopping'}];
 s.entries=[{id:'actual',start:at('10:05:00'),end:at('10:10:00'),act:'atp'}];
 return {s,o:occurrences(s,date)[0]};
}
let counter=0;const id=()=>`new-${++counter}`;
test('33 elapsed minutes of 120 allow 75 in quarters; retain elapsed 33 and original tail 12',()=>{
 const {s,o}=fixture(),snapshot=JSON.stringify(s);
 assert.deepEqual(remainingWindow(s,o,at('10:33:00')),{start:633,minutes:75});
 const next=replanRemaining(s,o.id,JSON.stringify(o.block),[{act:'atp',minutes:45},{act:'poci',minutes:30}],at('10:33:00'),id);
 assert.deepEqual(next.dateOverrides[date].map(b=>[b.start,b.end,b.act]),[['10:00','10:33','poci'],['10:33','11:18','atp'],['11:18','11:48','poci'],['11:48','12:00','poci']]);
 assert.deepEqual(next.entries,s.entries);assert.deepEqual(next.accounts,s.accounts);assert.deepEqual(next.template,s.template);assert.deepEqual(next.weekOverrides,s.weekOverrides);assert.equal(JSON.stringify(s),snapshot);
 assert.equal(next.dateOverrides[date][0].id,'source');assert.equal(next.dateOverrides[date].at(-1).note,'Originale');
});
test('reject over-allocation, invalid units and stale/expired selections atomically',()=>{
 const {s,o}=fixture(),expected=JSON.stringify(o.block),snapshot=JSON.stringify(s);
 for(const rows of [[{act:'atp',minutes:90}],[{act:'atp',minutes:74}],[{act:'missing',minutes:15}],[]])assert.throws(()=>replanRemaining(s,o.id,expected,rows,at('10:33:00'),id));
 assert.throws(()=>replanRemaining(s,o.id,expected,[{act:'atp',minutes:75}],at('10:48:00'),id),/Restano/);
 assert.throws(()=>replanRemaining(s,o.id,expected,[{act:'atp',minutes:15}],at('12:00:00'),id),/terminato/);
 assert.throws(()=>replanRemaining(s,o.id,'outdated',[{act:'atp',minutes:15}],at('10:33:00'),id),/cambiato/);
 assert.equal(JSON.stringify(s),snapshot);
});
test('future block can be fully replaced, seconds round forward without backdating',()=>{
 const {s,o}=fixture();assert.equal(remainingWindow(s,o,at('10:45:01')).minutes,60);
 const n=replanRemaining(s,o.id,JSON.stringify(o.block),[{act:'atp',minutes:120}],at('09:00:00'),id);
 assert.equal(n.dateOverrides[date].length,1);assert.equal(n.dateOverrides[date][0].start,'10:00');
});
test('overnight allocations use next-date overrides and reject next-day collisions',()=>{
 const {s,o}=fixture('23:00','01:00');
 const time=Date.parse('2026-10-22T00:03:00+02:00');
 const n=replanRemaining(s,o.id,JSON.stringify(o.block),[{act:'atp',minutes:45}],time,id);
 assert.deepEqual(n.dateOverrides[date].map(b=>[b.start,b.end]),[['23:00','00:03']]);
 assert.deepEqual(n.dateOverrides['2026-10-22'].slice(0,2).map(b=>[b.start,b.end]),[['00:03','00:48'],['00:48','01:00']]);
 const bad=structuredClone(s);bad.dateOverrides['2026-10-22']=[{id:'collision',start:'00:20',end:'00:40',act:'poci'}];
 assert.throws(()=>replanRemaining(bad,o.id,JSON.stringify(o.block),[{act:'atp',minutes:45}],time,id),/sovrappongono|sovrappone/);
});
