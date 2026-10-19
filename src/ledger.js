// Actual time is a list of real-clock intervals ("entries"). Every way of recording time — confirming a block,
// splitting it, a focus-timer session, a later manual entry — produces entries, and nothing else counts.
//
// Invariants:
// - Planned time is never counted as actual unless the user confirmed it.
// - A block confirmation only fills the minutes of that block not already covered by other entries
//   (e.g. a timer session), so the same minute is never recorded twice.
// - Re-accounting a block replaces that block's own entries; entries from elsewhere are untouched.
// - Statistics resolve any remaining overlap by giving each minute to the most recently recorded entry.
// - Minutes nobody accounted for are "non registrato", never "perso".

const MIN = 60000;

export function uid(prefix = 'e') {
  const r = (globalThis.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 2 ** 32, Date.now()];
  return `${prefix}${Number(r[0]).toString(36)}${Number(r[1]).toString(36)}`;
}

/** Union of intervals [{s,e}], sorted and merged. */
export function union(intervals) {
  const xs = intervals.filter((x) => x.e > x.s).map((x) => ({ s: x.s, e: x.e })).sort((a, b) => a.s - b.s);
  const out = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    if (last && x.s <= last.e) last.e = Math.max(last.e, x.e);
    else out.push(x);
  }
  return out;
}

/** Parts of [from,to) not covered by `intervals`. */
export function gaps(intervals, from, to) {
  const out = [];
  let cur = from;
  for (const x of union(intervals)) {
    if (x.e <= cur) continue;
    if (x.s >= to) break;
    if (x.s > cur) out.push({ s: cur, e: Math.min(x.s, to) });
    cur = Math.max(cur, x.e);
    if (cur >= to) break;
  }
  if (cur < to) out.push({ s: cur, e: to });
  return out;
}

export const minutes = (xs) => xs.reduce((n, x) => n + (x.e - x.s), 0) / MIN;

function live(state) { return state.entries.filter((x) => !x.deleted); }

/** Entries recorded by other sources overlapping [from,to) (excluding this occurrence's own). */
function foreign(state, occId, from, to) {
  return live(state).filter((x) => x.occ !== occId && x.start < to && x.end > from);
}

/** Accountable window of an occurrence: the block, cut at `now` if it has not ended yet. */
export function window(occ, now) { return { s: occ.startMs, e: Math.min(occ.endMs, now) }; }

export function availableMinutes(state, occ, now) {
  const w = window(occ, now);
  if (w.e <= w.s) return 0;
  return minutes(gaps(foreign(state, occ.id, w.s, w.e).map((x) => ({ s: x.start, e: x.end })), w.s, w.e));
}

function snapshot(occ) {
  return { date: occ.date, start: occ.block.start, end: occ.block.end, act: occ.act, startMs: occ.startMs, endMs: occ.endMs };
}

function clearOwn(state, occId) {
  state.entries = state.entries.filter((x) => x.occ !== occId);
}

/**
 * Records allocations [{act, minutes}] into the uncovered part of the occurrence, in order.
 * Returns the number of minutes recorded. Allocations beyond the available time are rejected.
 */
function fill(state, occ, allocations, now, src) {
  const w = window(occ, now);
  const free = gaps(foreign(state, occ.id, w.s, w.e).map((x) => ({ s: x.start, e: x.end })), w.s, w.e);
  const avail = minutes(free);
  const asked = allocations.reduce((n, a) => n + Math.max(0, a.minutes), 0);
  if (asked > avail + 1e-9) throw new Error(`Hai assegnato ${Math.round(asked)}' ma ne restano ${Math.round(avail)}' in questo blocco`);
  const at = Date.now();
  let gi = 0, cursor = free.length ? free[0].s : 0;
  for (const a of allocations) {
    let left = Math.round(Math.max(0, a.minutes) * MIN);
    while (left > 0 && gi < free.length) {
      const g = free[gi];
      if (cursor < g.s) cursor = g.s;
      const take = Math.min(left, g.e - cursor);
      if (take > 0) {
        state.entries.push({ id: uid(), start: cursor, end: cursor + take, act: a.act, src, occ: occ.id,
          approx: src === 'split', at });
        cursor += take; left -= take;
      }
      if (cursor >= g.e) { gi += 1; if (gi < free.length) cursor = free[gi].s; }
    }
  }
  return asked;
}

/** "Sì, tutto": the rest of the block was the planned activity (or `act` for a generic study block). */
export function confirmAll(state, occ, now, act = occ.act) {
  clearOwn(state, occ.id);
  const avail = availableMinutes(state, occ, now);
  fill(state, occ, avail > 0 ? [{ act, minutes: avail }] : [], now, 'confirm');
  state.accounts[occ.id] = { status: 'all', at: Date.now(), planned: snapshot(occ), act };
  return avail;
}

/** "In parte" / "Altro": explicit minutes per activity; whatever is left stays unaccounted. */
export function confirmSplit(state, occ, allocations, now, status = 'partial') {
  const before = state.entries.slice();
  clearOwn(state, occ.id);
  try {
    fill(state, occ, allocations.filter((a) => a.minutes > 0), now, 'split');
  } catch (err) {
    state.entries = before;
    throw err;
  }
  state.accounts[occ.id] = { status, at: Date.now(), planned: snapshot(occ),
    allocations: allocations.filter((a) => a.minutes > 0).map((a) => ({ act: a.act, minutes: a.minutes })) };
}

/** "Non ricordo": stop asking; the time stays unaccounted (unknown, not wasted). */
export function dismiss(state, occ) {
  clearOwn(state, occ.id);
  state.accounts[occ.id] = { status: 'unknown', at: Date.now(), planned: snapshot(occ) };
}

/** Undo an accounting: the block becomes pending again. */
export function reopen(state, occId) {
  clearOwn(state, occId);
  delete state.accounts[occId];
}

/** A manual entry for any interval (later accounting); it wins over older overlapping entries. */
export function addManual(state, act, start, end, note = '') {
  if (!(end > start)) throw new Error('Intervallo non valido');
  const e = { id: uid(), start, end, act, src: 'manual', note, at: Date.now() };
  state.entries.push(e);
  return e;
}

export function removeEntry(state, id) {
  state.entries = state.entries.filter((x) => x.id !== id);
}

/** Ended occurrences awaiting accounting: no record yet and some minutes not covered by other entries. */
export function pending(state, occs, now) {
  const from = state.settings.trackFrom || 0;
  return occs.filter((o) => o.endMs <= now && o.endMs > from && !state.accounts[o.id] && availableMinutes(state, o, now) >= 1);
}

/**
 * Entries clipped so that no minute is counted twice: overlaps go to the most recently recorded entry.
 * Returns [{act, s, e, entry}] restricted to [from,to).
 */
export function effective(state, from = -Infinity, to = Infinity) {
  const es = live(state).filter((x) => x.end > from && x.start < to).sort((a, b) => (b.at || 0) - (a.at || 0));
  const taken = [];
  const out = [];
  for (const x of es) {
    const pieces = gaps(taken, Math.max(x.start, from), Math.min(x.end, to));
    for (const p of pieces) out.push({ act: x.act, s: p.s, e: p.e, entry: x });
    taken.push({ s: Math.max(x.start, from), e: Math.min(x.end, to) });
  }
  return out.sort((a, b) => a.s - b.s);
}
