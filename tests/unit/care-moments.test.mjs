import test from 'node:test';
import assert from 'node:assert/strict';
import { MOMENTS, normalizePresence, togetherToday, hypotheticalStage,
  choiceForPresence, suggestionFor } from '../../src/care-moments.js';
import { emptyState } from '../../src/model.js';
import { reminderItems } from '../../src/reminders.js';

const today='2026-10-19';
const when = new Date('2026-10-19T07:00:00+02:00').getTime();
const url='https://example.test/Aurelius/';
const diary={consent:true,lastStart:'2026-10-18',cycleDays:28,periodDays:5,regular:true};

test('40 practical prompts: 32 for together time, 8 solo, with actual times',()=>{
  assert.equal(MOMENTS.length,40);
  assert.equal(new Set(MOMENTS.map(x=>x.id)).size,40);
  assert.equal(MOMENTS.filter(x=>x.who==='together').length,32);
  assert.equal(MOMENTS.filter(x=>x.who==='solo').length,8);
  assert.ok(MOMENTS.every(x=>x.text && x.title && x.minutes>=2 && x.minutes<=45));
});
test('presence wizard is one-day only and never uses couple ideas when alone or unspecified',()=>{
  const together=normalizePresence(today,true,['afternoon','evening','afternoon']);
  assert.deepEqual(together.slots,['afternoon','evening']);
  assert.equal(togetherToday(together,today),true);
  assert.equal(togetherToday(together,'2026-10-20'),false);
  assert.equal(togetherToday(normalizePresence(today,false,[]),today),false);
  assert.throws(()=>normalizePresence(today,true,[]),/momento/);
  assert.equal(choiceForPresence(null,today,diary,[]),null);
  assert.equal(choiceForPresence(normalizePresence(today,false,[]),today,diary,[]),null);
  const pick=choiceForPresence(together,today,diary,['2026-10-19'],900);
  assert.equal(pick.slot,'afternoon');
  assert.equal(pick.moment.who,'together');
  assert.equal(choiceForPresence(together,today,diary,[],1300),null);
});
test('only real together-days consume rotation; alone dates do not',()=>{
  const p=normalizePresence(today,true,['morning']);
  const one=choiceForPresence(p,today,null,[]);
  const same=choiceForPresence(p,today,null,['2026-10-19']);
  assert.equal(one.moment.id,same.moment.id);
  const shifted=choiceForPresence(p,today,null,['2026-10-18']);
  assert.notEqual(one.moment.id,shifted.moment.id);
});
test('pill-related categories are editorial; stale data return generic suggestions',()=>{
  assert.equal(hypotheticalStage(diary,'2026-10-19'),'bleed');
  assert.equal(hypotheticalStage(diary,'2026-11-14'),'pre');
  assert.equal(hypotheticalStage(diary,'2027-02-01'),'any');
  assert.ok(suggestionFor(today,'afternoon','solo','any',1).text);
});
test('push offers one selected couple nudge today; never projects company for tomorrow',()=>{
  const s=emptyState();
  s.settings.habits.care.enabled=true;
  let items=reminderItems(s,when,url,2,diary);
  assert.equal(items.filter(x=>x.id.endsWith('_careMoment')).length,0);
  s.settings.carePresence=normalizePresence(today,false,[]);
  items=reminderItems(s,when,url,2,diary);
  assert.equal(items.filter(x=>x.id.endsWith('_careMoment')).length,0);
  s.settings.carePresence=normalizePresence(today,true,['afternoon','evening']);
  s.settings.careDays=[today];
  items=reminderItems(s,when,url,2,diary);
  const couple=items.filter(x=>x.id.endsWith('_careMoment'));
  assert.equal(couple.length,1);
  assert.equal(couple[0].at,new Date('2026-10-19T21:00:00+02:00').getTime());
  assert.doesNotMatch(couple[0].title+couple[0].body+couple[0].url,/2026-10-18|menstru|ovul|sanguinamento|pillola/i);
  assert.equal(items.filter(x=>x.id.endsWith('_personalPause') && x.at===couple[0].at).length,0);
  s.settings.carePresence=normalizePresence(today,false,[]);
  items=reminderItems(s,when,url,2,diary);
  assert.equal(items.filter(x=>x.id.endsWith('_careMoment')).length,0);
  assert.equal(items.filter(x=>x.id.endsWith('_personalPause')).length,0); // configured time is inside deep study on this horizon
});
