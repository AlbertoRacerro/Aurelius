import { reflectionForDate } from './reflections.js';
import { estimateCycle, suggestedGesture, GESTURES } from './relationship.js';

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
  out.push(`<h2>Attenzioni nella relazione</h2><div class="card">
    <p class="small">Non si prevedono umore o comportamenti dalla fase del ciclo. I gesti proposti vengono solo dalle preferenze discusse insieme.</p>
    ${status ? `<div class="card soft">
      <b>${esc(status.label)}</b>
      ${status.dayInCycle ? `<div class="small">Giorno indicativo ${status.dayInCycle} del ciclo</div>` : ''}
      <p class="small">${esc(status.description)}</p>
      ${status.nextStart ? `<p class="small">Prossimo inizio stimato: ${esc(status.nextStart)} (non certo)</p>` : ''}
      </div>
      <p><b>Un gesto possibile oggi:</b> ${esc(suggestedGesture(relationship, date))}</p>` :
      '<p class="mut">Non ci sono dati salvati. Imposti soltanto le informazioni che la persona interessata ha accettato di condividere.</p>'}
    <details ${relationship ? '' : 'open'}>
      <summary>Configura o aggiorna i dati (solo su questo iPhone)</summary>
      <p class="mut small">I dati riguardano la salute di un’altra persona: chiedile prima il permesso. Aurelius li conserva localmente in chiaro, fuori dal backup standard e senza inviarli al server delle notifiche. Sono leggibili da chi ha accesso all’app o al dispositivo.</p>
      <label class="small">Primo giorno dell’ultima mestruazione (confermato)
        <input type="date" id="r-start" value="${esc(relationship?.lastStart || '')}" max="${esc(date)}"></label>
      <div class="ritual-fields">
        <label class="small">Durata tipica se regolare (giorni)
          <input type="number" id="r-days" min="21" max="35" placeholder="Es. 28" value="${esc(relationship?.cycleDays ?? '')}"></label>
        <label class="small">Mestruazioni (giorni)
          <input type="number" id="r-period" min="2" max="7" value="${esc(relationship?.periodDays || 5)}"></label>
      </div>
      <label class="opt"><input type="checkbox" id="r-regular"${relationship?.regular ? ' checked' : ''}> Ciclo generalmente regolare (consente una stima approssimativa)</label>
      <h2>Gesti che lei gradisce</h2>
      <p class="mut small">Selezionare solo quelli che avete effettivamente concordato. Nessuna preferenza sarà dedotta dalla fase.</p>
      ${GESTURES.map((g) => `<label class="opt"><input type="checkbox" data-gesture="${g.id}"${relationship?.gestures?.includes(g.id) ? ' checked' : ''}> ${esc(g.label)}</label>`).join('')}
      <label class="opt"><input type="checkbox" id="r-consent"${relationship?.consent ? ' checked' : ''}> Confermo che la persona interessata ha accettato questa raccolta e l’uso delle informazioni</label>
      <label class="opt"><input type="checkbox" id="r-care-notify"${habits.care?.enabled ? ' checked' : ''}> Promemoria generico quotidiano di gentilezza (nessun dato sul ciclo nella notifica)</label>
      <div class="btns">
        <button class="btn pri" data-act="ritual-relationship-save">Salva sul dispositivo</button>
        ${relationship ? '<button class="btn bad" data-act="ritual-relationship-delete">Cancella dati e notifiche</button>' : ''}
      </div>
    </details>
    <p class="mut small">La stima è solo orientativa, specialmente con cicli variabili. Non usare per calcolare giorni fertili, diagnosi o contraccezione. Nessuna informazione sanitaria va su GitHub o nelle notifiche.</p>
  </div>`);
  return out.join('');
}
