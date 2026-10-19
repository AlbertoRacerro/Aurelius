import { reflectionForDate } from './reflections.js';
import { estimateCycle, suggestedGesture, GESTURES } from './relationship.js';
import { PHASE_GUIDES, GUIDANCE_SOURCES, dailyGuidance, phaseOutlook } from './phase-guidance.js';

// Rendering only. Do not include cycle dates in push payloads or exported backups.
export function viewRituals(date, relationship, habits, esc) {
  const q = reflectionForDate(date);
  const out = [
    `<h1>Rituali · ${esc(date)}</h1>
    <div class="card ritual-quote">
      <h2>Pensiero del giorno</h2>
      <strong>${esc(q.title)}</strong>
      <p>${esc(q.thought)}</p>
      <p class="small"><b>Da praticare:</b> ${esc(q.practice)}</p>
      <p class="mut small">${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener noreferrer">${esc(q.source)}</a>` : esc(q.source)}.
      Le riflessioni sono parafrasi o testi originali, non citazioni letterali.</p>
      <label class="opt"><input type="checkbox" id="r-quote-enable"${habits.quote?.enabled ? ' checked' : ''}> Notifica quotidiana con pensiero</label>
      <label class="small">Orario <input type="time" id="r-quote-time" value="${esc(habits.quote?.time || '07:00')}"></label>
      <button class="btn pri" data-act="ritual-quote-save">Salva notifica</button>
    </div>`,
  ];
  const status = relationship ? estimateCycle(relationship, date) : null;
  const advice = dailyGuidance(status, date);
  const outlook = relationship ? phaseOutlook(relationship, date, estimateCycle) : [];
  const adviceSources = (guide) => guide.sourceIds.map((i) =>
    `<a href="${esc(GUIDANCE_SOURCES[i].url)}" target="_blank" rel="noopener noreferrer">${esc(GUIDANCE_SOURCES[i].title)}</a>`).join(' · ');
  const adviceCard = (guide) => `<div class="card soft phase-guide" data-phase="${guide.stage}">
    <h3>${esc(guide.name)}</h3>
    <p>${esc(guide.context)}</p>
    <p><b>Idea di oggi:</b> ${esc(guide.suggestion || guide.ideas[0])}</p>
    <p><b>Una domanda utile:</b> ${esc(guide.question)}</p>
    <details><summary>Altre idee già pronte</summary><ul>
      ${guide.ideas.map((idea) => `<li>${esc(idea)}</li>`).join('')}
    </ul></details>
    <p class="mut small">${esc(guide.evidence)} ${adviceSources(guide)}</p>
  </div>`;
  out.push(`<h2>Attenzioni nella relazione</h2><div class="card">
    <p class="small">I consigli sono già pronti e si adattano automaticamente alla <b>fase stimata</b> quando è possibile stimarla. Non prevedono l’umore, la fame o il comportamento individuale. I gesti personalizzati dipendono dalle preferenze concordate.</p>
    ${status ? `<div class="card soft">
      <b>${esc(status.label)}</b>
      ${status.dayInCycle ? `<div class="small">Giorno indicativo ${status.dayInCycle} del ciclo</div>` : ''}
      <p class="small">${esc(status.description)}</p>
      ${status.nextStart ? `<p class="small">Prossimo inizio stimato: ${esc(status.nextStart)} (non certo)</p>` : ''}
      </div>
      ${adviceCard(advice)}
      ${relationship?.gestures?.length ? `<p><b>Gesto personalizzato concordato:</b> ${esc(suggestedGesture(relationship, date))}</p>` : ''}
      ${outlook.length ? `<h3>Come potrebbero susseguirsi le fasi</h3>
      <p class="mut small">Finestre ipotetiche basate sulla durata media. Sono indicative e non determinano ovulazione né giorni fertili.</p>
      <div class="phase-timeline">${outlook.map((segment) => `<div class="phase-range">
        <b>${esc(segment.name)}</b><span>${esc(segment.from)} – ${esc(segment.to)}</span>
      </div>`).join('')}</div>` : ''}` :
      `<p class="mut">Nessuna data ancora inserita. I consigli per fase sono già disponibili qui sotto; per attivare il calendario serve il consenso e la data reale.</p>${adviceCard(advice)}`}
    <details ${relationship ? '' : 'open'}>
      <summary>Configura o aggiorna i dati (solo su questo iPhone)</summary>
      <p class="mut small">I dati riguardano la salute di un’altra persona: chiedile prima il permesso. Aurelius li conserva localmente in chiaro, fuori dal backup standard e senza inviarli al server delle notifiche. Sono leggibili da chi ha accesso all’app o al dispositivo.</p>
      <label class="small">Primo giorno dell’ultima mestruazione (confermato)
        <input type="date" id="r-start" value="${esc(relationship?.lastStart || '')}" max="${esc(date)}"></label>
      <div class="ritual-fields">
        <label class="small">Durata tipica se regolare (giorni)
          <input type="number" id="r-days" min="21" max="35" placeholder="Es. 28" value="${esc(relationship?.cycleDays ?? '')}"></label>
        <label class="small">Durata ipotizzata mestruazioni (giorni, 5 modificabile)
          <input type="number" id="r-period" min="2" max="7" value="${esc(relationship?.periodDays || 5)}"></label>
      </div>
      <label class="opt"><input type="checkbox" id="r-regular"${relationship?.regular ? ' checked' : ''}> Ciclo generalmente regolare (consente una stima approssimativa)</label>
      <h2>Gesti che lei gradisce</h2>
      <p class="mut small">Selezionare solo quelli che avete effettivamente concordato. Nessuna preferenza sarà dedotta dalla fase.</p>
      ${GESTURES.map((g) => `<label class="opt"><input type="checkbox" data-gesture="${g.id}"${relationship?.gestures?.includes(g.id) ? ' checked' : ''}> ${esc(g.label)}</label>`).join('')}
      <label class="opt"><input type="checkbox" id="r-consent"${relationship?.consent ? ' checked' : ''}> Confermo che la persona interessata ha accettato questa raccolta e l’uso delle informazioni</label>
      <label class="opt"><input type="checkbox" id="r-care-notify"${(!relationship || habits.care?.enabled) ? ' checked' : ''}> Promemoria automatico alle 07:05: apri i consigli di oggi (senza dati sul ciclo nella notifica)</label>
      <div class="btns">
        <button class="btn pri" data-act="ritual-relationship-save">Salva sul dispositivo</button>
        ${relationship ? '<button class="btn bad" data-act="ritual-relationship-delete">Cancella dati e notifiche</button>' : ''}
      </div>
    </details>
    <details class="phase-library"><summary>Esplora tutte le quattro fasi e i consigli già inclusi</summary>
      ${Object.entries(PHASE_GUIDES).filter(([key]) => key !== 'unknown').map(([stage, guide]) =>
        adviceCard({ ...guide, stage })).join('')}
    </details>
    <p class="mut small">Il calendario non determina emozioni o comportamento. Con cicli irregolari o dati vecchi, la fase non viene prevista. Non usare per fertilità, contraccezione o diagnosi. I dati personali non vengono inclusi nelle notifiche.</p>
  </div>`);
  return out.join('');
}
