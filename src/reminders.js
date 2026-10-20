import { ideaReminders } from './ideas.js';
// Reminders for the push worker: one at the end of every planned block (linking to its accounting) and one
// when a running focus timer reaches its planned length. The worker only stores and sends these; the app
// re-sends the whole list whenever the plan or the timer changes, so the worker never has to know the plan.

import { occurrencesBetween } from './schedule.js';
import { addDays, hm, partsAt, weekday, instantOf, parseHM } from './time.js';
import { actById } from './stats.js';
import { endsAt } from './timer.js';
import { reflectionForDate } from './reflections.js';
import { choiceForPresence, togetherToday, suggestionFor, SLOTS } from './care-moments.js';

export const HORIZON_DAYS = 7;

/** Short stable id for an occurrence (the worker limits ids to 64 URL-safe characters). */
export function reminderId(occ) {
  return `b${occ.startMs.toString(36)}${String(occ.block.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)}`;
}

export function reminderItems(state, now, baseUrl, horizonDays = HORIZON_DAYS, privateRelationship = null, ideas = []) {
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
  // Private routine settings stay in the device state; the push worker only sees due messages.
  const h = state.settings.habits || {};
  const within = (at) => at > now && at <= now + horizonDays * 864e5;
  const addHabit = (date, minute, code, title, body, url = baseUrl) => {
    const at = instantOf(date, minute, tz);
    if (!within(at)) return;
    if (['personalPause','careMoment'].includes(code) && occs.some(o=>o.startMs<=at&&o.endMs>at&&['study','lesson'].includes(A[o.act]?.kind))) return;
    items.push({ id: `h${at.toString(36)}_${code}`, at, title, body, url });
  };
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(today, i);
    const qTime = parseHM(h.quote?.time);
    if (h.quote?.enabled && qTime != null && qTime < 1440) {
      const q = reflectionForDate(date);
      addHabit(date, qTime, 'quote', 'Pensiero del mattino',
        'L’edizione di oggi ti aspetta: apri il pensiero del mattino.', `${baseUrl}?edition=${date}#rituali`);
    }
    // The couple reminder is only scheduled when TODAY'S company has been expressly selected.
    // Never send bleeding dates, pills, cycle labels or other health data to the worker.
    const presence = state.settings.carePresence;
    if (date === today && h.care?.enabled && togetherToday(presence, date)) {
      const minuteNow = partsAt(now, tz).minute;
      let choice = choiceForPresence(presence, date, privateRelationship,
        state.settings.careDays || [], minuteNow);
      let slot = choice && SLOTS.find(x => x.id === choice.slot);
      // Try another expressly confirmed slot when the first lies inside study/lesson.
      while(slot && occs.some(o=>o.startMs<=instantOf(date,slot.minute,tz)&&o.endMs>instantOf(date,slot.minute,tz)&&['study','lesson'].includes(A[o.act]?.kind))){
        choice=choiceForPresence(presence,date,privateRelationship,state.settings.careDays||[],slot.minute);
        slot=choice&&SLOTS.find(x=>x.id===choice.slot);
      }
      if (slot && choice.moment) {
        addHabit(date, slot.minute, 'careMoment', 'Una piccola attenzione',
          choice.moment.text, `${baseUrl}#rituali`);
      }
    }
    // A self-care nudge only three afternoons a week, regardless of relationship status.
    // If they are together in the afternoon, avoid two overlapping reminders.
    if (h.personalPause?.enabled && [0, 2, 4].includes(weekday(date))
        && !(date === today && togetherToday(presence, date) && presence.slots.includes('afternoon'))) {
      const minute = parseHM(h.personalPause.time);
      const ord = Math.floor(Date.parse(date + 'T00:00:00Z') / 864e5 / 3);
      const personal = suggestionFor(date, 'afternoon', 'solo', 'any', ord);
      if (minute != null && minute < 1440 && personal)
        addHabit(date, minute, 'personalPause', 'Pausa per te',
          personal.text, `${baseUrl}#rituali`);
    }
    if (weekday(date) < 5 && h.bottle?.enabled) {
      const at = parseHM(h.bottle.time);
      if (at != null && at < 1440) addHabit(date, at, 'bottle', 'Porta la borraccia',
        'Prima di uscire: riempi e porta con te una bottiglia grande d’acqua.');
    }
    if (h.water?.enabled) {
      const from = parseHM(h.water.from), to = parseHM(h.water.to);
      const every = Number(h.water.everyMinutes);
      if (from != null && to != null && from <= to && to < 1440
          && Number.isInteger(every) && every >= 60 && every <= 360) {
        for (let minute = from; minute <= to; minute += every) {
          addHabit(date, minute, 'water', 'Bevi acqua',
            'Interrompi per un momento quello che fai e bevi.');
        }
      }
    }
    for (const [key, title, body] of [
      ['shutdown', 'Chiudi il lavoro', 'Niente nuovi task: domani serve lucidità, non un’altra ora di lavoro.'],
      ['bedtime', 'È ora di dormire', 'Prepara tutto e vai a letto entro le 22:30.'],
    ]) {
      if (!h[key]?.enabled) continue;
      const at = parseHM(h[key].time);
      if (at != null && at < 1440) addHabit(date, at, key, title, body);
    }
  }
  for(const item of ideaReminders(state,ideas,occs,now,baseUrl)){if(items.length<400&&!items.some(x=>Math.abs(x.at-item.at)<60000))items.push(item);}
  return items;
}
