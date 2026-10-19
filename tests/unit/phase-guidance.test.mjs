import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_GUIDES, GUIDANCE_SOURCES, dailyGuidance, phaseOutlook } from '../../src/phase-guidance.js';
import { estimateCycle } from '../../src/relationship.js';
const d = { consent:true, lastStart:'2026-10-01', cycleDays:28,
  periodDays:5, regular:true, gestures:[] };
test('curated source-linked, prepopulated guidance exists for all phases', () => {
  assert.ok(GUIDANCE_SOURCES.length >= 2);
  for (const stage of ['menstrual','follicular','periovulatory','luteal','unknown']) {
    const g = PHASE_GUIDES[stage];
    assert.ok(g.name && g.context && g.question && g.ideas.length >= 4);
    assert.ok(g.sourceIds.every(i => GUIDANCE_SOURCES[i]?.url?.startsWith('https://')));
    for(const idea of g.ideas) assert.ok(idea.length > 20);
  }
});
test('today tips change with reported calendar stage, without requiring selected preferences', () => {
  for(const [date,stage] of [
    ['2026-10-02','menstrual'],['2026-10-07','follicular'],
    ['2026-10-14','periovulatory'],['2026-10-22','luteal']
  ]) {
    const estimated=estimateCycle(d,date);
    assert.equal(estimated.stage, stage);
    const advice=dailyGuidance(estimated,date);
    assert.equal(advice.stage,stage);
    assert.ok(advice.ideas.includes(advice.suggestion));
  }
});
test('irregular cycles and old records never produce speculative multiweek timelines', () => {
  const x = { ...d, regular:false };
  assert.equal(dailyGuidance(estimateCycle(x,'2026-10-07'),'2026-10-07').stage,'unknown');
  assert.equal(phaseOutlook(x,'2026-10-07',estimateCycle).length,0);
  assert.equal(dailyGuidance(estimateCycle(d,'2027-02-01'),'2027-02-01').stage,'unknown');
  assert.equal(phaseOutlook(d,'2027-02-01',estimateCycle).length,0);
});
test('lookahead groups contiguous day ranges and never asserts fertility', () => {
  const x=phaseOutlook(d,'2026-10-18',estimateCycle,21);
  assert.ok(x.length >= 3);
  assert.equal(x[0].stage,'luteal');
  assert.ok(x.some(z=>z.stage==='menstrual'));
  for(let i=0;i<x.length;i++){
    assert.ok(x[i].from <= x[i].to);
    if(i>0)assert.ok(x[i-1].to < x[i].from);
  }
});
