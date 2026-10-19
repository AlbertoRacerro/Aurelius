// Focus timer. The only clock is persisted timestamps: `segments` of past running time plus `since` for the
// running segment. A suspended or killed PWA therefore recovers exactly on reopen; JavaScript intervals only
// repaint. Stopping records the measured segments as entries straight away (durable), and the user then
// confirms or corrects what was actually studied.

import { uid } from './ledger.js';

const MIN = 60000;

export function start(state, act, plannedMin, now, occ = null) {
  if (state.timer) throw new Error('C\'è già un timer in corso');
  state.timer = { id: uid('t'), act, plannedMin, startedAt: now, segments: [], since: now, occ };
  return state.timer;
}

export function pause(state, now) {
  const t = state.timer;
  if (!t || t.since == null) return;
  if (now > t.since) t.segments.push({ s: t.since, e: now });
  t.since = null;
}

export function resume(state, now) {
  const t = state.timer;
  if (!t || t.since != null) return;
  t.since = now;
}

export function elapsedMs(t, now) {
  if (!t) return 0;
  return t.segments.reduce((n, x) => n + (x.e - x.s), 0) + (t.since != null ? Math.max(0, now - t.since) : 0);
}

/** Instant the planned duration is reached, if running. */
export function endsAt(t, now) {
  if (!t || t.since == null) return null;
  const done = t.segments.reduce((n, x) => n + (x.e - x.s), 0);
  return t.since + Math.max(0, t.plannedMin * MIN - done);
}

/**
 * Stops at `at` (default now; e.g. the planned end when the user forgot to stop) and records the session.
 * Returns the created entries (empty if shorter than a minute).
 */
export function stop(state, now, at = now) {
  const t = state.timer;
  if (!t) return [];
  const until = Math.min(at, now);
  const segs = t.segments.filter((x) => x.s < until).map((x) => ({ s: x.s, e: Math.min(x.e, until) }));
  if (t.since != null && t.since < until) segs.push({ s: t.since, e: until });
  state.timer = null;
  const total = segs.reduce((n, x) => n + (x.e - x.s), 0);
  if (total < MIN) return [];
  const recorded = Date.now();
  const made = segs.filter((x) => x.e > x.s).map((x) => ({
    id: uid(), start: x.s, end: x.e, act: t.act, src: 'timer', session: t.id, unconfirmed: true, at: recorded,
  }));
  state.entries.push(...made);
  return made;
}

/** Instant at which the planned duration was reached (for "ferma all'ora prevista"). */
export function plannedReachedAt(t) {
  if (!t) return null;
  let left = t.plannedMin * MIN;
  for (const x of t.segments) {
    if (x.e - x.s >= left) return x.s + left;
    left -= x.e - x.s;
  }
  return t.since != null ? t.since + left : null;
}

/** Quick correction after a session: confirm, change the activity, or discard it. */
export function settleSession(state, sessionId, { act = null, discard = false } = {}) {
  if (discard) { state.entries = state.entries.filter((x) => x.session !== sessionId); return; }
  for (const x of state.entries) {
    if (x.session === sessionId) { if (act) x.act = act; delete x.unconfirmed; }
  }
}

/** Keeps only the first `minutes` of a recorded session (e.g. "I stopped earlier than the timer"). */
export function trimSession(state, sessionId, minutes) {
  let left = Math.max(0, minutes) * MIN;
  const own = state.entries.filter((x) => x.session === sessionId).sort((a, b) => a.start - b.start);
  const keep = new Set();
  for (const x of own) {
    if (left <= 0) continue;
    if (x.end - x.start > left) x.end = x.start + left;
    left -= x.end - x.start;
    keep.add(x.id);
  }
  state.entries = state.entries.filter((x) => x.session !== sessionId || keep.has(x.id));
}

export function unconfirmedSessions(state) {
  const by = new Map();
  for (const x of state.entries) {
    if (x.src === 'timer' && x.unconfirmed) {
      const s = by.get(x.session) || { session: x.session, act: x.act, start: x.start, end: x.end, minutes: 0 };
      s.start = Math.min(s.start, x.start); s.end = Math.max(s.end, x.end); s.minutes += (x.end - x.start) / MIN;
      by.set(x.session, s);
    }
  }
  return [...by.values()].sort((a, b) => a.start - b.start);
}
