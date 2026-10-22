// Relationship-support preferences are stored SEPARATELY from Aurelius state.
// Never upload dates, preferences or phase to the public repository, standard backup or private planner.
export const RELATIONSHIP_KEY = 'aurelius.relationship.local.v1';
export const GESTURES = [
  { id: 'tea', label: 'Proporre un tè o una bevanda calda', text: 'Potresti proporre spontaneamente una bevanda calda, senza insistere.' },
  { id: 'help', label: 'Alleggerire una faccenda pratica', text: 'Offriti di togliere di mezzo una faccenda concreta.' },
  { id: 'time', label: 'Tempo insieme senza telefoni', text: 'Proponi un momento tranquillo insieme, senza telefono.' },
  { id: 'ask', label: 'Chiedere che cosa sarebbe gradito', text: 'Chiedile cosa le farebbe piacere oggi: ascolta, senza interpretare.' },
  { id: 'rest', label: 'Rispettare eventuale bisogno di tranquillità', text: 'Offri disponibilità e lascia spazio se è ciò che desidera.' },
  { id: 'food', label: 'Preparare qualcosa di buono', text: 'Proponi di preparare un pasto gradito, senza presumere fame o voglie.' },
  { id: 'walk', label: 'Proporre una passeggiata', text: 'Se le va, proponi una passeggiata o un momento all’aperto.' },
  { id: 'care', label: 'Chiedere se un gesto di conforto è gradito', text: 'Chiedi se desidera compagnia, un abbraccio o un gesto di conforto.' },
];
const ID = /^\d{4}-\d{2}-\d{2}$/;
function day(date) {
  if (!ID.test(String(date))) throw new Error('Data non valida');
  const ms = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw new Error('Data non valida');
  return ms;
}
function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }

export function validateRelationship(input, today) {
  if (input?.consent !== true) throw new Error('Serve l’accordo esplicito della persona interessata');
  const start = String(input.lastStart || '');
  const regular = input.regular === true;
  const days = regular ? Number(input.cycleDays) : null;
  const periodDays = Number(input.periodDays);
  const current = day(today);
  const age = (current - day(start)) / 86400000;
  if (age < 0 || age > 366) throw new Error('Indica un inizio ciclo passato negli ultimi 12 mesi');
  if (regular && (!Number.isInteger(days) || days < 21 || days > 35)) throw new Error('Lunghezza tipica: 21–35 giorni');
  if (!Number.isInteger(periodDays) || periodDays < 2 || periodDays > 7) throw new Error('Durata tipica mestruazioni: 2–7 giorni');
  const allowed = new Set(GESTURES.map((g) => g.id));
  const gestures = Array.isArray(input.gestures) ? [...new Set(input.gestures)] : [];
  if (gestures.length > GESTURES.length || gestures.some((x) => !allowed.has(x))) throw new Error('Preferenze non valide');
  return { consent: true, lastStart: start, cycleDays: days, periodDays,
    regular, gestures };
}
export function loadRelationship(storage) {
  try {
    const raw = storage.getItem(RELATIONSHIP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.consent !== true || !ID.test(data.lastStart || '')) return null;
    return data;
  } catch { return null; }
}
export function saveRelationship(storage, input, today) {
  const data = validateRelationship(input, today);
  storage.setItem(RELATIONSHIP_KEY, JSON.stringify(data));
  return data;
}
export function deleteRelationship(storage) { storage.removeItem(RELATIONSHIP_KEY); }

export function estimateCycle(data, date) {
  if (!data || data.consent !== true) return null;
  const delta = Math.floor((day(date) - day(data.lastStart)) / 86400000);
  if (delta < 0) return { label: 'Data iniziale nel futuro', description: 'Aggiorna la data registrata.', stale: true };
  if (!data.regular) return {
    label: delta < data.periodDays ? 'Giorni mestruali (da data inserita)' : 'Fase non stimabile',
    description: 'Ciclo indicato come variabile: il calendario non può stimare in modo affidabile la fase o la prossima data.',
    stale: delta > 45,
  };
  if (delta > data.cycleDays * 2) return {
    label: 'Data da aggiornare', description: 'Sono trascorsi più di due cicli stimati dall’ultima data inserita.',
    stale: true,
  };
  const dayInCycle = delta % data.cycleDays + 1;
  const ovulationApprox = data.cycleDays - 14; // heuristic only, NOT a fertility assessment
  let label;
  if (dayInCycle <= data.periodDays) label = 'Giorni mestruali (calendario)';
  else if (dayInCycle < ovulationApprox - 2) label = 'Fase follicolare (stima)';
  else if (dayInCycle <= ovulationApprox + 2) label = 'Transizione periovulatoria (molto incerta)';
  else label = 'Fase luteale (stima)';
  const nextStart = day(data.lastStart) + (Math.floor(delta / data.cycleDays) + 1) * data.cycleDays * 86400000;
  return { label, dayInCycle, nextStart: iso(nextStart), stale: false,
    description: 'Stima da date e durata media, non osservazione ormonale. Non usare per diagnosi o contraccezione.' };
}
export function suggestedGesture(data, date) {
  const options = GESTURES.filter((x) => data?.gestures?.includes(x.id));
  if (!options.length) return 'Chiedi che cosa farebbe piacere oggi, senza presumere stati d’animo.';
  const dayNumber = Math.floor(day(date) / 86400000);
  return options[(dayNumber * 7 + 1) % options.length].text;
}
