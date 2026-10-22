export function renderPersonalItems(state,esc,type) {
 const items=(state.personalInbox?.items||[]).filter(x=>!type||x.type===type);
 if(!items.length)return '';
 const labels={idea:'Idea',proposal:'Proposta di calendario',clarify:'Da chiarire'};
 return items.map(x=>`<label class="inbox-item"><input type="checkbox" data-act="inbox-item" data-id="${esc(x.id)}"${x.done?' checked':''}><span${x.done?' class="mut"':''}><b>${esc(x.list||labels[x.type]||'Lista')}</b><br>${esc(x.text)}</span></label>`).join('');
}
export function renderInbox(state,esc,connected,status,draft='') {
 const box=state.personalInbox||{notes:[],receipts:[],items:[]};
 const labels={queued:'Sul dispositivo',sent:'In attesa di elaborazione',applied:'Organizzata'};
 return `<h1>Appunti</h1><div class="card"><label for="inbox-text">Cosa ti è venuto in mente?</label><textarea id="inbox-text" maxlength="4000" rows="5" placeholder="Comprare il profumo; aggiungere Lost alle serie…">${esc(draft)}</textarea><div class="btns"><button class="btn pri" data-act="inbox-add">Salva nota</button><button class="btn" data-act="inbox-sync">Sincronizza</button></div><p id="inbox-status" class="small mut" role="status">${esc(status||'')}</p></div>
 <details class="card"><summary>${connected?'Collegamento personale salvato':'Collega archivio privato'}</summary><p class="small">Le note vengono inviate a GitHub privato e rielaborate da ChatGPT. La memoria privata, se attiva, conserva anche una copia dei dati locali; i dettagli sono nella sezione Memoria privata.</p><label>Codice personale<input id="personal-token" type="password" autocomplete="off" maxlength="128"></label><div class="btns"><button class="btn" data-act="inbox-connect">Salva codice e collega</button>${connected?'<button class="btn ghost" data-act="inbox-disconnect">Scollega</button>':''}</div></details>
 ${box.items.length?`<section class="card"><h2>Liste, idee e proposte</h2>${renderPersonalItems(state,esc)}</section>`:''}
 <h2>Note</h2>${[...box.notes].reverse().map(x=>{const receipt=box.receipts.find(r=>r.note_id===x.note.id);return `<article class="card inbox-note"><p>${esc(x.note.text)}</p><p class="small mut">${esc(labels[x.status]||'Da verificare')}${x.error?' · '+esc(x.error):''}</p>${receipt?`<p>${esc(receipt.summary)}</p><p class="small">${receipt.created.length} aggiunte · ${receipt.skipped} già presenti${receipt.undone?' · annullata':''}</p>${!receipt.undone?`<button class="btn sm" data-act="inbox-undo" data-id="${esc(x.note.id)}">Annulla aggiunte</button>`:''}`:''}</article>`;}).join('')}`;
}
