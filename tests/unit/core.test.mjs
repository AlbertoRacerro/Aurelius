import test from 'node:test';
import assert from 'node:assert/strict';
import { instantOf, isoWeek, weekday, dateKey, partsAt, addDays, hm } from '../../src/time.js';
import { emptyState } from '../../src/model.js';
import { dayPlan, occurrences, nowAndNext, validateBlocks } from '../../src/schedule.js';
import * as L from '../../src/ledger.js';
import * as T from '../../src/timer.js';
import { summarize, targetStatus, legacyHistory } from '../../src/stats.js';
import * as S from '../../src/store.js';

const MIN = 60000;
const MON = '2026-10-19';  // Monday, ISO week 43

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
function plain() {
  const s = emptyState();
  for (let d = 0; d < 7; d++) s.template[d] = [];
  s.template[0] = [
    { id: 'a', start: '09:00', end: '10:00', act: 'atp' },
    { id: 'b', start: '10:00', end: '10:15', act: 'pausa' },
    { id: 'c', start: '10:15', end: '12:15', act: 'studio' },
    { id: 'n', start: '23:00', end: '01:00', act: 'bluerev' },
  ];
  return s;
}
const at = (date, h, m = 0) => instantOf(date, h * 60 + m, 'Europe/Rome');

test('calendar helpers', () => {
  assert.equal(weekday(MON), 0);
  assert.equal(weekday('2026-10-25'), 6);
  assert.equal(isoWeek(MON), '2026-W43');
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
  assert.equal(isoWeek('2027-01-04'), '2027-W01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(hm(1500), '01:00');
});

test('wall-clock instants across the 25 Oct 2026 DST change in Rome', () => {
  assert.equal(new Date(at('2026-10-24', 6)).toISOString(), '2026-10-24T04:00:00.000Z'); // CEST
  assert.equal(new Date(at('2026-10-25', 6)).toISOString(), '2026-10-25T05:00:00.000Z'); // CET
  assert.equal(new Date(at('2026-03-29', 2, 30)).toISOString(), '2026-03-29T01:30:00.000Z'); // spring gap -> shifted
  assert.equal(new Date(at('2026-10-25', 2, 30)).toISOString(), '2026-10-25T00:30:00.000Z'); // overlap -> earlier
  // A 06:00-08:00 block on the change day lasts two wall-clock hours.
  assert.equal((at('2026-10-25', 8) - at('2026-10-25', 6)) / MIN, 120);
  assert.equal(dateKey(Date.parse('2026-10-25T22:59:00Z')), '2026-10-25');
  assert.equal(dateKey(Date.parse('2026-10-25T23:00:00Z')), '2026-10-26');
  assert.equal(partsAt(Date.parse('2026-10-19T04:20:00Z')).minute, 6 * 60 + 20);
});

test('date override beats week override beats template', () => {
  const s = plain();
  assert.equal(dayPlan(s, MON).source, 'template');
  s.weekOverrides['2026-W43'] = { 0: [{ id: 'w', start: '08:00', end: '09:00', act: 'poci' }] };
  assert.equal(dayPlan(s, MON).source, 'week');
  assert.equal(dayPlan(s, '2026-10-26').source, 'template'); // next Monday unaffected
  s.dateOverrides[MON] = [];
  assert.deepEqual(dayPlan(s, MON), { source: 'date', blocks: [] }); // an empty day is a valid override
  delete s.dateOverrides[MON];
  assert.equal(occurrences(s, MON)[0].act, 'poci');
});

test('seed template covers all days and is marked provisional', () => {
  const s = emptyState();
  for (let d = 0; d < 7; d++) for (const b of s.template[d]) assert.equal(b.provisional, true);
  assert.equal(validateBlocks(s.template[0]).errors.length, 0);
  assert.equal(s.template[0].find((b) => b.start === '08:15').act, 'lez-atp');
});

test('now / next, including a block running past midnight', () => {
  const s = plain();
  let r = nowAndNext(s, at(MON, 9, 30));
  assert.equal(r.current.act, 'atp');
  assert.equal(r.next.act, 'pausa');
  assert.equal((r.current.endMs - at(MON, 9, 30)) / MIN, 30);
  r = nowAndNext(s, at('2026-10-20', 0, 30)); // Tuesday 00:30, Monday's 23:00-01:00 block
  assert.equal(r.current.act, 'bluerev');
  r = nowAndNext(s, at(MON, 12, 30));
  assert.equal(r.current, null);
  assert.equal(r.next.act, 'bluerev');
});

test('overlapping blocks are rejected by the editor', () => {
  const v = validateBlocks([{ start: '09:00', end: '10:00' }, { start: '09:30', end: '11:00' }]);
  assert.equal(v.errors.length, 1);
});

test('"sì, tutto" records exactly the block, once', () => {
  const s = plain();
  const [atp] = occurrences(s, MON);
  assert.equal(L.pending(s, occurrences(s, MON), at(MON, 10)).length, 1);
  L.confirmAll(s, atp, at(MON, 10, 5));
  L.confirmAll(s, atp, at(MON, 10, 5)); // repeated tap: still one hour
  const sum = summarize(s, MON, MON, at(MON, 10, 5));
  assert.equal(sum.actualBy.atp, 60);
  assert.equal(L.pending(s, occurrences(s, MON), at(MON, 10, 5)).length, 0);
});

test('a timer inside a block is not double counted when the block is confirmed', () => {
  const s = plain();
  const occ = occurrences(s, MON)[2]; // 10:15-12:15 generic study
  T.start(s, 'poci', 45, at(MON, 10, 15));
  T.stop(s, at(MON, 11, 0));
  assert.equal(L.availableMinutes(s, occ, at(MON, 12, 15)), 75);
  L.confirmAll(s, occ, at(MON, 12, 15), 'atp');
  const sum = summarize(s, MON, MON, at(MON, 12, 20));
  assert.equal(sum.actualBy.poci, 45);
  assert.equal(sum.actualBy.atp, 75);
  assert.equal(sum.actualStudy, 120);
});

test('partial split allocates minutes, leaves the rest unaccounted, rejects over-allocation', () => {
  const s = plain();
  const occ = occurrences(s, MON)[2]; // 120'
  assert.throws(() => L.confirmSplit(s, occ, [{ act: 'atp', minutes: 100 }, { act: 'pausa', minutes: 30 }], at(MON, 13)));
  assert.equal(s.entries.length, 0);
  L.confirmSplit(s, occ, [{ act: 'atp', minutes: 45 }, { act: 'poci', minutes: 30 }, { act: 'pausa', minutes: 15 }], at(MON, 13));
  const sum = summarize(s, MON, MON, at(MON, 13));
  assert.deepEqual([sum.actualBy.atp, sum.actualBy.poci, sum.actualBy.pausa], [45, 30, 15 + 0]);
  assert.equal(sum.actualStudy, 75);
  // Ended plan: 60 atp + 15 pausa + 120 studio; recorded 90 inside the study block -> 30 + 60 + 15 unaccounted.
  assert.equal(sum.unaccounted, 30 + 60 + 15);
  // Correction replaces the split rather than adding to it.
  L.confirmSplit(s, occ, [{ act: 'cppom', minutes: 120 }], at(MON, 13));
  const again = summarize(s, MON, MON, at(MON, 13));
  assert.equal(again.actualBy.atp || 0, 0);
  assert.equal(again.actualBy.cppom, 120);
});

test('unconfirmed planned time never counts; "non ricordo" stays unknown', () => {
  const s = plain();
  const occs = occurrences(s, MON);
  const sum = summarize(s, MON, MON, at(MON, 13));
  assert.equal(sum.actualStudy, 0);
  assert.equal(sum.plannedStudy, 60 + 120);
  L.dismiss(s, occs[0]);
  assert.equal(L.pending(s, occs, at(MON, 13)).length, 2);
  assert.equal(summarize(s, MON, MON, at(MON, 13)).unaccounted, 60 + 15 + 120);
});

test('effective() gives overlapping minutes to the newest entry only', () => {
  const s = plain();
  s.entries.push({ id: 'x', start: at(MON, 9), end: at(MON, 10), act: 'atp', src: 'manual', at: 1 });
  s.entries.push({ id: 'y', start: at(MON, 9, 30), end: at(MON, 10, 30), act: 'poci', src: 'manual', at: 2 });
  const sum = summarize(s, MON, MON, at(MON, 23));
  assert.equal(sum.actualBy.atp, 30);
  assert.equal(sum.actualBy.poci, 60);
});

test('timer: pause/resume, recovery after reload, stop at planned end', () => {
  const s = plain();
  T.start(s, 'atp', 25, at(MON, 9));
  T.pause(s, at(MON, 9, 10));
  const reloaded = JSON.parse(JSON.stringify(s)); // app killed and reopened
  T.resume(reloaded, at(MON, 9, 20));
  assert.equal(T.elapsedMs(reloaded.timer, at(MON, 9, 25)) / MIN, 15);
  assert.equal(T.endsAt(reloaded.timer, at(MON, 9, 25)), at(MON, 9, 35));
  assert.equal(T.plannedReachedAt(reloaded.timer), at(MON, 9, 35));
  // Forgot to stop: stop at the planned end, two hours later.
  const made = T.stop(reloaded, at(MON, 11, 30), T.plannedReachedAt(reloaded.timer));
  assert.equal(made.reduce((n, e) => n + (e.end - e.start), 0) / MIN, 25);
  assert.equal(reloaded.timer, null);
  assert.equal(T.unconfirmedSessions(reloaded).length, 1);
  T.settleSession(reloaded, made[0].session, { act: 'poci' });
  assert.equal(T.unconfirmedSessions(reloaded).length, 0);
  assert.ok(reloaded.entries.every((e) => e.act === 'poci'));
  assert.throws(() => { T.start(reloaded, 'atp', 25, 0); T.start(reloaded, 'atp', 25, 0); });
});

test('a session shorter than a minute is not recorded', () => {
  const s = plain();
  T.start(s, 'atp', 25, at(MON, 9));
  assert.deepEqual(T.stop(s, at(MON, 9) + 30000), []);
});

test('target status keeps ranges', () => {
  const s = emptyState();
  assert.equal(targetStatus(s, 27 * 60).level, 'sotto il minimo');
  assert.equal(targetStatus(s, 30 * 60).level, 'sopra il minimo');
  assert.equal(targetStatus(s, 35.5 * 60).level, 'nel target');
  assert.equal(targetStatus(s, 41 * 60).level, 'stretch');
});

const SUMMER = JSON.stringify({ days: { '2026-08-01': { ore: 5.5, chiuso: true }, '2026-08-02': { ore: 3 } }, tlog: [{ sec: 1500, n: 'POCI', d: '2026-08-01' }], pk: [], topic: 'aurelius-abc' });

test('first run adopts the summer data without touching it', () => {
  const st = memStorage({ aurelius: SUMMER });
  const { state, notice } = S.load(st);
  assert.match(notice, /estate 2026/);
  assert.equal(legacyHistory(state).total, 8.5);
  assert.equal(st.getItem('aurelius'), SUMMER);
  assert.equal(st.getItem(S.LEGACY_SNAPSHOT_KEY), SUMMER);
  S.save(st, state);
  assert.equal(st.getItem('aurelius'), SUMMER);
  assert.equal(S.load(st).state.legacy.days['2026-08-01'].ore, 5.5);
});

test('corrupt state is preserved and the previous copy restored', () => {
  const st = memStorage();
  const { state } = S.load(st);
  state.backlog.push({ id: 'b1', act: 'atp', text: 'Esercizi cap. 3', done: false });
  S.save(st, state);
  S.save(st, state);
  st.setItem(S.KEY, '{broken');
  const r = S.load(st);
  assert.match(r.notice, /danneggiati/);
  assert.equal(r.state.backlog.length, 1);
  assert.ok([...st.m.keys()].some((k) => k.startsWith('aurelius.v2.corrupt.')));
});

test('backup round trip, summer import and refusal of newer schemas', () => {
  const st = memStorage({ aurelius: SUMMER });
  const { state } = S.load(st);
  L.addManual(state, 'atp', at(MON, 9), at(MON, 10));
  const restored = S.importBackup(S.exportBackup(state, st), null);
  assert.equal(restored.entries.length, 1);
  assert.equal(restored.legacy.days['2026-08-02'].ore, 3);
  // A summer e-mail pasted in: adopted as history, current plan and records kept.
  const fresh = S.load(memStorage()).state;
  L.addManual(fresh, 'poci', at(MON, 9), at(MON, 10));
  const merged = S.importBackup(`Per ripristinare: …\n\n${SUMMER}`, fresh);
  assert.equal(merged.entries.length, 1);
  assert.equal(legacyHistory(merged).total, 8.5);
  // A v2 backup without summer data keeps the current summer history.
  const noLegacy = JSON.parse(S.exportBackup(fresh, null));
  const kept = S.importBackup(JSON.stringify(noLegacy), state);
  assert.ok(kept.legacy);
  assert.throws(() => S.migrate({ schema: 99 }));
  assert.throws(() => S.importBackup('not json', state));
  // Duplicated entries in a damaged file are dropped once.
  const dup = JSON.parse(S.exportBackup(state, null));
  dup.state.entries.push({ ...dup.state.entries[0] });
  assert.equal(S.importBackup(JSON.stringify(dup), null).entries.length, 1);
});

test('blocks that ended before tracking started are never asked about', () => {
  const s = plain();
  s.settings.trackFrom = at(MON, 10, 30);
  const occs = occurrences(s, MON);
  const p = L.pending(s, occs, at(MON, 12, 30)).map((o) => o.block.id);
  assert.deepEqual(p, ['c']); // 09:00-10:00 and 10:00-10:15 ended before tracking began at 10:30
  assert.deepEqual(L.pending(s, occs, at(MON, 12, 30)).length, 1);
});

test('trimSession keeps only the first minutes of a session', () => {
  const s = plain();
  T.start(s, 'atp', 45, at(MON, 9));
  T.pause(s, at(MON, 9, 20));
  T.resume(s, at(MON, 9, 30));
  T.stop(s, at(MON, 9, 55));
  const id = s.entries[0].session;
  T.trimSession(s, id, 30);
  assert.equal(s.entries.reduce((n, e) => n + (e.end - e.start) / MIN, 0), 30);
  assert.equal(s.entries.length, 2);
});

test('reminders: one per future block end with a deep link, plus the timer end', async () => {
  const { reminderItems } = await import('../../src/reminders.js');
  const s = plain();
  s.settings.trackFrom = 0;
  const items = reminderItems(s, at(MON, 9, 30), 'https://x.test/Aurelius/', 1);
  const first = items[0];
  assert.equal(first.at, at(MON, 10));
  assert.match(first.title, /ATP/);
  assert.match(first.body, /Ora: Pausa/);
  assert.match(first.url, /^https:\/\/x\.test\/Aurelius\/\?occ=2026-10-19/);
  assert.ok(items.every((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x.id)));
  assert.equal(new Set(items.map((x) => x.id)).size, items.length);
  T.start(s, 'poci', 25, at(MON, 9, 30));
  const withTimer = reminderItems(s, at(MON, 9, 30), 'https://x.test/Aurelius/', 1);
  assert.equal(withTimer.find((x) => x.id === 'timer').at, at(MON, 9, 55));
});

test('structurally damaged state is archived and the previous valid copy restored, never emptied', () => {
  const good = plain();
  good.entries = [{ id: 'e1', start: at(MON, 9), end: at(MON, 10), act: 'atp', at: 1 }];
  const storage = memStorage({ 'aurelius.v2': JSON.stringify({ ...good, entries: { broken: true } }), 'aurelius.v2.prev': JSON.stringify(good) });
  const { state, notice } = S.load(storage);
  assert.equal(state.entries.length, 1);
  assert.match(notice, /danneggiati/);
  assert.ok([...storage.m.keys()].some((k) => k.startsWith('aurelius.v2.corrupt.')));
  // Malformed single entries are quarantined, not dropped.
  const s2 = S.normalize({ ...good, entries: [...good.entries, { id: 'bad', start: 5, end: 1, act: 'atp' }] });
  assert.equal(s2.entries.length, 1);
  assert.equal(s2.quarantine.length, 1);
  assert.throws(() => S.importBackup(JSON.stringify({ format: 'aurelius-backup', state: { ...good, entries: 'x' } }), good), /danneggiato/);
});

test('a block cannot be closed before it ends (it would hide the rest of its time)', () => {
  const s = plain();
  const occ = occurrences(s, MON).find((o) => o.block.id === 'a'); // 09:00-10:00
  assert.throws(() => L.confirmAll(s, occ, at(MON, 9, 30)), /non è ancora finito/);
  // Within the grace period before the end the whole block is accounted.
  assert.equal(L.confirmAll(s, occ, at(MON, 9, 59)), 60);
});

test('overnight time is split at midnight; week totals are clipped to the week', () => {
  const s = plain();
  s.settings.trackFrom = 0;
  s.template[6] = [{ id: 's', start: '23:00', end: '01:00', act: 'atp' }]; // every Sunday night into Monday
  L.addManual(s, 'atp', at('2026-10-25', 23), at('2026-10-26', 1));
  const now = at('2026-11-03', 12);
  const w1 = summarize(s, '2026-10-19', '2026-10-25', now);
  const w2 = summarize(s, '2026-10-26', '2026-11-01', now);
  assert.equal(w1.daily['2026-10-25'].study, 60);
  assert.equal(w2.daily['2026-10-26'].study, 60);
  assert.equal(w1.actualStudy, 60);
  assert.equal(w2.actualStudy, 60);
  // Mon 09-10 ATP + Sunday 23-24 + the 00-01 spill from the previous Sunday = 180 planned in each week.
  assert.equal(w1.plannedBy.atp, 180);
  assert.equal(w2.plannedBy.atp, 180);
});

test('a block inside the spring DST gap does not exist that night', () => {
  const s = plain();
  s.dateOverrides['2027-03-28'] = [{ id: 'g', start: '02:30', end: '03:15', act: 'atp' }, { id: 'h', start: '09:00', end: '10:00', act: 'poci' }];
  const occs = occurrences(s, '2027-03-28');
  assert.deepEqual(occs.map((o) => o.block.id), ['h']);
  assert.ok(occs.every((o) => o.endMs > o.startMs));
});

test('statistics do not list a block as pending when a timer covered it', () => {
  const s = plain();
  s.settings.trackFrom = 0;
  T.start(s, 'atp', 60, at(MON, 9));
  T.stop(s, at(MON, 10));
  const w = summarize(s, MON, MON, at(MON, 10, 5));
  assert.equal(w.pendingCount, 0);
});

test('a stored state without an entries list is treated as damaged', () => {
  const good = plain();
  good.entries = [{ id: 'e1', start: at(MON, 9), end: at(MON, 10), act: 'atp', at: 1 }];
  const { entries, ...noEntries } = good;
  void entries;
  const storage = memStorage({ 'aurelius.v2': JSON.stringify(noEntries), 'aurelius.v2.prev': JSON.stringify(good) });
  assert.equal(S.load(storage).state.entries.length, 1);
});
