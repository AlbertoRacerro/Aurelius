// Aurelius UI. State lives in localStorage (store.js); every change goes through commit(), which saves first
// and then repaints. The clock is Date.now() on every paint: intervals only trigger repaints.

import { load, save, exportBackup, importBackup, LEGACY_KEY } from './store.js';
import { SOURCE_ISSUES, STUDY_SUBJECTS } from './model.js';
import { addDays, dur, hm, isoWeek, longDate, parseHM, partsAt, weekStart, GIORNI_BREVI, instantOf, weekday } from './time.js';
import { dayPlan, occurrences, occurrencesBetween, nowAndNext, findOccurrence, validateBlocks } from './schedule.js';
import * as L from './ledger.js';
import * as T from './timer.js';
import { actById, weeklyReview, legacyHistory } from './stats.js';
import { reminderItems } from './reminders.js';
import { applyPlanPatch } from './plan-import.js';
import { PRIORITIES, normalizeTaskInput } from './todos.js';
import { renderTodos } from './todo-view.js';
import * as P from './push.js';
import { APP_VERSION } from './config.js';

const MIN = 60000;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();

let { state, notice } = load(localStorage);
// First run: persist at once so the adoption of summer data and trackFrom are fixed from now on.
if (!localStorage.getItem('aurelius.v2')) save(localStorage, state);
const ui = { tab: 'ora', sheet: null, planDate: null, statsDate: null, todoFilter: 'open', lastPaint: 0, lastEnded: null };

// ---------- persistence ----------

function persist() {
  try { save(localStorage, state); } catch (err) { toast(`Salvataggio non riuscito: ${err.message}. Esporta un backup.`); }
}

function commit(fn, { repaint = true, resync = false } = {}) {
  fn(state);
  persist();
  if (resync) scheduleSync();
  if (repaint) render();
}

function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- helpers ----------

const A = () => actById(state);
const tz = () => state.settings.tz;
const today = () => partsAt(now(), tz()).date;
const actName = (id) => A()[id]?.name || id || '—';
const actColor = (id) => A()[id]?.color || '#999';
const sw = (id) => `<span class="sw" style="background:${esc(actColor(id))}"></span>`;
const studyActs = () => state.activities.filter((a) => a.study && !a.generic);
const isGeneric = (id) => !!A()[id]?.generic;

function clock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}
function until(ms) {
  const m = Math.ceil(ms / MIN);
  return m <= 0 ? 'ora' : dur(m);
}
function timeOf(ms) { return hm(partsAt(ms, tz()).minute); }

function actOptions(selected, { studyFirst = true } = {}) {
  const acts = state.activities.slice().sort((a, b) => (studyFirst ? (b.study - a.study) : 0));
  return acts.map((a) => `<option value="${esc(a.id)}"${a.id === selected ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
}

function recentOccurrences(days = 7) {
  const t = today();
  return occurrencesBetween(state, addDays(t, -days), t);
}

function pendingList() {
  return L.pending(state, recentOccurrences(), now()).sort((a, b) => b.endMs - a.endMs);
}

function lastStudy() {
  const e = state.entries.filter((x) => A()[x.act]?.study && !A()[x.act]?.generic).sort((a, b) => b.at - a.at)[0];
  return e ? e.act : STUDY_SUBJECTS[0];
}

function statusOf(occ) {
  const a = state.accounts[occ.id];
  if (a) return a.status;
  if (occ.endMs > now()) return occ.startMs <= now() ? 'cur' : 'future';
  if (occ.endMs <= (state.settings.trackFrom || 0)) return 'before';
  return L.availableMinutes(state, occ, now()) >= 1 ? 'todo' : 'covered';
}
const STATUS_LABEL = { all: ['✓ fatto', 'ok'], partial: ['◐ in parte', 'part'], other: ['↺ altro', 'part'],
  unknown: ['? non so', 'unk'], todo: ['da registrare', 'todo'], covered: ['✓ timer', 'ok'] };

// ---------- Now ----------

function viewNow() {
  const t = now();
  const { current, next } = nowAndNext(state, t);
  const out = [];
  out.push(`<h1>${esc(longDate(today()))} · ${timeOf(t)}</h1>`);

  // Unsettled focus sessions first, then blocks awaiting accounting.
  for (const s of T.unconfirmedSessions(state)) {
    out.push(`<div class="card alert" data-session="${esc(s.session)}">
      <div class="row">${sw(s.act)}<b class="grow">Focus ${esc(actName(s.act))} · ${dur(s.minutes)}</b><span class="mut small">${timeOf(s.start)}–${timeOf(s.end)}</span></div>
      <p class="mut small" style="margin:6px 0 10px">Registrata dal timer. È giusto?</p>
      <div class="btns"><button class="btn pri" data-act="session-ok">Sì, giusto</button>
      <button class="btn" data-act="session-edit">Correggi</button></div></div>`);
  }
  const pend = pendingList();
  if (pend.length) {
    out.push(`<h2>Da registrare (${pend.length})</h2>`);
    for (const o of pend.slice(0, 3)) out.push(accountCard(o));
    if (pend.length > 3) {
      out.push(`<div class="btns" style="margin-bottom:10px"><button class="btn sm ghost" data-act="pending-all">Vedi tutti (${pend.length})</button>
        <button class="btn sm ghost" data-act="pending-unknown">Segna i più vecchi come “non so”</button></div>`);
    }
  }

  // What now.
  out.push(`<h2>Adesso</h2>`);
  if (current) {
    const total = current.endMs - current.startMs, done = t - current.startMs;
    const note = current.block.note ? `<div class="mut small" style="margin-top:6px">${esc(current.block.note)}</div>` : '';
    const prov = current.block.provisional ? ' <span class="tag warn">provvisorio</span>' : '';
    out.push(`<div class="card now" data-occ="${esc(current.id)}">
      <div class="row">${sw(current.act)}<span class="when">${esc(current.block.start)}–${esc(current.block.end)}${prov}</span></div>
      <div class="what">${esc(actName(current.act))}</div>
      <div class="left">mancano ${until(current.endMs - t)}</div>
      <div class="bar"><i style="width:${Math.min(100, (100 * done) / total).toFixed(1)}%"></i></div>${note}</div>`);
  } else {
    out.push(`<div class="card now"><div class="what" style="font-size:24px">Niente in programma</div>
      <div class="when">${next ? `Prossimo blocco tra ${until(next.startMs - t)}` : 'Nessun blocco nei prossimi giorni'}</div></div>`);
  }
  if (next) {
    const nd = partsAt(next.startMs, tz()).date;
    out.push(`<div class="card soft next">${sw(next.act)}<span class="grow"><b>Dopo:</b> ${esc(actName(next.act))}</span>
      <span class="mut small">${nd !== today() ? GIORNI_BREVI[weekday(nd)] + ' ' : ''}${esc(next.block.start)}–${esc(next.block.end)}</span></div>`);
  }

  out.push(viewTimer(current));

  // Today.
  const occs = occurrences(state, today());
  if (occs.length) {
    out.push(`<h2>Oggi</h2><ul class="day card">`);
    for (const o of occs) {
      const st = statusOf(o);
      const cls = o === current || o.id === current?.id ? 'cur' : o.endMs <= t ? 'past' : '';
      const lab = STATUS_LABEL[st];
      out.push(`<li class="${cls}"><button class="li" data-act="open-occ" data-occ="${esc(o.id)}">
        <span class="t">${esc(o.block.start)}–${esc(o.block.end)}</span>${sw(o.act)}<span class="grow">${esc(actName(o.act))}</span>
        ${lab ? `<span class="st ${lab[1]}">${lab[0]}</span>` : ''}</button></li>`);
    }
    out.push(`</ul>`);
  }
  out.push(`<div class="btns"><button class="btn ghost" data-act="manual">+ Registra altro tempo</button></div>`);
  return out.join('');
}

function accountCard(o) {
  const avail = Math.round(L.availableMinutes(state, o, now())); // label only; the split editor uses whole minutes
  const generic = isGeneric(o.act);
  const d = partsAt(o.startMs, tz()).date;
  const when = d === today() ? '' : `${GIORNI_BREVI[weekday(d)]} ${Number(d.slice(8))} · `;
  const yes = generic
    ? `<div class="mut small" style="margin:8px 0 6px">Sì, tutto (${dur(avail)}) su:</div><div class="chips">${studyActs()
      .map((a) => `<button class="chip" data-act="acc-all" data-subj="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>`
    : `<button class="btn pri big" data-act="acc-all" style="margin-top:10px">Sì, tutto · ${dur(avail)}</button>`;
  return `<div class="card alert" data-occ="${esc(o.id)}">
    <div class="row">${sw(o.act)}<b class="grow">${esc(actName(o.act))}</b><span class="mut small">${when}${esc(o.block.start)}–${esc(o.block.end)}</span></div>
    ${yes}
    <div class="btns" style="margin-top:8px"><button class="btn" data-act="acc-partial">In parte</button>
    <button class="btn" data-act="acc-other">Altro</button><button class="btn ghost" data-act="acc-unknown">Non so</button></div></div>`;
}

function viewTimer(current) {
  const t = state.timer;
  const nowMs = now();
  if (t) {
    const running = t.since != null;
    const left = t.plannedMin * MIN - T.elapsedMs(t, nowMs);
    return `<h2>Focus</h2><div class="card timer${running ? '' : ' paused'}">
      <div class="row">${sw(t.act)}<b class="grow">${esc(actName(t.act))}</b><span class="mut small">${t.plannedMin}' · dalle ${timeOf(t.startedAt)}</span></div>
      <div class="clock" id="tclock">${clock(left)}</div>
      <div class="btns">${running ? '<button class="btn" data-act="t-pause">Pausa</button>' : '<button class="btn pri" data-act="t-resume">Riprendi</button>'}
      <button class="btn" data-act="t-stop">Stop e registra</button><button class="btn ghost bad" data-act="t-cancel">Annulla</button></div></div>`;
  }
  const subj = ui.timerAct || (current && A()[current.act]?.study && !isGeneric(current.act) ? current.act : lastStudy());
  const mins = ui.timerMin || state.settings.focusMinutes;
  return `<h2>Focus</h2><div class="card">
    <div class="chips">${studyActs().map((a) => `<button class="chip${a.id === subj ? ' on' : ''}" data-act="t-subj" data-subj="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>
    <div class="chips" style="margin-top:8px">${state.settings.focusChoices.map((m) => `<button class="chip${m === mins ? ' on' : ''}" data-act="t-min" data-min="${m}">${m}'</button>`).join('')}</div>
    <button class="btn pri big" style="margin-top:12px" data-act="t-start" data-subj="${esc(subj)}" data-min="${mins}">▶ Avvia ${esc(actName(subj))} · ${mins}'</button></div>`;
}

// ---------- Plan ----------

function viewPlan() {
  const d = ui.planDate || today();
  const ws = weekStart(d);
  const out = [];
  out.push(`<div class="row"><h1 class="grow" style="margin:0">Settimana ${esc(isoWeek(d).slice(6))} · ${Number(ws.slice(8))}/${Number(ws.slice(5, 7))}</h1>
    <button class="btn sm" data-act="plan-week" data-d="-7">‹</button><button class="btn sm" data-act="plan-today">Oggi</button><button class="btn sm" data-act="plan-week" data-d="7">›</button></div>`);
  out.push(`<div class="week">`);
  for (let i = 0; i < 7; i++) {
    const di = addDays(ws, i);
    const src = dayPlan(state, di).source;
    out.push(`<button class="${di === d ? 'on' : ''}${di === today() ? ' today' : ''}" data-act="plan-day" data-date="${di}">${GIORNI_BREVI[i]}<b>${Number(di.slice(8))}</b><i class="${src !== 'template' ? 'ov' : ''}"></i></button>`);
  }
  out.push(`</div>`);
  const { source } = dayPlan(state, d);
  const srcLabel = { template: 'Modello settimanale', week: 'Modificato solo questa settimana', date: 'Modificato solo questa data' }[source];
  out.push(`<div class="row" style="margin-bottom:8px"><b class="grow">${esc(longDate(d))}</b><span class="tag${source !== 'template' ? ' warn' : ''}">${srcLabel}</span></div>`);
  const occs = occurrences(state, d);
  if (!occs.length) out.push(`<div class="card soft mut">Nessun blocco.</div>`);
  else {
    out.push(`<ul class="day card">`);
    for (const o of occs) {
      out.push(`<li><span class="t">${esc(o.block.start)}–${esc(o.block.end)}</span>${sw(o.act)}<span class="grow">${esc(actName(o.act))}
        ${o.block.provisional ? '<span class="tag warn">provv.</span>' : ''}${o.block.note ? `<div class="mut small">${esc(o.block.note)}</div>` : ''}</span></li>`);
    }
    out.push(`</ul>`);
  }
  out.push(`<div class="btns"><button class="btn pri" data-act="edit-day" data-date="${d}">Modifica</button>
    ${source !== 'template' ? `<button class="btn" data-act="reset-day" data-date="${d}">Torna al modello</button>` : ''}</div>`);
  const open = SOURCE_ISSUES.filter((x) => !state.issuesResolved[x.id]);
  if (open.length) {
    out.push(`<h2>Da chiarire nel piano (${open.length})</h2>`);
    out.push(`<p class="mut small" style="margin-top:0">Il piano iniziale viene dalle affermazioni del semestre, che indicano la griglia come provvisoria. Questi punti non sono stati decisi al posto tuo.</p>`);
    for (const x of open) {
      out.push(`<div class="card soft small"><div>${esc(x.text)}</div><div class="btns" style="margin-top:8px"><button class="btn sm" data-act="issue-ok" data-id="${esc(x.id)}">Risolto</button></div></div>`);
    }
  }
  return out.join('');
}

// ---------- Stats ----------

function viewStats() {
  const d = ui.statsDate || today();
  const r = weeklyReview(state, d, now());
  const ws = weekStart(d);
  const h = (m) => (m / 60).toFixed(1).replace('.', ',') + ' h';
  const out = [];
  out.push(`<div class="row"><h1 class="grow" style="margin:0">Settimana ${Number(ws.slice(8))}/${Number(ws.slice(5, 7))}–${Number(addDays(ws, 6).slice(8))}/${Number(addDays(ws, 6).slice(5, 7))}</h1>
    <button class="btn sm" data-act="stats-week" data-d="-7">‹</button><button class="btn sm" data-act="stats-week" data-d="7">›</button></div>`);
  const tg = r.target;
  const max = Math.max(tg.stretch * 1.1, tg.hours);
  const pct = (x) => `${Math.min(100, (100 * x) / max).toFixed(1)}%`;
  out.push(`<div class="card"><div class="row"><b class="grow">Studio attivo ${h(r.actualStudy)}</b><span class="tag">${esc(tg.level)}</span></div>
    <div class="target"><i style="width:${pct(tg.hours)}"></i>
    <u style="left:${pct(tg.floor)}"><span>${tg.floor}h</span></u><u style="left:${pct(tg.targetMin)}"><span>${tg.targetMin}–${tg.targetMax}h</span></u><u style="left:${pct(tg.stretch)}"><span>${tg.stretch}h</span></u></div>
    <div class="mut small">Lezioni escluse. Pianificato: ${h(r.plannedStudy)}. Target provvisori dalle affermazioni.</div></div>`);
  out.push(`<div class="kpis">
    <div class="kpi"><b>${h(r.actualStudy)}</b><span>studio registrato</span></div>
    <div class="kpi"><b>${h(r.plannedStudy)}</b><span>studio pianificato</span></div>
    <div class="kpi"><b>${h(r.breaks)}</b><span>pause</span></div>
    <div class="kpi"><b>${h(r.unaccounted)}</b><span>non registrato (non “perso”)</span></div>
    <div class="kpi"><b>${r.gymSessions}/${r.gymTarget}</b><span>palestra</span></div>
    <div class="kpi"><b>${r.pendingCount}</b><span>blocchi da registrare</span></div></div>`);

  // Daily study bars by subject.
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const top = Math.max(60, ...days.map((x) => r.daily[x]?.study || 0));
  out.push(`<h2>Studio per giorno</h2><div class="card"><div class="days">${days.map((x) => {
    const by = r.daily[x]?.byAct || {};
    return `<div class="col">${Object.entries(by).filter(([id]) => A()[id]?.study).map(([id, m]) =>
      `<i style="height:${((100 * m) / top).toFixed(1)}%;background:${esc(actColor(id))}" title="${esc(actName(id))} ${dur(m)}"></i>`).join('')}</div>`;
  }).join('')}</div><div class="dlab">${days.map((x, i) => `<span>${GIORNI_BREVI[i]}<br>${r.daily[x]?.study ? dur(r.daily[x].study) : ''}</span>`).join('')}</div></div>`);

  // Subjects.
  const ids = [...new Set([...Object.keys(r.plannedBy), ...Object.keys(r.actualBy)])]
    .sort((a, b) => (A()[b]?.study - A()[a]?.study) || ((r.actualBy[b] || 0) - (r.actualBy[a] || 0)));
  out.push(`<h2>Per attività</h2><div class="card"><table class="t"><tr><th>Attività</th><th>Fatto</th><th>Piano</th></tr>${ids.map((id) =>
    `<tr><td>${sw(id)} ${esc(actName(id))}</td><td>${r.actualBy[id] ? dur(r.actualBy[id]) : '–'}</td><td class="mut">${r.plannedBy[id] ? dur(r.plannedBy[id]) : '–'}</td></tr>`).join('')}</table>
    <div class="mut small" style="margin-top:6px">“Studio (materia da scegliere)” nel piano diventa la materia indicata quando confermi.</div></div>`);

  // Review.
  const lines = [];
  lines.push(`Studio attivo ${h(r.actualStudy)} (${tg.level}; minimo ${tg.floor} h, target ${tg.targetMin}–${tg.targetMax} h).`);
  if (r.subjects.length) lines.push(`Per materia: ${r.subjects.map((s) => `${s.name} ${dur(s.minutes)}`).join(', ')}.`);
  if (r.behind.length) lines.push(`Sotto il piano: ${r.behind.map((s) => `${s.name} ${dur(s.actual)}/${dur(s.planned)}`).join(', ')}.`);
  lines.push(`Palestra ${r.gymSessions}/${r.gymTarget}. Non registrato ${h(r.unaccounted)}${r.pendingCount ? `, ${r.pendingCount} blocchi ancora da registrare` : ''}.`);
  if (r.backlogOpen.length) lines.push(`Backlog aperto: ${r.backlogOpen.length}.`);
  out.push(`<h2>Review della settimana</h2><div class="card small">${lines.map((x) => `<p style="margin:0 0 6px">${esc(x)}</p>`).join('')}</div>`);

  // Task management now has its own prominent navigation tab.
  out.push(`<div class="card soft small"><b>Da fare:</b> ${state.backlog.filter((x) => !x.done).length} attività aperte.
    <button class="btn sm" data-act="goto-todos">Apri la checklist</button></div>`);

  // History.
  const from = instantOf(ws, 0, tz()), to = instantOf(addDays(ws, 7), 0, tz());
  const es = state.entries.filter((x) => x.end > from && x.start < to).sort((a, b) => b.start - a.start);
  out.push(`<h2>Registro (${es.length})</h2><div class="card">${es.length ? '' : '<div class="mut small">Niente registrato in questa settimana.</div>'}<ul class="day">${es.slice(0, 80).map((x) => {
    const dd = partsAt(x.start, tz()).date;
    return `<li><span class="t">${GIORNI_BREVI[weekday(dd)]} ${timeOf(x.start)}–${timeOf(x.end)}</span>${sw(x.act)}<span class="grow">${esc(actName(x.act))}
      <span class="mut small">${{ confirm: 'confermato', split: 'diviso', timer: 'timer', manual: 'manuale' }[x.src] || ''}${x.unconfirmed ? ' · da confermare' : ''}</span></span>
      <button class="x" data-act="entry-del" data-id="${esc(x.id)}" aria-label="Elimina">×</button></li>`;
  }).join('')}</ul><button class="btn sm" data-act="manual" style="margin-top:6px">+ Registra tempo</button></div>`);

  const lh = legacyHistory(state);
  if (lh.rows.length) {
    out.push(`<h2>Estate 2026</h2><div class="card small">${lh.rows.length} giorni registrati, ${lh.total.toFixed(1).replace('.', ',')} h in totale${lh.sessions ? `, ${lh.sessions} sessioni timer` : ''}.
      <span class="mut">Conservati intatti; la vecchia app resta su <a href="legacy/estate-2026.html">legacy/estate-2026.html</a>.</span></div>`);
  }
  return out.join('');
}

// ---------- More ----------

function viewMore() {
  const s = state.settings;
  const sup = P.support();
  const api = P.apiBase(state);
  const out = [];
  out.push(`<h1>Altro</h1>`);
  // Notifications.
  let status;
  if (s.push) status = `Attive su questo iPhone dal ${new Date(s.push.at).toLocaleDateString('it-IT')}.${s.push.lastSync ? ` Ultimo aggiornamento promemoria: ${timeOf(s.push.lastSync)}.` : ''}${s.push.error ? ` <span class="err">${esc(s.push.error)}</span>` : ''}`;
  else if (!api) status = 'Server notifiche non ancora configurato: i promemoria funzionano solo con l\'app aperta.';
  else if (sup.ios && !sup.standalone) status = 'Per ricevere notifiche ad app chiusa: Condividi › Aggiungi alla schermata Home, poi apri Aurelius dall\'icona e torna qui.';
  else if (!sup.push || !sup.sw) status = 'Questo browser non supporta le notifiche push web (serve iOS 16.4 o successivo, app aperta dalla Home).';
  else if (sup.permission === 'denied') status = 'Notifiche negate: riattivale in Impostazioni › Notifiche › Aurelius.';
  else status = 'Non attive.';
  out.push(`<h2>Notifiche</h2><div class="card"><div class="small">${status}</div>
    <div class="btns" style="margin-top:10px">${s.push
      ? '<button class="btn" data-act="push-test">Invia prova</button><button class="btn" data-act="push-sync">Aggiorna promemoria</button><button class="btn ghost bad" data-act="push-off">Disattiva</button>'
      : `<button class="btn pri" data-act="push-on"${!api || !sup.push || !sup.sw || (sup.ios && !sup.standalone) ? ' disabled' : ''}>Attiva notifiche</button>`}</div>
    <p class="mut small">Un promemoria alla fine di ogni blocco e alla fine del focus. La consegna dipende da iOS e dalla rete: può arrivare con qualche secondo o minuto di ritardo, e le modalità Full immersion la silenziano se Aurelius non è tra le app consentite.</p>
    <details><summary class="small mut">Impostazioni avanzate</summary>
      <label class="small">Server notifiche<input type="url" id="f-api" value="${esc(s.pushApi)}" placeholder="${esc(api || 'https://…workers.dev')}"></label>
      <label class="small">Codice di registrazione (se richiesto)<input type="text" id="f-enroll" autocomplete="off"></label>
      <label class="small">Canale ntfy di riserva (facoltativo)<input type="text" id="f-ntfy" value="${esc(s.ntfyTopic)}" placeholder="nome-canale-segreto"></label>
      <div class="btns" style="margin-top:8px"><button class="btn sm" data-act="adv-save">Salva</button></div></details></div>`);
  // Daily reminders. These preferences are local; only the upcoming messages go to the push worker.
  const h = s.habits;
  out.push(`<h2>Promemoria quotidiani</h2><div class="card">
    <p class="mut small">Notifiche programmate sul dispositivo (richiedono Web Push attivo per arrivare ad app chiusa).</p>
    <label class="opt"><input type="checkbox" id="h-bottle-on"${h.bottle.enabled ? ' checked' : ''}> Borraccia prima delle lezioni (lun–ven)</label>
    <label class="small">Orario<input type="time" id="h-bottle-at" value="${esc(h.bottle.time)}"></label>
    <label class="opt"><input type="checkbox" id="h-water-on"${h.water.enabled ? ' checked' : ''}> Bere acqua ogni 2 ore (tutti i giorni)</label>
    <div class="row">
      <label class="small grow">Dalle<input type="time" id="h-water-from" value="${esc(h.water.from)}"></label>
      <label class="small grow">Alle<input type="time" id="h-water-to" value="${esc(h.water.to)}"></label>
    </div>
    <label class="opt"><input type="checkbox" id="h-shutdown-on"${h.shutdown.enabled ? ' checked' : ''}> Chiusura del lavoro</label>
    <label class="small">Orario<input type="time" id="h-shutdown-at" value="${esc(h.shutdown.time)}"></label>
    <label class="opt"><input type="checkbox" id="h-bedtime-on"${h.bedtime.enabled ? ' checked' : ''}> Prepararsi per dormire (a letto alle 22:30)</label>
    <label class="small">Orario<input type="time" id="h-bedtime-at" value="${esc(h.bedtime.time)}"></label>
    <div class="btns"><button class="btn pri" data-act="habits-save">Salva promemoria</button></div></div>`);
  // Focus.
  out.push(`<h2>Focus</h2><div class="card"><div class="small mut">Durata predefinita</div><div class="chips" style="margin-top:6px">${s.focusChoices.map((m) =>
    `<button class="chip${m === s.focusMinutes ? ' on' : ''}" data-act="focus-default" data-min="${m}">${m}'</button>`).join('')}</div>
    <label class="opt"><input type="checkbox" data-act="sound"${s.sound ? ' checked' : ''}> Suono a fine blocco/focus (app aperta)</label></div>`);
  // Data.
  const lastB = state.lastBackupAt ? new Date(state.lastBackupAt).toLocaleString('it-IT') : 'mai';
  out.push(`<h2>Dati</h2><div class="card"><div class="small">Tutto è salvato solo su questo dispositivo. Ultimo backup: ${esc(lastB)}.</div>
    <div class="btns" style="margin-top:10px"><button class="btn pri" data-act="backup">Esporta backup</button><button class="btn" data-act="restore">Ripristina…</button><button class="btn" data-act="plan-import">Importa piano personale…</button></div>
    <input type="file" id="f-restore" accept=".json,application/json,text/plain" hidden>
    <input type="file" id="f-plan" accept=".json,application/json" hidden>
    <p class="mut small">Il ripristino accetta anche i backup dell'app estiva. Lo storico dell'estate non viene mai cancellato.${localStorage.getItem(LEGACY_KEY) ? ' I dati estivi originali sono ancora intatti.' : ''}</p></div>`);
  out.push(`<p class="mut small" style="text-align:center">Aurelius ${APP_VERSION} · <a href="legacy/estate-2026.html">app estate 2026</a></p>`);
  return out.join('');
}

// ---------- Sheets ----------

function openSheet(sheet) { ui.sheet = sheet; renderSheet(); }
function closeSheet() { ui.sheet = null; renderSheet(); }

function renderSheet() {
  const el = $('#sheet');
  const s = ui.sheet;
  if (!s) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  let body = '';
  if (s.type === 'split') body = sheetSplit(s);
  else if (s.type === 'occ') body = sheetOcc(s);
  else if (s.type === 'edit') body = sheetEdit(s);
  else if (s.type === 'manual') body = sheetManual(s);
  else if (s.type === 'session') body = sheetSession(s);
  else if (s.type === 'pending') body = sheetPending();
  else if (s.type === 'backlog') body = sheetBacklog(s);
  el.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${body}</div>`;
}

function sheetSplit(s) {
  const occ = findOccurrence(state, s.occId);
  if (!occ) return `<p>Blocco non trovato.</p><button class="btn" data-act="close">Chiudi</button>`;
  const avail = Math.floor(L.availableMinutes(state, occ, now()));
  const used = s.rows.reduce((n, r) => n + (Number(r.minutes) || 0), 0);
  return `<h3>${s.mode === 'other' ? 'Cosa hai fatto?' : 'Quanto hai fatto?'}</h3>
    <div class="mut small">${esc(actName(occ.act))} · ${esc(occ.block.start)}–${esc(occ.block.end)} · ${dur(avail)} disponibili</div>
    <div id="rows">${s.rows.map((r, i) => `<div class="alloc" data-i="${i}"><select data-f="act">${actOptions(r.act)}</select>
      <div class="step"><button data-act="step" data-d="-15" data-i="${i}">−</button><input type="number" inputmode="numeric" min="0" step="5" data-f="min" value="${r.minutes}"><button data-act="step" data-d="15" data-i="${i}">+</button></div></div>`).join('')}</div>
    <div class="chips" style="margin:10px 0">${[...studyActs(), A().pausa, A().altro].filter(Boolean).map((a) =>
      `<button class="chip" data-act="split-add" data-subj="${esc(a.id)}">+ ${esc(a.name)}</button>`).join('')}</div>
    <div class="small">Restano <span class="remain${used > avail ? ' over' : ''}" id="remain">${dur(avail - used)}</span> non registrati (né studio né perso).</div>
    <div class="err" id="err"></div>
    <div class="btns" style="margin-top:12px"><button class="btn pri" data-act="split-save">Salva</button><button class="btn ghost" data-act="close">Annulla</button></div>`;
}

function sheetOcc(s) {
  const occ = findOccurrence(state, s.occId);
  if (!occ) return `<p>Blocco non trovato.</p><button class="btn" data-act="close">Chiudi</button>`;
  const acc = state.accounts[occ.id];
  const mine = state.entries.filter((x) => x.start < occ.endMs && x.end > occ.startMs);
  return `<h3>${esc(actName(occ.act))}</h3><div class="mut small">${esc(longDate(occ.date))} · ${esc(occ.block.start)}–${esc(occ.block.end)}${occ.block.note ? ' · ' + esc(occ.block.note) : ''}</div>
    ${mine.length ? `<ul class="day card" style="margin-top:10px">${mine.map((x) => `<li><span class="t">${timeOf(x.start)}–${timeOf(x.end)}</span>${sw(x.act)}<span class="grow">${esc(actName(x.act))}</span><span class="mut small">${dur((x.end - x.start) / MIN)}</span></li>`).join('')}</ul>` : '<p class="mut small">Nessun tempo registrato in questo blocco.</p>'}
    ${acc ? `<p class="small">Registrato come <b>${esc(STATUS_LABEL[acc.status]?.[0] || acc.status)}</b>.</p>` : ''}
    ${!L.accountable(occ, now()) ? `<p class="mut small">Il blocco finisce alle ${esc(occ.block.end)}: potrai registrarlo allora (per altro tempo usa “Registra altro tempo”).</p>` : ''}
    <div class="btns" style="margin-top:10px">${!L.accountable(occ, now()) ? '' : `${acc ? '<button class="btn" data-act="acc-reopen">Annulla registrazione</button>' : ''}
      ${!acc || acc.status !== 'all' ? '<button class="btn pri" data-act="acc-all-sheet">Sì, tutto</button>' : ''}
      <button class="btn" data-act="acc-partial">In parte</button><button class="btn" data-act="acc-other">Altro</button>`}
      <button class="btn ghost" data-act="close">Chiudi</button></div>`;
}

function sheetEdit(s) {
  const wd = weekday(s.date);
  return `<h3>Modifica ${esc(longDate(s.date))}</h3>
    <div class="small mut" style="margin-top:6px">Applica a</div>
    <label class="opt"><input type="radio" name="scope" value="template"${s.scope === 'template' ? ' checked' : ''}> Ogni ${esc(['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'][wd])} (modello)</label>
    <label class="opt"><input type="radio" name="scope" value="week"${s.scope === 'week' ? ' checked' : ''}> Solo questa settimana</label>
    <label class="opt"><input type="radio" name="scope" value="date"${s.scope === 'date' ? ' checked' : ''}> Solo questa data</label>
    <div id="erows">${s.rows.map((r, i) => `<div class="erow" data-i="${i}">
      <input type="time" data-f="start" value="${esc(r.start)}" aria-label="Inizio"><input type="time" data-f="end" value="${esc(r.end)}" aria-label="Fine">
      <select data-f="act">${actOptions(r.act)}</select><button class="x" data-act="erow-del" data-i="${i}" aria-label="Elimina">×</button>
      <input class="note" type="text" data-f="note" value="${esc(r.note || '')}" placeholder="Nota (facoltativa)"></div>`).join('')}</div>
    <div class="btns" style="margin-top:8px"><button class="btn sm" data-act="erow-add">+ Blocco</button></div>
    ${s.scope === 'template' ? `<div class="small mut" style="margin-top:12px">Copia anche su</div><div class="chips" style="margin-top:6px">${GIORNI_BREVI.map((g, i) => i === wd ? '' :
      `<label class="chip"><input type="checkbox" data-copy="${i}"${s.copy?.includes(i) ? ' checked' : ''} style="margin-right:4px">${g}</label>`).join('')}</div>` : ''}
    <div class="err" id="err">${(s.errors || []).map(esc).join('<br>')}</div>
    <div class="btns" style="margin-top:12px"><button class="btn pri" data-act="edit-save">Salva</button><button class="btn ghost" data-act="close">Annulla</button></div>`;
}

function sheetManual(s) {
  return `<h3>Registra tempo</h3><p class="mut small">Per tempo fuori dal piano o da registrare più tardi. Sostituisce eventuali registrazioni precedenti negli stessi minuti.</p>
    <label class="small">Giorno<input type="date" id="m-date" value="${esc(s.date)}"></label>
    <div class="row" style="margin-top:8px"><label class="small grow">Dalle<input type="time" id="m-start" value="${esc(s.start)}"></label><label class="small grow">Alle<input type="time" id="m-end" value="${esc(s.end)}"></label></div>
    <label class="small" style="display:block;margin-top:8px">Attività<select id="m-act">${actOptions(s.act)}</select></label>
    <div class="err" id="err"></div>
    <div class="btns" style="margin-top:12px"><button class="btn pri" data-act="manual-save">Salva</button><button class="btn ghost" data-act="close">Annulla</button></div>`;
}

function sheetSession(s) {
  const ses = T.unconfirmedSessions(state).find((x) => x.session === s.session);
  if (!ses) return `<p>Sessione già confermata.</p><button class="btn" data-act="close">Chiudi</button>`;
  return `<h3>Correggi la sessione</h3><div class="mut small">${timeOf(ses.start)}–${timeOf(ses.end)} · misurati ${dur(ses.minutes)}</div>
    <label class="small" style="display:block;margin-top:10px">Cosa hai studiato<select id="s-act">${actOptions(ses.act)}</select></label>
    <label class="small" style="display:block;margin-top:8px">Minuti effettivi<input type="number" inputmode="numeric" id="s-min" min="1" max="${Math.round(ses.minutes)}" value="${Math.round(ses.minutes)}"></label>
    <div class="btns" style="margin-top:12px"><button class="btn pri" data-act="session-save">Salva</button><button class="btn bad" data-act="session-discard">Scarta sessione</button><button class="btn ghost" data-act="close">Annulla</button></div>`;
}

function sheetPending() {
  const pend = pendingList();
  return `<h3>Da registrare (${pend.length})</h3>${pend.map(accountCard).join('') || '<p class="mut">Tutto registrato.</p>'}
    <div class="btns"><button class="btn ghost" data-act="close">Chiudi</button></div>`;
}

function sheetBacklog(s) {
  const item = s.id ? state.backlog.find((x) => x.id === s.id) : null;
  if (s.id && !item) return `<p>Attività non trovata.</p><button class="btn" data-act="close">Chiudi</button>`;
  const priority = item?.priority || 'P1';
  return `<h3>${item ? 'Modifica attività' : 'Nuova attività'}</h3>
    <label class="small" for="b-text">Cosa devi fare?
      <textarea id="b-text" rows="3" maxlength="300" placeholder="Descrivi l'attività">${esc(item?.text || '')}</textarea></label>
    <label class="small" for="b-priority">Priorità
      <select id="b-priority">${PRIORITIES.map((p) =>
        `<option value="${p.id}"${priority === p.id ? ' selected' : ''}>${p.id} · ${p.label}</option>`).join('')}</select></label>
    <label class="small" for="b-act">Categoria<select id="b-act">${actOptions(item?.act || 'vita', { studyFirst: false })}</select></label>
    <label class="small" for="b-due">Scadenza (facoltativa)<input type="date" id="b-due" value="${esc(item?.due || '')}"></label>
    <div class="btns" style="margin-top:12px">
      <button class="btn pri" data-act="bl-save">${item ? 'Salva modifiche' : 'Aggiungi'}</button>
      ${item ? `<button class="btn bad" data-act="bl-del" data-id="${esc(item.id)}">Elimina</button>` : ''}
      <button class="btn ghost" data-act="close">Annulla</button></div>`;
}

function readSplitRows() {
  return [...document.querySelectorAll('#rows .alloc')].map((row) => ({
    act: row.querySelector('[data-f=act]').value,
    minutes: Math.max(0, Math.round(Number(row.querySelector('[data-f=min]').value) || 0)),
  }));
}

function updateRemain() {
  const s = ui.sheet;
  const occ = findOccurrence(state, s.occId);
  if (!occ) return;
  s.rows = readSplitRows();
  const avail = Math.floor(L.availableMinutes(state, occ, now()));
  const used = s.rows.reduce((n, r) => n + r.minutes, 0);
  const el = $('#remain');
  el.textContent = dur(avail - used);
  el.classList.toggle('over', used > avail);
}

function readEditRows() {
  // Sheet re-renders must not lose choices made in the form.
  ui.sheet.scope = document.querySelector('input[name=scope]:checked')?.value || ui.sheet.scope;
  ui.sheet.copy = [...document.querySelectorAll('[data-copy]:checked')].map((x) => Number(x.dataset.copy));
  return [...document.querySelectorAll('#erows .erow')].map((row, i) => {
    const prev = ui.sheet.rows[i] || {};
    return { ...prev, start: row.querySelector('[data-f=start]').value, end: row.querySelector('[data-f=end]').value,
      act: row.querySelector('[data-f=act]').value, note: row.querySelector('[data-f=note]').value.trim() };
  });
}

// ---------- actions ----------

function occFrom(el) {
  const id = el.closest('[data-occ]')?.dataset.occ || ui.sheet?.occId;
  return id ? findOccurrence(state, id) : null;
}

function startSplit(occ, mode) {
  const avail = Math.floor(L.availableMinutes(state, occ, now()));
  const prev = state.accounts[occ.id]?.allocations;
  const rows = prev?.length ? prev.map((x) => ({ ...x }))
    : mode === 'partial' ? [{ act: isGeneric(occ.act) ? lastStudy() : occ.act, minutes: Math.max(0, Math.round(avail / 2 / 5) * 5) }] : [];
  openSheet({ type: 'split', occId: occ.id, mode, rows });
}

const actions = {
  'acc-all'(el) {
    const occ = occFrom(el);
    if (!occ) return;
    const act = el.dataset.subj || occ.act;
    commit((s) => L.confirmAll(s, occ, now(), act));
    toast(`Registrato: ${actName(act)}`);
  },
  'acc-all-sheet'(el) {
    const occ = occFrom(el);
    if (!occ) return;
    if (isGeneric(occ.act)) { startSplit(occ, 'partial'); return; }
    commit((s) => L.confirmAll(s, occ, now()));
    closeSheet();
  },
  'acc-partial'(el) { const o = occFrom(el); if (o) startSplit(o, 'partial'); },
  'acc-other'(el) { const o = occFrom(el); if (o) startSplit(o, 'other'); },
  'acc-unknown'(el) {
    const o = occFrom(el);
    if (!o) return;
    commit((s) => L.dismiss(s, o));
    if (ui.sheet?.type === 'pending') renderSheet();
  },
  'acc-reopen'(el) {
    const o = occFrom(el);
    if (!o) return;
    commit((s) => L.reopen(s, o.id));
    renderSheet();
  },
  'open-occ'(el) {
    const occ = findOccurrence(state, el.dataset.occ);
    if (occ) openSheet({ type: 'occ', occId: occ.id });
  },
  'pending-all'() { openSheet({ type: 'pending' }); },
  'pending-unknown'() {
    const pend = pendingList();
    commit((s) => { for (const o of pend.slice(3)) L.dismiss(s, o); });
  },
  step(el) {
    updateRemain();
    const i = Number(el.dataset.i);
    const r = ui.sheet.rows[i];
    r.minutes = Math.max(0, r.minutes + Number(el.dataset.d));
    document.querySelectorAll('#rows .alloc')[i].querySelector('[data-f=min]').value = r.minutes;
    updateRemain();
  },
  'split-add'(el) {
    updateRemain();
    const s = ui.sheet;
    const occ = findOccurrence(state, s.occId);
    const avail = Math.floor(L.availableMinutes(state, occ, now()));
    const used = s.rows.reduce((n, r) => n + r.minutes, 0);
    s.rows.push({ act: el.dataset.subj, minutes: Math.max(0, avail - used) });
    renderSheet();
  },
  'split-save'() {
    updateRemain();
    const s = ui.sheet;
    const occ = findOccurrence(state, s.occId);
    try {
      const rows = s.rows.filter((r) => r.minutes > 0);
      const prov = JSON.parse(JSON.stringify(state));
      L.confirmSplit(prov, occ, rows, now(), s.mode === 'other' ? 'other' : 'partial');
      commit((st) => L.confirmSplit(st, occ, rows, now(), s.mode === 'other' ? 'other' : 'partial'));
      closeSheet();
      toast(rows.length ? `Registrato: ${rows.map((r) => `${actName(r.act)} ${dur(r.minutes)}`).join(' + ')}` : 'Registrato: niente (resta non registrato)');
    } catch (err) { $('#err').textContent = err.message; }
  },
  close() { closeSheet(); },

  // timer
  't-subj'(el) { ui.timerAct = el.dataset.subj; render(); },
  't-min'(el) { ui.timerMin = Number(el.dataset.min); render(); },
  't-start'(el) {
    unlockAudio();
    const { current } = nowAndNext(state, now());
    commit((s) => T.start(s, el.dataset.subj, Number(el.dataset.min), now(), current?.id || null), { resync: true });
    ui.timerAct = null;
  },
  't-pause'() { commit((s) => T.pause(s, now()), { resync: true }); },
  't-resume'() { unlockAudio(); commit((s) => T.resume(s, now()), { resync: true }); },
  't-stop'() {
    let made = [];
    commit((s) => { made = T.stop(s, now()); }, { resync: true });
    if (!made.length) toast('Sessione sotto il minuto: non registrata');
  },
  't-cancel'() {
    if (!confirm('Annullare il focus senza registrarlo?')) return;
    commit((s) => { s.timer = null; }, { resync: true });
  },
  'session-ok'(el) { commit((s) => T.settleSession(s, el.closest('[data-session]').dataset.session)); },
  'session-edit'(el) { openSheet({ type: 'session', session: el.closest('[data-session]').dataset.session }); },
  'session-save'() {
    const id = ui.sheet.session;
    const act = $('#s-act').value, min = Number($('#s-min').value);
    commit((s) => { if (min > 0) T.trimSession(s, id, min); T.settleSession(s, id, { act }); });
    closeSheet();
  },
  'session-discard'() { commit((s) => T.settleSession(s, ui.sheet.session, { discard: true })); closeSheet(); },

  // manual
  manual() {
    const t = now();
    const m = partsAt(t, tz()).minute;
    openSheet({ type: 'manual', date: today(), start: hm(Math.max(0, m - 60)), end: hm(m), act: lastStudy() });
  },
  'manual-save'() {
    const date = $('#m-date').value, s = parseHM($('#m-start').value), e = parseHM($('#m-end').value), act = $('#m-act').value;
    if (!date || s == null || e == null) { $('#err').textContent = 'Compila giorno e orari'; return; }
    const start = instantOf(date, s, tz()), end = instantOf(date, e <= s ? e + 1440 : e, tz());
    if (end > now() + MIN) { $('#err').textContent = 'Non si può registrare tempo futuro'; return; }
    commit((st) => L.addManual(st, act, start, end));
    closeSheet();
    toast(`Registrato: ${actName(act)} ${dur((end - start) / MIN)}`);
  },
  'entry-del'(el) {
    if (!confirm('Eliminare questa registrazione?')) return;
    commit((s) => L.removeEntry(s, el.dataset.id));
  },

  // plan
  'plan-day'(el) { ui.planDate = el.dataset.date; render(); },
  'plan-week'(el) { ui.planDate = addDays(ui.planDate || today(), Number(el.dataset.d)); render(); },
  'plan-today'() { ui.planDate = today(); render(); },
  'edit-day'(el) {
    const date = el.dataset.date;
    const { source, blocks } = dayPlan(state, date);
    openSheet({ type: 'edit', date, scope: source, rows: blocks.map((b) => ({ ...b })), copy: [] });
  },
  'erow-add'() {
    const s = ui.sheet;
    s.rows = readEditRows();
    const last = s.rows[s.rows.length - 1];
    const st = last ? last.end : '09:00';
    const sm = parseHM(st) ?? 540;
    s.rows.push({ id: L.uid('b'), start: st, end: hm(Math.min(sm + 60, 1439)), act: 'studio', note: '' });
    renderSheet();
  },
  'erow-del'(el) { const s = ui.sheet; s.rows = readEditRows(); s.rows.splice(Number(el.dataset.i), 1); renderSheet(); },
  'edit-save'() {
    const s = ui.sheet;
    s.rows = readEditRows();
    const { errors, blocks } = validateBlocks(s.rows.filter((r) => r.start || r.end));
    if (errors.length) { s.errors = errors; renderSheet(); return; }
    const clean = blocks.map((b) => ({ id: b.id || L.uid('b'), start: b.start, end: b.end, act: b.act, note: b.note || '', provisional: false }));
    const wd = weekday(s.date);
    commit((st) => {
      if (s.scope === 'template') {
        st.template[wd] = clean;
        for (const d of s.copy || []) st.template[d] = clean.map((b) => ({ ...b, id: L.uid('b') }));
      } else if (s.scope === 'week') {
        const k = isoWeek(s.date);
        st.weekOverrides[k] = { ...(st.weekOverrides[k] || {}), [wd]: clean };
      } else {
        st.dateOverrides[s.date] = clean;
      }
    }, { resync: true });
    closeSheet();
    toast(s.scope === 'template' ? 'Modello aggiornato' : s.scope === 'week' ? 'Modificata solo questa settimana' : 'Modificata solo questa data');
  },
  'reset-day'(el) {
    const date = el.dataset.date;
    const { source } = dayPlan(state, date);
    commit((st) => {
      if (source === 'date') delete st.dateOverrides[date];
      else if (source === 'week') {
        const k = isoWeek(date), wd = weekday(date);
        if (st.weekOverrides[k]) { delete st.weekOverrides[k][wd]; if (!Object.keys(st.weekOverrides[k]).length) delete st.weekOverrides[k]; }
      }
    }, { resync: true });
  },
  'issue-ok'(el) { commit((s) => { s.issuesResolved[el.dataset.id] = Date.now(); }); },

  // stats + to-do list
  'stats-week'(el) { ui.statsDate = addDays(ui.statsDate || today(), Number(el.dataset.d)); render(); },
  'goto-todos'() { ui.tab = 'todos'; location.hash = 'todos'; render(); },
  'todo-filter'(el) {
    if (['open', 'done', 'all'].includes(el.dataset.filter)) ui.todoFilter = el.dataset.filter;
    render();
  },
  'bl-quick-add'() {
    try {
      const input = normalizeTaskInput({
        text: $('#q-text').value, priority: $('#q-priority').value,
        act: $('#q-act').value, due: $('#q-due').value,
      }, state.activities);
      commit((st) => st.backlog.push({ id: L.uid('k'), ...input, done: false, at: Date.now() }));
      ui.todoFilter = 'open';
      toast('Attività aggiunta alla checklist');
    } catch (err) { toast(err.message, 5000); }
  },
  'bl-add'() { openSheet({ type: 'backlog' }); },
  'bl-edit'(el) { openSheet({ type: 'backlog', id: el.dataset.id }); },
  'bl-save'() {
    try {
      const input = normalizeTaskInput({
        text: $('#b-text').value, priority: $('#b-priority').value,
        act: $('#b-act').value, due: $('#b-due').value,
      }, state.activities);
      const id = ui.sheet?.id;
      if (id && !state.backlog.some((x) => x.id === id)) throw new Error('Attività non trovata');
      commit((st) => {
        if (id) Object.assign(st.backlog.find((x) => x.id === id), input);
        else st.backlog.push({ id: L.uid('k'), ...input, done: false, at: Date.now() });
      });
      closeSheet();
      toast(id ? 'Attività aggiornata' : 'Attività aggiunta');
    } catch (err) { toast(err.message, 5000); }
  },
  'bl-toggle'(el) {
    commit((st) => {
      const x = st.backlog.find((b) => b.id === el.dataset.id);
      if (x) { x.done = el.checked; x.completedAt = x.done ? Date.now() : null; }
    });
  },
  'bl-del'(el) {
    const id = el.dataset.id;
    if (!state.backlog.some((x) => x.id === id) || !confirm('Eliminare definitivamente questa attività?')) return;
    commit((st) => { st.backlog = st.backlog.filter((x) => x.id !== id); });
    if (ui.sheet?.id === id) closeSheet();
    toast('Attività eliminata');
  },

  // more
  'focus-default'(el) { commit((s) => { s.settings.focusMinutes = Number(el.dataset.min); }); },
  sound(el) { commit((s) => { s.settings.sound = el.checked; }); },
  'habits-save'() {
    const t = (id) => document.getElementById(id)?.value;
    const hours = ['h-bottle-at', 'h-water-from', 'h-water-to', 'h-shutdown-at', 'h-bedtime-at'].map(t);
    if (hours.some((v) => v == null || parseHM(v) == null || parseHM(v) >= 1440)
        || parseHM(hours[1]) > parseHM(hours[2])) {
      toast('Controlla gli orari dei promemoria', 5000); return;
    }
    commit((st) => {
      st.settings.habits = {
        bottle: { enabled: $('#h-bottle-on').checked, time: hours[0] },
        water: { enabled: $('#h-water-on').checked, from: hours[1], to: hours[2], everyMinutes: 120 },
        shutdown: { enabled: $('#h-shutdown-on').checked, time: hours[3] },
        bedtime: { enabled: $('#h-bedtime-on').checked, time: hours[4] },
      };
    }, { resync: true });
    toast('Promemoria salvati');
  },
  'adv-save'() {
    commit((s) => { s.settings.pushApi = $('#f-api').value.trim(); s.settings.ntfyTopic = $('#f-ntfy').value.trim(); }, { resync: true });
    toast('Salvato');
  },
  async 'push-on'(el) {
    el.disabled = true;
    try {
      const push = await P.enable(state, $('#f-enroll')?.value.trim());
      commit((s) => { s.settings.push = push; });
      await syncNow(true);
      toast('Notifiche attive');
    } catch (err) { toast(err.message, 6000); render(); }
  },
  async 'push-off'() {
    const push = state.settings.push;
    commit((s) => { s.settings.push = null; });
    if (push) await P.disable(push);
    toast('Notifiche disattivate');
  },
  async 'push-test'() {
    try { await P.test(state.settings.push); toast('Prova inviata: dovrebbe arrivare entro pochi secondi'); } catch (err) { pushError(err); }
  },
  async 'push-sync'() { await syncNow(true); toast(state.settings.push?.error ? state.settings.push.error : 'Promemoria aggiornati'); },
  backup() {
    const copy = JSON.parse(JSON.stringify(state));
    if (copy.settings.push) copy.settings.push = null; // device credential stays on the device
    const text = exportBackup(copy, localStorage);
    const name = `aurelius-backup-${today()}.json`;
    const file = new File([text], name, { type: 'application/json' });
    const done = () => commit((s) => { s.lastBackupAt = Date.now(); });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(done).catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      done();
    }
  },
  restore() { $('#f-restore').click(); },
  'plan-import'() { $('#f-plan').click(); },
};

async function onRestoreFile(file) {
  try {
    const text = await file.text();
    const next = importBackup(text, state);
    if (!confirm('Sostituire i dati attuali con questo backup? Una copia dei dati attuali resta salvata.')) return;
    localStorage.setItem(`aurelius.v2.before-restore.${Date.now()}`, JSON.stringify(state));
    next.settings.push = state.settings.push;
    state = next;
    persist();
    scheduleSync();
    render();
    toast('Backup ripristinato');
  } catch (err) { toast(err.message, 6000); }
}

async function onPlanFile(file) {
  try {
    if (file.size > 100_000) throw new Error('File del piano troppo grande');
    const plan = JSON.parse(await file.text());
    const result = applyPlanPatch(state, plan);
    if (result.alreadyApplied) { toast('Piano già importato; nessun duplicato'); return; }
    if (!confirm(`Importare ${result.backlogAdded} attività e aggiornare ${result.daysEdited} giornate? Il registro delle ore già svolte resterà intatto. I dati rimarranno su questo dispositivo.`)) return;
    commit((st) => Object.assign(st, result.state), { resync: true });
    toast('Piano personale importato');
  } catch (err) { toast(`Importazione non riuscita: ${err.message}`, 7000); }
}

// ---------- push sync ----------

let syncTimer = null;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(false), 1500);
}

function pushError(err) {
  const msg = err.status === 401 || err.status === 404 ? 'Registrazione notifiche non più valida: disattiva e riattiva' : `Notifiche: ${err.message}`;
  commit((s) => { if (s.settings.push) s.settings.push.error = msg; }, { repaint: ui.tab === 'altro' });
}

// One sync at a time; changes made meanwhile trigger one more sync afterwards. Each schedule carries an
// increasing revision so the worker can also ignore an older one that arrives late.
let syncing = null, syncAgain = false;
function syncNow(force) {
  if (syncing) { syncAgain = true; return syncing; }
  syncing = (async () => {
    try { await syncOnce(force); } finally { syncing = null; }
    if (syncAgain) { syncAgain = false; await syncNow(true); }
  })();
  return syncing;
}

async function syncOnce(force) {
  const push = state.settings.push;
  if (!push || !navigator.onLine) return;
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  const items = reminderItems(state, now(), base);
  const hash = P.hashItems(items, state.settings.ntfyTopic);
  if (!force && hash === push.syncedHash && now() - (push.lastSync || 0) < 6 * 3600e3) return;
  const rev = Math.max(Date.now(), (push.rev || 0) + 1);
  commit((s) => { if (s.settings.push) s.settings.push.rev = rev; }, { repaint: false });
  try {
    await P.sync(push, items, state.settings.ntfyTopic, rev);
    commit((s) => { if (s.settings.push) Object.assign(s.settings.push, { syncedHash: hash, lastSync: Date.now(), error: '' }); },
      { repaint: ui.tab === 'altro' });
  } catch (err) { pushError(err); }
}

// ---------- sound ----------

let audio = null;
function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}
function chime() {
  if (!state.settings.sound || !audio) return;
  try {
    const t0 = audio.currentTime;
    for (const [i, f] of [660, 880, 990].entries()) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0 + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.5);
      o.connect(g).connect(audio.destination);
      o.start(t0 + i * 0.18); o.stop(t0 + i * 0.18 + 0.55);
    }
  } catch { /* ignore */ }
}

// ---------- render loop ----------

function render() {
  for (const b of document.querySelectorAll('#nav button')) {
    b.classList.toggle('on', b.dataset.tab === ui.tab);
    if (b.dataset.tab === 'ora') {
      const n = pendingList().length + T.unconfirmedSessions(state).length;
      b.innerHTML = `Ora${n ? `<span class="dot">${n}</span>` : ''}`;
    }
  }
  const main = $('#main');
  main.innerHTML = ui.tab === 'piano' ? viewPlan() : ui.tab === 'todos'
    ? renderTodos(state, ui.todoFilter, today(), { esc, actOptions, sw, actName })
    : ui.tab === 'stats' ? viewStats() : ui.tab === 'altro' ? viewMore() : viewNow();
  ui.lastPaint = now();
}

/** Timer reaching its planned length stops at that instant (also after the app was closed for hours). */
function settleTimer() {
  const t = state.timer;
  if (!t || t.since == null) return false;
  const reached = T.plannedReachedAt(t);
  if (reached == null || reached > now()) return false;
  commit((s) => T.stop(s, now(), reached), { repaint: false, resync: true });
  return true;
}

function tick() {
  const t = now();
  let repaint = false;
  if (settleTimer()) { chime(); toast('Focus completato: conferma la sessione'); repaint = true; }
  // Block boundaries since last tick.
  const { current } = nowAndNext(state, t);
  const curId = current?.id || null;
  if (ui.lastEnded !== null && curId !== ui.lastEnded) { chime(); repaint = true; }
  ui.lastEnded = curId;
  if (ui.tab === 'ora' && state.timer) {
    const el = $('#tclock');
    if (el) el.textContent = clock(state.timer.plannedMin * MIN - T.elapsedMs(state.timer, t));
  }
  const typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (!typing && (repaint || (ui.tab === 'ora' && t - ui.lastPaint > 20000))) render();
}

// ---------- wiring ----------

document.addEventListener('click', (ev) => {
  const tab = ev.target.closest('#nav button');
  if (tab) { ui.tab = tab.dataset.tab; location.hash = ui.tab; render(); window.scrollTo(0, 0); return; }
  if (ev.target.id === 'sheet') { closeSheet(); return; }
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.act];
  if (fn) { ev.preventDefault(); fn(el); }
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'f-restore' && el.files[0]) { onRestoreFile(el.files[0]); el.value = ''; return; }
  if (el.id === 'f-plan' && el.files[0]) { onPlanFile(el.files[0]); el.value = ''; return; }
  if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.dataset.act && actions[el.dataset.act]) actions[el.dataset.act](el);
  if (el.closest('#rows')) updateRemain();
  if (el.name === 'scope' && ui.sheet?.type === 'edit') { ui.sheet.rows = readEditRows(); renderSheet(); }
});
document.addEventListener('input', (ev) => { if (ev.target.closest('#rows')) updateRemain(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { settleTimer(); render(); syncNow(false); }
});
window.addEventListener('storage', (ev) => { if (ev.key === 'aurelius.v2') { state = load(localStorage).state; render(); } });

function route() {
  const q = new URLSearchParams(location.search);
  const h = location.hash.replace('#', '');
  if (['ora', 'piano', 'todos', 'stats', 'altro'].includes(h)) ui.tab = h;
  const occId = q.get('occ');
  if (occId) {
    ui.tab = 'ora';
    const occ = findOccurrence(state, occId);
    if (occ) openSheet({ type: 'occ', occId: occ.id });
  }
  if (q.get('timer')) ui.tab = 'ora';
  if (occId || q.get('timer')) history.replaceState(null, '', location.pathname + (ui.tab !== 'ora' ? '#' + ui.tab : ''));
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type === 'open' && ev.data.url) { history.replaceState(null, '', ev.data.url); route(); render(); }
  });
}

settleTimer();
route();
render();
if (notice) toast(notice, 6000);
setInterval(tick, 1000);
syncNow(false);
window.__aurelius = { get state() { return state; }, render, now };
