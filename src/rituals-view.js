import { reflectionForDate } from './reflections.js';
import { estimateCycle, suggestedGesture, GESTURES } from './relationship.js';
import { renderCareContext } from './care-view.js';
import { hypotheticalStage } from './care-moments.js';

// Rendering only. Do not include cycle dates in push payloads or exported backups.
export function viewRituals(date, relationship, habits, presence, days, esc, hasEdition = false) {
  const q = reflectionForDate(date);
  const out = [
    `<h2>Preferenze e attenzioni</h2>
    <div class="card ritual-quote">
      <h2>Pensiero del giorno</h2>
      ${hasEdition ? '' : `<strong>${esc(q.title)}</strong>`}
      ${hasEdition ? '<p class="small">Il pensiero completo è nella bacheca qui sopra.</p>' : `<p>${esc(q.thought)}</p>`}
      ${hasEdition ? '' : `<p class="small"><b>Da praticare:</b> ${esc(q.practice)}</p>`}
      <p class="mut small">${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener noreferrer">${esc(q.source)}</a>` : esc(q.source)}.
      Le riflessioni sono parafrasi o testi originali, non citazioni letterali.</p>
      <label class="opt"><input type="checkbox" id="r-quote-enable"${habits.quote?.enabled ? ' checked' : ''}> Notifica quotidiana con pensiero</label>
      <label class="small">Orario <input type="time" id="r-quote-time" value="${esc(habits.quote?.time || '07:00')}"></label>
      <button class="btn pri" data-act="ritual-quote-save">Salva notifica</button>
    </div>`,
  ];
  const status = relationship ? estimateCycle(relationship, date) : null;
  // Yasminelle: use the reported withdrawal-bleeding calendar, not natural ovarian phase labels.
  const labelByStage = {
    bleed: 'Sanguinamento da sospensione (finestra indicativa)',
    pre: 'Giorni prima del sanguinamento previsto',
    after: 'Giorni successivi al sanguinamento',
    any: 'Giorni di pillola attiva / periodo non classificato',
  };
  const calendarLabel = status?.stale ? 'Data da aggiornare'
    : labelByStage[hypotheticalStage(relationship, date)];
  out.push(`<h2 id="relationship">Attenzioni nella relazione</h2><div class="card">
    <p class="small">Il calendario orienta piccoli gesti di comfort; la libreria di 40 idee è già pronta anche senza selezionare preferenze.</p>
    ${status ? `<div class="card soft">
      <b>${esc(calendarLabel)}</b>
      ${status.dayInCycle ? `<div class="small">Giorno ${status.dayInCycle} del calendario di 28 giorni (indicativo)</div>` : ''}
      <p class="small">Promemoria basato sulle date di sanguinamento da sospensione; non indica ovulazione o umore.</p>
      ${status.nextStart ? `<p class="small">Prossimo sanguinamento atteso circa: ${esc(status.nextStart)} (non certo)</p>` : ''}
      </div>
      <p><b>Un gesto possibile oggi:</b> ${esc(suggestedGesture(relationship, date))}</p>` :
      '<p class="mut">Non ci sono dati salvati. Imposti soltanto le informazioni che la persona interessata ha accettato di condividere.</p>'}
    <details ${relationship ? '' : 'open'}>
      <summary>Configura o aggiorna i dati (solo su questo iPhone)</summary>
      <p class="mut small">I dati riguardano la salute di un’altra persona: chiedile prima il permesso. Aurelius li conserva localmente in chiaro, fuori dal backup standard e senza inviarli al server delle notifiche. Sono leggibili da chi ha accesso all’app o al dispositivo.</p>
      <label class="small">Primo giorno dell’ultimo sanguinamento (confermato)
        <input type="date" id="r-start" value="${esc(relationship?.lastStart || '')}" max="${esc(date)}"></label>
      <div class="ritual-fields">
        <label class="small">Intervallo fra gli inizi (giorni)
          <input type="number" id="r-days" min="21" max="35" placeholder="28" value="${esc(relationship?.cycleDays ?? 28)}"></label>
        <label class="small">Mestruazioni (giorni)
          <input type="number" id="r-period" min="2" max="7" value="${esc(relationship?.periodDays || 5)}"></label>
      </div>
      <label class="opt"><input type="checkbox" id="r-regular"${relationship ? (relationship.regular ? ' checked' : '') : ' checked'}> Sanguinamento abitualmente ogni 28 giorni (schema 21+7)</label>
      <h2>Gesti che lei gradisce</h2>
      <p class="mut small">Selezionare solo quelli che avete effettivamente concordato. Nessuna preferenza sarà dedotta dalla fase.</p>
      ${GESTURES.map((g) => `<label class="opt"><input type="checkbox" data-gesture="${g.id}"${relationship?.gestures?.includes(g.id) ? ' checked' : ''}> ${esc(g.label)}</label>`).join('')}
      <label class="opt"><input type="checkbox" id="r-consent"${relationship?.consent ? ' checked' : ''}> Confermo che la persona interessata ha accettato questa raccolta e l’uso delle informazioni</label>
      <label class="opt"><input type="checkbox" id="r-care-notify"${habits.care?.enabled ? ' checked' : ''}> Attiva i messaggi di coppia nei soli giorni e orari che confermo</label>
      <div class="btns">
        <button class="btn pri" data-act="ritual-relationship-save">Salva sul dispositivo</button>
        ${relationship ? '<button class="btn bad" data-act="ritual-relationship-delete">Cancella dati e notifiche</button>' : ''}
      </div>
    </details>
    <p class="mut small">Le finestre sono orientative. Il sanguinamento con pillola combinata non identifica ovulazione; i consigli restano gesti pratici, non previsioni dell’umore. Date e preferenze restano sul dispositivo.</p>
  </div>`);
  out.push(renderCareContext(date, presence, days, relationship, esc, {
    full: true, soloEnabled: habits.personalPause?.enabled ?? true,
  }));
  return out.join('');
}
