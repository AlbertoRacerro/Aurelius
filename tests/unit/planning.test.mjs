import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../../src/model.js';
import { applyPlanPatch } from '../../src/plan-import.js';
import { reminderItems } from '../../src/reminders.js';
import { normalize } from '../../src/store.js';

const patch = {
  format: 'aurelius-plan-patch', version: 1, id: 'test-private-2026',
  backlog: [{ id: 'test_task_1', act: 'python', text: 'Finire Python',
    priority: 'P1', due: '2026-10-23' }],
  blockEdits: [{
    date: '2026-10-19',
    find: { start: '20:00', end: '22:00', act: 'bluerev' },
    replace: [{ start: '20:00', end: '21:30', act: 'vita', note: 'Evento privato' }],
  }],
};

test('import local plan atomically, idempotently, without touching actual ledger', () => {
  const state = emptyState();
  state.entries.push({ id: 'e1', start: 1, end: 200, act: 'atp', src: 'manual' });
  const original = JSON.stringify(state);
  const r = applyPlanPatch(state, patch);
  assert.equal(JSON.stringify(state), original);
  assert.equal(r.daysEdited, 1);
  assert.equal(r.state.entries.length, 1);
  assert.equal(r.state.backlog.find(x => x.id === 'test_task_1').priority, 'P1');
  assert.equal(r.state.dateOverrides['2026-10-19'].at(-1).end, '21:30');
  assert.equal(applyPlanPatch(r.state, patch).alreadyApplied, true);
});

test('personal plan rejects collisions without partial writes', () => {
  const state = emptyState();
  state.dateOverrides['2026-10-19'] = [{ id: 'custom', start: '20:00', end: '22:00', act: 'atp' }];
  const snapshot = JSON.stringify(state);
  assert.throws(() => applyPlanPatch(state, patch), /Conflitto nel calendario/);
  assert.equal(JSON.stringify(state), snapshot);
});

test('rejects overlapping or malformed calendar changes', () => {
  const state = emptyState();
  const overlapping = structuredClone(patch);
  overlapping.blockEdits[0].replace = [{ start: '19:00', end: '21:30', act: 'vita' }];
  assert.throws(() => applyPlanPatch(state, overlapping), /Conflitto negli orari/);
  const invalidTime = structuredClone(patch);
  invalidTime.blockEdits[0].replace = [{ start: '26:00', end: '28:00', act: 'vita' }];
  assert.throws(() => applyPlanPatch(state, invalidTime), /Nuovo blocco non valido/);
});

test('normalizing an old device keeps defaults and imported plan ids', () => {
  const s = emptyState();
  delete s.settings.habits;
  s.importedPlans = ['a'];
  const normalized = normalize(s);
  assert.equal(normalized.settings.habits.bedtime.time, '22:20');
  assert.deepEqual(normalized.importedPlans, ['a']);
});

test('hydration and bedtime reminders are generated in the local timezone', () => {
  const s = emptyState();
  const now = new Date('2026-10-19T12:00:00+02:00').getTime();
  const items = reminderItems(s, now, 'https://example.com/aurelius/');
  const ids = new Set(items.map(x => x.id));
  assert.equal(ids.size, items.length);
  const bedtime = items.find(x => x.title === 'È ora di dormire'
    && new Date(x.at).toISOString() === '2026-10-19T20:20:00.000Z');
  assert.ok(bedtime);
  assert.equal(items.filter(x => x.title === 'Bevi acqua').length >= 40, true);
  assert.equal(items.some(x => x.at <= now || x.at > now + 7 * 864e5), false);
});

test('disabled routines do not generate personal reminders', () => {
  const s = emptyState();
  for (const h of Object.values(s.settings.habits)) h.enabled = false;
  const items = reminderItems(s, new Date('2026-10-19T12:00:00+02:00').getTime(),
    'https://example.com/aurelius/');
  assert.equal(items.some(x => x.id.startsWith('h')), false);
});
