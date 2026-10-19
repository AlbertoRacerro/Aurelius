// Statistics over effective (non-overlapping) entries and planned occurrences.
// "Non registrato" = planned time that has ended and that no entry covers. It is reported as unknown, never as wasted.

import { effective, gaps, union } from './ledger.js';
import { occurrencesBetween } from './schedule.js';
import { addDays, instantOf, partsAt, weekStart } from './time.js';

const MIN = 60000;

export function actById(state) {
  return Object.fromEntries(state.activities.map((a) => [a.id, a]));
}

/** Aggregates for [fromDate, toDate] inclusive, evaluated at `now`. */
export function summarize(state, fromDate, toDate, now) {
  const tz = state.settings.tz;
  const A = actById(state);
  const from = instantOf(fromDate, 0, tz), to = instantOf(addDays(toDate, 1), 0, tz);
  const occs = occurrencesBetween(state, fromDate, toDate).filter((o) => o.startMs < to);
  const segs = effective(state, from, Math.min(to, Math.max(now, from)));

  const plannedBy = {}, actualBy = {}, daily = {};
  let plannedStudy = 0, actualStudy = 0, breaks = 0, plannedEnded = 0;
  for (const o of occs) {
    const m = (o.endMs - o.startMs) / MIN;
    plannedBy[o.act] = (plannedBy[o.act] || 0) + m;
    if (A[o.act]?.study) plannedStudy += m;
    if (o.endMs <= now) plannedEnded += m;
  }
  for (const s of segs) {
    const m = (s.e - s.s) / MIN;
    actualBy[s.act] = (actualBy[s.act] || 0) + m;
    const d = partsAt(s.s, tz).date;
    daily[d] = daily[d] || { study: 0, byAct: {} };
    daily[d].byAct[s.act] = (daily[d].byAct[s.act] || 0) + m;
    if (A[s.act]?.study) { actualStudy += m; daily[d].study += m; }
    if (A[s.act]?.kind === 'break') breaks += m;
  }
  // Unaccounted: ended planned windows minus everything recorded; dismissed blocks stay unknown too.
  // Time before tracking started is neither recorded nor "unaccounted".
  const since = state.settings.trackFrom || 0;
  const endedWindows = union(occs.filter((o) => o.startMs < now && o.endMs > since)
    .map((o) => ({ s: Math.max(o.startMs, since), e: Math.min(o.endMs, now) })));
  const covered = segs.map((s) => ({ s: s.s, e: s.e }));
  let unaccounted = 0;
  for (const w of endedWindows) unaccounted += gaps(covered, w.s, w.e).reduce((n, g) => n + (g.e - g.s), 0) / MIN;

  const gymDays = new Set(segs.filter((s) => A[s.act]?.kind === 'gym' && s.e - s.s >= 20 * MIN).map((s) => partsAt(s.s, tz).date));
  const pendingCount = occs.filter((o) => o.endMs <= now && o.endMs > since && !state.accounts[o.id]).length;
  return { fromDate, toDate, plannedBy, actualBy, plannedStudy, actualStudy, breaks, unaccounted, plannedEnded,
    daily, gymSessions: gymDays.size, pendingCount };
}

export function weekSummary(state, date, now) {
  const ws = weekStart(date);
  return summarize(state, ws, addDays(ws, 6), now);
}

/** Target status for a week's active study, in hours. Ranges are kept as ranges. */
export function targetStatus(state, studyMinutes) {
  const t = state.targets.weekly, h = studyMinutes / 60;
  let level = 'sotto il minimo';
  if (h >= t.stretch) level = 'stretch';
  else if (h >= t.targetMin) level = 'nel target';
  else if (h >= t.floor) level = 'sopra il minimo';
  return { hours: h, level, floor: t.floor, targetMin: t.targetMin, targetMax: t.targetMax, stretch: t.stretch };
}

/** Concise weekly review, facts only. */
export function weeklyReview(state, date, now) {
  const w = weekSummary(state, date, now);
  const A = actById(state);
  const subjects = Object.entries(w.actualBy).filter(([id]) => A[id]?.study)
    .sort((a, b) => b[1] - a[1]).map(([id, m]) => ({ id, name: A[id]?.name || id, minutes: m }));
  const behind = Object.entries(w.plannedBy).filter(([id]) => A[id]?.study)
    .map(([id, p]) => ({ id, name: A[id]?.name || id, planned: p, actual: w.actualBy[id] || 0 }))
    .filter((x) => x.actual < x.planned);
  const backlogOpen = state.backlog.filter((x) => !x.done);
  return { ...w, target: targetStatus(state, w.actualStudy), subjects, behind, backlogOpen,
    gymTarget: state.targets.gymPerWeek };
}

/** Summer 2026 history (legacy daily hours, no subject recorded). */
export function legacyHistory(state) {
  const days = state.legacy?.days || {};
  const rows = Object.keys(days).sort().map((d) => ({ date: d, hours: Number(days[d]?.ore) || 0 }))
    .filter((r) => r.hours > 0);
  return { rows, total: rows.reduce((n, r) => n + r.hours, 0), sessions: (state.legacy?.tlog || []).length };
}
