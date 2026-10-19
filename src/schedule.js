// Resolving the plan for a date: a date override beats a week override, which beats the weekly template.
// An override replaces that day's blocks entirely, so what you see after editing is exactly what applies.

import { addDays, instantOf, isoWeek, parseHM, partsAt, weekday } from './time.js';

export function dayPlan(state, date) {
  if (Object.prototype.hasOwnProperty.call(state.dateOverrides, date)) {
    return { source: 'date', blocks: state.dateOverrides[date] };
  }
  const wk = state.weekOverrides[isoWeek(date)];
  const wd = weekday(date);
  if (wk && Object.prototype.hasOwnProperty.call(wk, wd)) return { source: 'week', blocks: wk[wd] };
  return { source: 'template', blocks: state.template[wd] || [] };
}

/** Concrete occurrences on `date`, sorted, with instants. An end at or before the start runs past midnight. */
export function occurrences(state, date) {
  const tz = state.settings.tz;
  const { source, blocks } = dayPlan(state, date);
  return blocks
    .map((blk) => {
      const s = parseHM(blk.start), e0 = parseHM(blk.end);
      if (s == null || e0 == null) return null;
      const e = e0 <= s ? e0 + 1440 : e0;
      return {
        id: `${date}~${blk.start}~${blk.id}`,
        date, block: blk, act: blk.act, source,
        startMs: instantOf(date, s, tz), endMs: instantOf(date, e, tz),
        startMin: s, endMin: e,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);
}

export function occurrencesBetween(state, fromDate, toDate) {
  const out = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) out.push(...occurrences(state, d));
  return out;
}

/** What should be happening at `now`: the current block (or gap) and the next block. */
export function nowAndNext(state, now) {
  const today = partsAt(now, state.settings.tz).date;
  // Yesterday's blocks may run past midnight.
  const occ = occurrencesBetween(state, addDays(today, -1), addDays(today, 2));
  const current = occ.find((o) => o.startMs <= now && now < o.endMs) || null;
  const next = occ.find((o) => o.startMs >= (current ? current.endMs : now)) || null;
  return { current, next, today };
}

export function findOccurrence(state, occId) {
  const date = occId.split('~')[0];
  return occurrences(state, date).find((o) => o.id === occId) || null;
}

/** Validates and normalizes a list of blocks for one day (from the editor). */
export function validateBlocks(blocks) {
  const errors = [];
  const norm = blocks.map((blk, i) => {
    const s = parseHM(blk.start), e = parseHM(blk.end);
    if (s == null) errors.push(`Riga ${i + 1}: inizio non valido`);
    if (e == null) errors.push(`Riga ${i + 1}: fine non valida`);
    if (s != null && e != null && s === e) errors.push(`Riga ${i + 1}: durata zero`);
    return { ...blk };
  });
  const timed = norm
    .map((blk) => ({ blk, s: parseHM(blk.start), e: parseHM(blk.end) }))
    .filter((x) => x.s != null && x.e != null)
    .map((x) => ({ ...x, e: x.e <= x.s ? x.e + 1440 : x.e }))
    .sort((a, b) => a.s - b.s);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].s < timed[i - 1].e) errors.push(`${timed[i - 1].blk.start}–${timed[i - 1].blk.end} e ${timed[i].blk.start}–${timed[i].blk.end} si sovrappongono`);
  }
  return { errors, blocks: timed.map((x) => x.blk).concat(norm.filter((b) => parseHM(b.start) == null || parseHM(b.end) == null)) };
}
