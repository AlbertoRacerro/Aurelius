// Reminders for the push worker: one at the end of every planned block (linking to its accounting) and one
// when a running focus timer reaches its planned length. The worker only stores and sends these; the app
// re-sends the whole list whenever the plan or the timer changes, so the worker never has to know the plan.

import { occurrencesBetween } from './schedule.js';
import { addDays, hm, partsAt } from './time.js';
import { actById } from './stats.js';
import { endsAt } from './timer.js';

export const HORIZON_DAYS = 7;

/** Short stable id for an occurrence (the worker limits ids to 64 URL-safe characters). */
export function reminderId(occ) {
  return `b${occ.startMs.toString(36)}${String(occ.block.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)}`;
}

export function reminderItems(state, now, baseUrl, horizonDays = HORIZON_DAYS) {
  const tz = state.settings.tz;
  const A = actById(state);
  const today = partsAt(now, tz).date;
  const occs = occurrencesBetween(state, addDays(today, -1), addDays(today, horizonDays));
  const name = (o) => A[o.act]?.name || o.act;
  const items = [];
  occs.forEach((o, i) => {
    if (o.endMs <= now || o.endMs > now + horizonDays * 864e5) return;
    const nx = occs.slice(i + 1).find((x) => x.startMs >= o.endMs);
    const then = nx && nx.startMs === o.endMs ? ` Ora: ${name(nx)} fino alle ${hm(nx.endMin)}.`
      : nx ? ` Prossimo: ${name(nx)} alle ${hm(nx.startMin)}.` : '';
    items.push({
      id: reminderId(o), at: o.endMs, title: `Finito: ${name(o)}`,
      body: `${o.block.start}–${o.block.end}. Com'è andata?${then}`,
      url: `${baseUrl}?occ=${encodeURIComponent(o.id)}`,
    });
  });
  const t = state.timer;
  const end = endsAt(t, now);
  if (t && end && end > now) {
    items.push({ id: 'timer', at: end, title: `Focus finito: ${A[t.act]?.name || t.act}`,
      body: `${t.plannedMin}' completati. Conferma la sessione.`, url: `${baseUrl}?timer=1` });
  }
  return items;
}
