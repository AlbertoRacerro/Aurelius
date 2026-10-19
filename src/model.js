// Default activities, seed timetable and targets.
// The seed comes from the 2026/27 semester affirmations (15 Oct 2026), table
// "SETTIMANA OPERATIVA — TEMPLATE PROVVISORIO". The document says the grid is NOT a confirmed university
// timetable, so every seeded block is `provisional` until edited, and the contradictions it contains are
// listed in SOURCE_ISSUES for the user to resolve. No hour that the source does not state is invented.

export const SCHEMA_VERSION = 2;

// kind: study | lesson | break | gym | project | review | routine | life | other
// study: counts as active study (lessons are excluded, as the source requires)
export const DEFAULT_ACTIVITIES = [
  { id: 'atp', name: 'ATP', kind: 'study', study: true, color: '#2F6149' },
  { id: 'poci', name: 'POCI', kind: 'study', study: true, color: '#8A5A12' },
  { id: 'cppom', name: 'CPPOM / Plants', kind: 'study', study: true, color: '#1F5C8A' },
  { id: 'pseb', name: 'PSE B', kind: 'study', study: true, color: '#7A3E78' },
  { id: 'studio', name: 'Studio (materia da scegliere)', kind: 'study', study: true, generic: true, color: '#4F5D52' },
  { id: 'lezione', name: 'Lezione', kind: 'lesson', study: false, color: '#5C6B7A' },
  { id: 'lez-atp', name: 'Lezione ATP', kind: 'lesson', study: false, color: '#5C6B7A' },
  { id: 'es-ccre', name: 'Esercitazione CCRE', kind: 'lesson', study: false, color: '#5C6B7A' },
  { id: 'es-apc', name: 'Esercitazione APC', kind: 'lesson', study: false, color: '#5C6B7A' },
  { id: 'pausa', name: 'Pausa / pranzo', kind: 'break', study: false, color: '#A39E8F' },
  { id: 'palestra', name: 'Palestra', kind: 'gym', study: false, color: '#B4532A' },
  { id: 'bluerev', name: 'BlueRev / Jarvis', kind: 'project', study: false, color: '#2E6F78' },
  { id: 'python', name: 'Python Kaggle', kind: 'project', study: false, color: '#396A82' },
  { id: 'review', name: 'Review', kind: 'review', study: false, color: '#6B5B95' },
  { id: 'routine', name: 'Routine mattina', kind: 'routine', study: false, color: '#9AA38F' },
  { id: 'vita', name: 'Vita / amici', kind: 'life', study: false, color: '#C08A3E' },
  { id: 'spostamento', name: 'Spostamento', kind: 'other', study: false, color: '#9C9C9C' },
  { id: 'altro', name: 'Altro', kind: 'other', study: false, color: '#9C9C9C' },
];

export const STUDY_SUBJECTS = ['atp', 'poci', 'cppom', 'pseb'];

const SRC = 'affermazioni-2026-10-15';
let seq = 0;
function b(start, end, act, note = '') {
  seq += 1;
  return { id: `seed${seq}`, start, end, act, note, provisional: true, source: SRC };
}

// Monday=0 … Sunday=6, transcribed cell by cell from the source grid.
export function seedTemplate() {
  seq = 0;
  const morningWeekday = () => [
    b('06:00', '06:20', 'routine', 'Sveglia 6:00, acqua, luce, attivazione (lista Mattina)'),
    b('06:20', '08:00', 'atp', 'Studio attivo ATP dalle 6:20; colazione e uscita entro 7:55 (orari da verificare)'),
  ];
  const deep = (s, e, note = 'Deep study') => b(s, e, 'studio', note);
  return {
    0: [...morningWeekday(), b('08:15', '10:15', 'lez-atp'), deep('10:15', '13:15'),
      b('13:15', '15:15', 'pausa', 'Pranzo / radar / recupero'), deep('15:15', '18:15'), deep('18:15', '20:00'),
      b('20:00', '22:00', 'bluerev', 'Niente nuovi task complessi dopo le 21:00')],
    1: [...morningWeekday(), deep('08:15', '10:15'), deep('10:15', '13:15'),
      b('13:15', '15:15', 'pausa', 'Pranzo / radar / recupero'), b('15:15', '18:15', 'es-ccre'), deep('18:15', '20:00'),
      b('20:00', '22:00', 'vita', 'Palestra / vita (sera palestra o D&D)')],
    2: [...morningWeekday(), deep('08:15', '10:15'), b('10:15', '13:15', 'lez-atp'),
      b('13:15', '15:15', 'pausa', 'Pranzo / radar / recupero'), b('15:15', '18:15', 'es-apc'), deep('18:15', '20:00'),
      b('20:00', '22:00', 'bluerev', 'Niente nuovi task complessi dopo le 21:00')],
    3: [deep('06:00', '08:00'), deep('08:15', '10:15'), deep('10:15', '13:15'),
      b('13:15', '15:15', 'pausa', 'Pranzo / pausa'), deep('15:15', '18:15', 'Deep study / palestra'), deep('18:15', '20:00'),
      b('20:00', '22:00', 'vita', 'Palestra / vita')],
    4: [deep('06:00', '08:00'), deep('08:15', '10:15'), deep('10:15', '13:15'),
      b('13:15', '15:15', 'pausa', 'Pranzo / pausa'), deep('15:15', '18:15'), deep('18:15', '20:00', 'Deep study (studio lungo)'),
      b('20:00', '22:00', 'bluerev', 'Niente nuovi task complessi dopo le 21:00')],
    5: [deep('06:00', '08:00', 'Studio / vita'), b('20:00', '22:00', 'vita', 'Palestra / vita')],
    6: [deep('06:00', '08:00', 'Studio / review')],
  };
}

// Contradictions and gaps found in the source; shown in the app until the user marks them resolved.
export const SOURCE_ISSUES = [
  { id: 'lezioni-lmm', text: 'Il riepilogo dice "08:15–18:15 lezioni" lunedì–mercoledì, ma la griglia mette deep study in quelle fasce (es. lun 10:15–13:15 e 15:15–18:15). La griglia dichiara di non essere l\'orario universitario confermato: inserisci le lezioni reali.' },
  { id: 'palestra-2', text: 'Obiettivo palestra 2 sedute/settimana, ma la griglia ha "palestra/vita" mar, gio, sab sera e "deep study/palestra" gio pomeriggio. Scegli quali due sono le sedute vere.' },
  { id: 'weekend', text: 'Sabato e domenica sono "mezza giornata" (studio + vita; domenica review settimanale 30\'), ma la griglia lascia vuote quasi tutte le fasce: gli orari non sono indicati.' },
  { id: 'review-orari', text: 'La review serale (5\') e la review domenicale (30\') non hanno un orario nel documento: aggiungile dove vuoi.' },
  { id: 'sveglia', text: 'Sveglia 6:00 "da provare": se comprime il sonno passa alle 6:30.' },
  { id: 'target', text: 'Studio attivo (lezioni escluse): hard floor 28 h, target 35–36 h "da verificare", stretch 40 h. Target per materia non indicati.' },
  { id: 'appelli', text: 'Le date ufficiali degli appelli (gennaio–febbraio 2027) non sono ancora note.' },
];

export const DEFAULT_TARGETS = {
  weekly: { floor: 28, targetMin: 35, targetMax: 36, stretch: 40, note: 'provvisori per 2 settimane (15 ottobre)' },
  gymPerWeek: 2,
  milestones: [
    { date: '2026-11-30', name: 'GATE 1', text: 'Prima passata completa; nessun blocco importante mai visto' },
    { date: '2026-12-08', name: 'GATE 2', text: 'Preparazione completa con prove, TDE, errori e lacune' },
    { date: '2026-12-15', name: 'GATE 3', text: 'Pass-ready' },
    { date: '2026-12-22', name: 'Esame interno', text: 'Simulazione interna; buffer 16–21 dicembre' },
  ],
};

export function defaultSettings() {
  return {
    tz: 'Europe/Rome',
    focusMinutes: 45,
    focusChoices: [25, 45, 60],
    sound: true,
    reminders: true,
    habits: {
      bottle: { enabled: true, time: '07:40' },
      water: { enabled: true, from: '09:00', to: '21:00', everyMinutes: 120 },
      shutdown: { enabled: true, time: '21:45' },
      bedtime: { enabled: true, time: '22:20' },
      quote: { enabled: true, time: '07:00' },
      care: { enabled: false, time: '07:05' },
    },
    trackFrom: Date.now(),  // blocks that ended before this instant are never asked about
    push: null,             // { api, device, token, endpoint, at } once notifications are enabled
    pushApi: '',            // overrides config.js PUSH_API
    ntfyTopic: '',          // optional fallback channel used by the push worker
  };
}

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    createdAt: Date.now(),
    settings: defaultSettings(),
    activities: DEFAULT_ACTIVITIES.map((a) => ({ ...a })),
    template: seedTemplate(),
    weekOverrides: {},   // { '2026-W43': { 0..6: blocks[] } }
    dateOverrides: {},   // { '2026-10-20': blocks[] }
    quarantine: [],      // malformed entries found while loading, kept for manual recovery
    entries: [],         // actual time: { id, start, end, act, src, occ?, note?, approx?, at }
    accounts: {},        // per occurrence: { status, at, planned }
    timer: null,         // { act, plannedMin, startedAt, segments:[{s,e}], pausedAt?, occ? }
    backlog: [],         // { id, act, text, done, at }
    importedPlans: [],   // IDs of local private plan patches applied; prevent duplicate imports
    targets: JSON.parse(JSON.stringify(DEFAULT_TARGETS)),
    issuesResolved: {},
    legacy: null,        // untouched copy of the summer 2026 state
    lastBackupAt: 0,
  };
}
