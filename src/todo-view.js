import { orderedTasks, PRIORITIES, taskPriority } from './todos.js';

// View-only HTML. All user-controlled fields are escaped by the injected helper.
export function renderTodos(state, filter, date, { esc, actOptions, sw, actName }) {
  const open = state.backlog.filter((x) => !x.done).length;
  const completed = state.backlog.length - open;
  const shown = orderedTasks(state.backlog, filter);
  const out = [`<h1>Da fare · ${open} aperte, ${completed} completate</h1>`];
  out.push(`<div class="card todo-add">
    <h2>Aggiungi attività</h2>
    <label class="small" for="q-text">Cosa devi fare?</label>
    <input type="text" id="q-text" maxlength="300" placeholder="Es. fare il bucato, recuperare una lezione…" autocomplete="off">
    <div class="todo-fields">
      <label class="small" for="q-priority">Priorità<select id="q-priority">
        ${PRIORITIES.map((p) => `<option value="${p.id}"${p.id === 'P1' ? ' selected' : ''}>${p.id} · ${p.label}</option>`).join('')}
      </select></label>
      <label class="small" for="q-act">Categoria<select id="q-act">${actOptions('vita')}</select></label>
    </div>
    <label class="small" for="q-due">Scadenza (facoltativa)<input id="q-due" type="date"></label>
    <button class="btn pri big" data-act="bl-quick-add" style="margin-top:12px">+ Aggiungi alla checklist</button>
  </div>`);
  out.push(`<div class="chips todo-filters" aria-label="Filtra le attività">
    ${[['open', 'Aperte'], ['done', 'Completate'], ['all', 'Tutte']].map(([id, label]) =>
      `<button class="chip${filter === id ? ' on' : ''}" data-act="todo-filter" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}
    </div>`);
  const labels = { P0: 'Urgente', P1: 'Priorità alta', P2: 'Importante',
    P3: 'Flessibile', D: 'Rimandate' };
  for (const priority of PRIORITIES) {
    const group = shown.filter((x) => taskPriority(x) === priority.id);
    if (!group.length) continue;
    out.push(`<h2 class="todo-heading"><span class="todo-level todo-level-${priority.id}">${priority.id}</span> ${labels[priority.id]} <span class="mut">(${group.length})</span></h2>`);
    out.push(`<div class="card todo-list">${group.map((x) => {
      const due = x.due ? `<span class="todo-date${!x.done && x.due < date ? ' late' : ''}">
        ${x.due < date && !x.done ? 'Scaduta: ' : 'Entro: '}${esc(x.due)}</span>` : '';
      return `<div class="todo-item${x.done ? ' is-done' : ''}" data-todo-id="${esc(x.id)}">
        <label class="todo-main"><input type="checkbox" data-act="bl-toggle" data-id="${esc(x.id)}"${x.done ? ' checked' : ''} aria-label="Completata: ${esc(x.text)}">
          <span class="todo-body"><span class="todo-text">${esc(x.text)}</span>
          <span class="todo-meta">${sw(x.act)}${esc(actName(x.act))}${due}</span></span></label>
        <button class="btn sm todo-edit" data-act="bl-edit" data-id="${esc(x.id)}" aria-label="Modifica attività">Modifica</button>
      </div>`;
    }).join('')}</div>`);
  }
  if (!shown.length) out.push(`<div class="card soft">${filter === 'open' ?
    'Nessuna attività aperta. Puoi aggiungerne una dal box qui sopra.' :
    filter === 'done' ? 'Nessuna attività completata.' : 'La checklist è vuota.'}</div>`);
  return out.join('');
}
