import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../../src/model.js';
import { reflectionForDate, REFLECTIONS } from '../../src/reflections.js';
import { validateRelationship, estimateCycle, saveRelationship, loadRelationship, deleteRelationship,
  suggestedGesture, RELATIONSHIP_KEY } from '../../src/relationship.js';
import { reminderItems } from '../../src/reminders.js';

const storage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) || null, setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), data: m };
};
const record = { consent: true, lastStart: '2026-10-01', cycleDays: 28,
  periodDays: 5, regular: true, gestures: ['tea', 'ask'] };

test('a stable daily reflection has an explicit attribution and is not disguised as a literal quote', () => {
  const q = reflectionForDate('2026-10-19');
  assert.deepEqual(reflectionForDate('2026-10-19'), q);
  assert.notDeepEqual(reflectionForDate('2026-10-20'), q);
  assert.ok(REFLECTIONS.length >= 20);
  for (const row of REFLECTIONS) {
    assert.ok(row.title && row.thought && row.source && row.practice);
    assert.ok(row.thought.length <= 180);
  }
});

test('relationship preferences require consent, are stored only in a separate local key, and can be deleted', () => {
  const st = storage();
  assert.throws(() => validateRelationship({ ...record, consent: false }, '2026-10-19'), /accordo/);
  assert.throws(() => validateRelationship({ ...record, cycleDays: 28.5 }, '2026-10-19'), /Lunghezza/);
  assert.throws(() => validateRelationship({ ...record, lastStart: '2026-10-20' }, '2026-10-19'), /passato/);
  saveRelationship(st, record, '2026-10-19');
  assert.equal(loadRelationship(st).lastStart, '2026-10-01');
  assert.equal(st.data.size, 1);
  assert.ok(st.data.has(RELATIONSHIP_KEY));
  assert.ok(!st.data.has('aurelius.v2'));
  deleteRelationship(st);
  assert.equal(loadRelationship(st), null);
});

test('phase is explicitly approximate, and variable or stale cycles suppress estimates', () => {
  assert.match(estimateCycle(record, '2026-10-01').label, /mestruali/);
  assert.match(estimateCycle(record, '2026-10-07').label, /follicolare/);
  assert.match(estimateCycle(record, '2026-10-14').label, /periovulatoria/);
  assert.match(estimateCycle(record, '2026-10-22').label, /luteale/);
  const variable = estimateCycle({ ...record, regular: false }, '2026-10-22');
  assert.equal(variable.nextStart, undefined);
  assert.equal(variable.label, 'Fase non stimabile');
  assert.equal(estimateCycle(record, '2027-01-01').stale, true);
});

test('proposed gestures only come from explicit preferences, not presumed mood', () => {
  const suggestion = suggestedGesture(record, '2026-10-19');
  assert.ok(suggestion.includes('Chiedile') || suggestion.includes('bevanda'));
  assert.match(suggestedGesture({ gestures: [] }, '2026-10-19'), /Chiedi/);
});

test('07:00 reminder is from verified reflection; relationship push contains no reproductive data', () => {
  const s = emptyState();
  s.settings.habits.care.enabled = true;
  s.settings.carePresence = { date:'2026-10-19', together:true, slots:['morning'] };
  s.settings.careDays = ['2026-10-19'];
  const when = new Date('2026-10-19T06:00:00+02:00').getTime();
  const items = reminderItems(s, when, 'https://example.com/Aurelius/');
  const quote = items.find((i) => i.id.endsWith('_quote') && i.at ===
    new Date('2026-10-19T07:00:00+02:00').getTime());
  const care = items.find((i) => i.id.endsWith('_careMoment') && i.at ===
    new Date('2026-10-19T08:05:00+02:00').getTime());
  assert.ok(quote && care);
  assert.match(quote.url, /#rituali$/);
  assert.match(care.body, /bigliettino|messaggio|fiore|ingredienti/i);
  assert.doesNotMatch(care.title + care.body + care.url, /mestru|ciclo|fase|ovul|2026-10-01/i);
  assert.equal(new Set(items.map((x) => x.id)).size, items.length);
  assert.ok(items.length < 400);
});
