import { MOMENTS, SLOTS, choiceForPresence } from './care-moments.js';

export function renderCareContext(date, presence, days, record, esc, { full = false, soloEnabled = true } = {}) {
  const together = presence?.date===date && presence.together===true;
  const alone = presence?.date===date && presence.together===false;
  const pick = choiceForPresence(presence,date,record,days);
  const pickedSlots=together ? SLOTS.filter(x=>presence.slots.includes(x.id)).map(x=>x.title).join(', ') : '';
  const out = [`<div class="card care-card"><h2>Oggi con Giordana?</h2>
    <p class="mut small">Solo per oggi. Se non siete insieme, nessuna proposta per due va nelle notifiche.</p>
    <div class="btns">
      <button class="btn ${together?'pri':''}" data-act="care-together">Sì, scegli i momenti</button>
      <button class="btn ${alone?'pri':''}" data-act="care-alone">No, oggi no</button>
    </div>
    <p class="small">${together?`Insieme: ${esc(pickedSlots)}.`:alone?'Oggi solo promemoria personali.':'Non ancora indicato: nessuna notifica di coppia.'}</p>
    ${pick?.moment ? `<div class="card soft"><b>${esc(pick.moment.title)}</b>
      <p>${esc(pick.moment.text)}</p>
      <span class="mut small">${esc(pick.moment.minutes)} min · ${esc(SLOTS.find(x=>x.id===pick.slot)?.title)}</span>
    </div>` : ''}
  </div>`];
  if(full) {
    out.push(`<div class="card">
      <h2>Pause personali</h2>
      <p class="mut small">Una pausa concreta a metà pomeriggio, anche quando studi da solo. 3 giorni a settimana, indipendente dalle idee di coppia.</p>
      <label class="opt"><input type="checkbox" id="care-solo-push"${soloEnabled ? ' checked' : ''}> Ricordami una pausa personale (lun, mer, ven alle 15:45)</label>
      <button class="btn sm" data-act="care-solo-save">Salva preferenza</button>
    </div>
    <details class="card care-library"><summary>Tutte le 40 idee già pronte (32 in due · 8 da solo)</summary>
      ${[['together','Insieme'],['solo','Solo per me']].map(([who,title]) => `<h3>${title}</h3><ul>
        ${MOMENTS.filter(x=>x.who===who).map(x=>`<li><b>${esc(x.title)}</b> — ${esc(x.text)} <span class="mut small">(${x.minutes} min)</span></li>`).join('')}
      </ul>`).join('')}
    </details>`);
  }
  return out.join('');
}
