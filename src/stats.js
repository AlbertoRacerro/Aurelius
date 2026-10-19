// Statistics over effective (non-overlapping) entries and planned occurrences.
// "Non registrato" = planned time that has ended and that no entry covers. It is reported as unknown, never as wasted.

import { effective, gaps, pending, union } from './ledger.js';
import { occurrencesBetween } from './schedule.js';
import { addDays, instantOf, partsAt, weekStart } from './time.js';

const MIN = 60000;

export function actById(state) {
  return Object.fromEntries(state.activities.map((a) => [a.id, a]));
}

/** Splits [s,e) at local midnights in `tz`, so overnight time is attributed to each day it belongs to. */
function byDay(s, e, tz) {
  const out = [];
  while (s < e) {
    const d = partsAt(s, tz).date;
    const mid = instantOf(addDays(d, 1), 0, tz);
    const end = Math.min(e, mid);
    out.push({ date: d, s, e: end });
    s = end;
  }
  return out;
}

/** Aggregates for [fromDate, toDate] inclusive, evaluated at `now`. Everything is clipped to that range. */
export function summarize(state, fromDate, toDate, now) {
  const tz = state.settings.tz;
  const A = actById(state);
  const from = instantOf(fromDate, 0, tz), to = instantOf(addDays(toDate, 1), 0, tz);
  // The previous day is included for blocks that run past midnight into the range.
  const occs = occurrencesBetween(state, addDays(fromDate, -1), toDate).filter((o) => o.startMs < to && o.endMs > from);
  const clip = (o) => ({ s: Math.max(o.startMs, from), e: Math.min(o.endMs, to) });
  const segs = effective(state, from, Math.min(to, Math.max(now, from)));

  const plannedBy = {}, actualBy = {}, daily = {};
  let plannedStudy = 0, actualStudy = 0, breaks = 0, plannedEnded = 0;
  for (const o of occs) {
    const c = clip(o);
    const m = (c.e - c.s) / MIN;
    plannedBy[o.act] = (plannedBy[o.act] || 0) + m;
    if (A[o.act]?.study) plannedStudy += m;
    if (o.endMs <= now) plannedEnded += m;
  }
  for (const seg of segs) {
    for (const p of byDay(seg.s, seg.e, tz)) {
      const m = (p.e - p.s) / MIN;
      actualBy[seg.act] = (actualBy[seg.act] || 0) + m;
      daily[p.date] = daily[p.date] || { study: 0, byAct: {} };
      daily[p.date].byAct[seg.act] = (daily[p.date].byAct[seg.act] || 0) + m;
      if (A[seg.act]?.study) { actualStudy += m; daily[p.date].study += m; }
      if (A[seg.act]?.kind === 'break') breaks += m;
    }
  }
  // Unaccounted: ended planned windows minus everything recorded; dismissed blocks stay unknown too.
  // Time before tracking started is neither recorded nor "unaccounted".
  const since = state.settings.trackFrom || 0;
  const endedWindows = union(occs.map(clip).map((c) => ({ s: Math.max(c.s, since), e: Math.min(c.e, now) })));
  const covered = segs.map((x) => ({ s: x.s, e: x.e }));
  let unaccounted = 0;
  for (const w of endedWindows) unaccounted += gaps(covered, w.s, w.e).reduce((n, g) => n + (g.e - g.s), 0) / MIN;

  const gymDays = new Set(segs.filter((x) => A[x.act]?.kind === 'gym' && x.e - x.s >= 20 * MIN).map((x) => partsAt(x.s, tz).date));
  // Same rule as the Now screen: ended, not accounted, and not already covered by other entries.
  const pendingCount = pending(state, occs.filter((o) => o.endMs <= to), now).length;
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
