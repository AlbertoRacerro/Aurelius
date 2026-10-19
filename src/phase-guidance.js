// Evidence-informed, prewritten suggestions. These are POSSIBILITIES, never predictions
// of an individual's behaviour, emotions, appetite, libido or fertility.
// Primary references: ACOG FAQ PMS, NHS period pain, and a published validation of calendar ovulation prediction.
export const GUIDANCE_SOURCES = Object.freeze([
  { title: 'ACOG — Premenstrual Syndrome (PMS)', url: 'https://www.acog.org/womens-health/faqs/Premenstrual-Syndrome' },
  { title: 'NHS — Period pain', url: 'https://www.nhs.uk/symptoms/period-pain/' },
  { title: 'PubMed — Calendar/app ovulation prediction accuracy', url: 'https://pubmed.ncbi.nlm.nih.gov/29749274/' },
]);

export const PHASE_GUIDES = Object.freeze({
  menstrual: {
    name: 'Giorni mestruali',
    context: 'In alcune persone i primi giorni possono accompagnarsi a crampi, dolore o stanchezza. Non è automatico: conta come si sente lei.',
    question: 'Oggi preferiresti stare tranquilla, una coccola o fare qualcosa insieme?',
    ideas: [
      'Proponi un tè caldo o la sua bevanda preferita, senza decidere per lei.',
      'Se ha crampi e lo desidera, offri una borsa dell’acqua calda avvolta in un panno.',
      'Occupati spontaneamente di un compito pratico e lascia a lei la scelta del programma.',
      'Proponi una serata comoda o una passeggiata leggera: decida lei cosa le va.',
    ],
    evidence: 'I rimedi con calore per i dolori mestruali sono descritti dal NHS; le altre sono idee relazionali, non interventi clinici.',
    sourceIds: [1],
  },
  follicular: {
    name: 'Fase follicolare (stimata)',
    context: 'È la parte del ciclo successiva ai primi giorni di mestruazione. Dal calendario non si può dedurre energia, umore o desiderio di socialità.',
    question: 'Ti andrebbe di organizzare qualcosa di carino nei prossimi giorni?',
    ideas: [
      'Proponi un appuntamento spontaneo, lasciando aperta l’alternativa di restare a casa.',
      'Prepara una piccola sorpresa basata su un suo gusto già noto, non sulla fase.',
      'Chiedile se preferisce programmare qualcosa insieme o avere tempo per sé.',
      'Dedicatevi a un’attività condivisa senza trasformarla in un impegno obbligatorio.',
    ],
    evidence: 'Sono idee di cura della relazione; non esiste qui una previsione individuale sullo stato emotivo.',
    sourceIds: [2],
  },
  periovulatory: {
    name: 'Periodo periovulatorio (molto incerto)',
    context: 'La data di ovulazione non è determinabile in modo affidabile dalla sola durata del ciclo. Anche eventuali sintomi sono variabili.',
    question: 'Quale gesto ti farebbe piacere oggi?',
    ideas: [
      'Organizza un momento leggero insieme: una passeggiata, una colazione o un piccolo appuntamento.',
      'Proponi un’attività creativa a due, senza presumere maggiore energia o disponibilità.',
      'Scrivile un messaggio di apprezzamento concreto, indipendente dalla fase.',
      'Chiedi prima di programmare la serata: la stima del calendario non descrive i suoi desideri.',
    ],
    evidence: 'Uno studio su 949 partecipanti ha mostrato la scarsa precisione dei metodi a calendario per il giorno di ovulazione.',
    sourceIds: [2],
  },
  luteal: {
    name: 'Fase luteale (stimata)',
    context: 'In alcune persone, soprattutto nei giorni che precedono le mestruazioni, possono comparire gonfiore, tensione al seno, modifiche dell’appetito, stanchezza o irritabilità. Non vanno presunti: chiedi come sta.',
    question: 'C’è qualcosa che posso alleggerirti oggi? Ti va una serata tranquilla?',
    ideas: [
      'Se riferisce stanchezza o fastidio, proponi una serata rilassante e occupati della logistica.',
      'Prepara un pasto o uno spuntino che le piace; non presumere voglie o fame aumentata.',
      'Se vuole parlare, ascolta senza attribuire eventuali emozioni al ciclo.',
      'Proponi un momento caldo e confortevole, ma lascia a lei scegliere tra compagnia e spazio.',
    ],
    evidence: 'ACOG documenta possibili sintomi premestruali. La loro presenza e il loro andamento richiedono osservazioni individuali.',
    sourceIds: [0],
  },
  unknown: {
    name: 'Fase non stimabile',
    context: 'Senza una durata abituale affidabile o con dati vecchi, il calendario non permette di stimare la fase. È preferibile evitare conclusioni.',
    question: 'Che cosa ti farebbe stare bene oggi?',
    ideas: [
      'Proponi un tè o un gesto piacevole già apprezzato in passato.',
      'Chiedile se c’è una faccenda che puoi alleggerire.',
      'Dedica mezz’ora senza telefono a fare qualcosa insieme.',
      'Rispettane eventuale bisogno di riposo o di stare per conto suo.',
    ],
    evidence: 'Questi suggerimenti non dipendono da alcuna previsione ormonale.',
    sourceIds: [],
  },
});
const MILLIS = 86400000;
function dateMs(date) { return Date.parse(date + 'T00:00:00Z'); }
function dateKey(ms) { return new Date(ms).toISOString().slice(0, 10); }

// Stable daily choice; the entire list remains visible in the UI.
export function dailyGuidance(estimate, date) {
  const phase = estimate?.stage && PHASE_GUIDES[estimate.stage] ? estimate.stage : 'unknown';
  const guide = PHASE_GUIDES[phase];
  const ordinal = Math.floor(dateMs(date) / MILLIS);
  return { ...guide, stage: phase, suggestion: guide.ideas[((ordinal * 7 + 3) % guide.ideas.length + guide.ideas.length) % guide.ideas.length] };
}

// Compact lookahead grouped by estimated phase; no forecast for irregular/stale data.
// Returns date ranges, not fertility predictions.
export function phaseOutlook(data, date, estimateCycle, days = 35) {
  if (!data?.regular) return [];
  const start = dateMs(date);
  const segments = [];
  for (let offset = 0; offset < Math.min(42, Math.max(1, days)); offset++) {
    const d = dateKey(start + offset * MILLIS);
    const result = estimateCycle(data, d);
    if (!result || result.stale || !result.stage || result.stage === 'unknown') break;
    const last = segments.at(-1);
    if (last?.stage === result.stage) last.to = d;
    else segments.push({ stage: result.stage, from: d, to: d, name: PHASE_GUIDES[result.stage].name });
  }
  return segments;
}
