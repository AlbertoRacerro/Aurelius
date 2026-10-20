// Persistence. The summer 2026 app stored everything under localStorage['aurelius'] (schema 1). This app never
// writes that key: it keeps a verbatim copy inside its own state (`legacy`), snapshots the raw string once
// under 'aurelius.v1.snapshot', and stores its own state under 'aurelius.v2'. The legacy page in /legacy/
// keeps working on the original key.

import { validateCatalog } from './ideas.js';
import { SCHEMA_VERSION, DEFAULT_ACTIVITIES, defaultSettings, emptyState, DEFAULT_TARGETS } from './model.js';

export const KEY = 'aurelius.v2';
export const PREV_KEY = 'aurelius.v2.prev';
export const LEGACY_KEY = 'aurelius';
export const LEGACY_SNAPSHOT_KEY = 'aurelius.v1.snapshot';

function parse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** Structural check before trusting stored or imported state: wrong shapes are treated as corruption. */
export function sane(s) {
  if (!isObj(s) || !Array.isArray(s.entries)) return false;
  if ('ideaCatalog' in s) {try {validateCatalog({schema:1,ideas:s.ideaCatalog});}catch{return false;}}
  if ('shopping' in s && (!Array.isArray(s.shopping)||s.shopping.some(x=>!x||typeof x.id!=='string'||typeof x.name!=='string'||!x.name.trim()||x.name.length>100||typeof x.inHouse!=='boolean'))) return false; // every saved state has an entries list
  for (const k of ['activities', 'backlog']) if (k in s && !Array.isArray(s[k])) return false;
  for (const k of ['settings', 'template', 'weekOverrides', 'dateOverrides', 'accounts', 'targets', 'issuesResolved']) {
    if (k in s && s[k] != null && !isObj(s[k])) return false;
  }
  return true;
}

/** Brings any stored state to the current schema, without dropping data it does not understand. */
export function migrate(s) {
  if (!s || typeof s !== 'object') return emptyState();
  let v = Number(s.schema) || 0;
  if (v > SCHEMA_VERSION) throw new Error(`Dati salvati da una versione più recente (${v}): aggiorna l'app prima di continuare`);
  // Future migrations go here: if (v === 2) { …; v = 3; }
  s.schema = SCHEMA_VERSION;
  return normalize(s);
}

export function normalize(s) {
  const base = emptyState();
  const out = { ...base, ...s };
  out.settings = { ...defaultSettings(), ...(s.settings || {}) };
  const defaults = defaultSettings().habits;
  const savedHabits = out.settings.habits || {};
  out.settings.habits = Object.fromEntries(Object.entries(defaults).map(([k, v]) =>
    [k, { ...v, ...(savedHabits[k] && typeof savedHabits[k] === 'object' ? savedHabits[k] : {}) }]));
  out.importedPlans = Array.isArray(s.importedPlans) ? s.importedPlans.filter((x) => typeof x === 'string') : [];
  const acts = Array.isArray(s.activities) ? s.activities.filter((a) => a && a.id) : [];
  for (const d of DEFAULT_ACTIVITIES) if (!acts.some((a) => a.id === d.id)) acts.push({ ...d });
  out.activities = acts;
  out.template = {};
  for (let d = 0; d < 7; d++) out.template[d] = Array.isArray(s.template?.[d]) ? s.template[d] : (s.template ? [] : base.template[d]);
  out.weekOverrides = s.weekOverrides && typeof s.weekOverrides === 'object' ? s.weekOverrides : {};
  out.dateOverrides = s.dateOverrides && typeof s.dateOverrides === 'object' ? s.dateOverrides : {};
  // Malformed entries are kept aside in `quarantine`, never dropped; exact duplicates are merged.
  const seen = new Map();
  const quarantine = Array.isArray(s.quarantine) ? s.quarantine.slice() : [];
  out.entries = [];
  for (const e of Array.isArray(s.entries) ? s.entries : []) {
    const ok = isObj(e) && e.id && e.act && Number.isFinite(Number(e.start)) && Number(e.end) > Number(e.start);
    if (ok && !seen.has(e.id)) { seen.set(e.id, JSON.stringify(e)); out.entries.push(e); }
    else if (!(ok && seen.get(e.id) === JSON.stringify(e))) quarantine.push(e);
  }
  out.quarantine = quarantine;
  out.accounts = s.accounts && typeof s.accounts === 'object' ? s.accounts : {};
  out.backlog = Array.isArray(s.backlog) ? s.backlog.filter((x) => x && x.id && x.text) : [];
  out.targets = { ...JSON.parse(JSON.stringify(DEFAULT_TARGETS)), ...(s.targets || {}) };
  out.issuesResolved = s.issuesResolved || {};
  return out;
}

/** Loads state, adopting the summer data on first run. Never throws for corrupt data; never deletes it. */
export function load(storage) {
  const raw = storage.getItem(KEY);
  let state = parse(raw);
  let notice = '';
  if (raw && !sane(state)) {
    storage.setItem(`${KEY}.corrupt.${Date.now()}`, raw);
    state = parse(storage.getItem(PREV_KEY));
    if (!sane(state)) state = null;
    notice = state ? 'I dati erano danneggiati: ripristinata la copia precedente (quella danneggiata è conservata).'
      : 'I dati erano danneggiati e sono stati conservati a parte; si riparte da un piano vuoto. Ripristina un backup.';
  }
  if (!state) {
    state = emptyState();
    const legacyRaw = storage.getItem(LEGACY_KEY);
    const legacy = parse(legacyRaw);
    if (legacyRaw) {
      if (!storage.getItem(LEGACY_SNAPSHOT_KEY)) storage.setItem(LEGACY_SNAPSHOT_KEY, legacyRaw);
      state.legacy = legacy;
      if (legacy) notice = notice || 'Dati dell\'estate 2026 importati come storico (intatti anche nella vecchia app).';
    }
  }
  state = migrate(state);
  return { state, notice };
}

export function save(storage, state) {
  const prev = storage.getItem(KEY);
  if (prev) storage.setItem(PREV_KEY, prev);
  storage.setItem(KEY, JSON.stringify(state));
}

export function exportBackup(state, storage) {
  const safe=JSON.parse(JSON.stringify(state));
  if(safe.settings?.push)safe.settings.push=null;
  return JSON.stringify({
    format: 'aurelius-backup', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    state:safe, legacyRaw: storage ? storage.getItem(LEGACY_KEY) : null,
  });
}

/**
 * Accepts a v2 backup file, a raw v2 state, or a summer (v1) export/e-mail. Returns the state to adopt.
 * Summer history is never lost: a backup without it keeps the current one.
 */
export function importBackup(text, current) {
  let t = String(text || '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  const o = parse(t);
  if (!o || typeof o !== 'object') throw new Error('Backup non valido: niente è stato toccato');
  if (o.format === 'aurelius-backup' && o.state) {
    if (!sane(o.state)) throw new Error('Backup danneggiato: niente è stato toccato');
    const s = migrate(o.state);
    if (!s.legacy && o.legacyRaw) s.legacy = parse(o.legacyRaw);
    if (!s.legacy && current?.legacy) s.legacy = current.legacy;
    return s;
  }
  if (o.schema >= 2) {
    if (!sane(o)) throw new Error('Backup danneggiato: niente è stato toccato');
    const s = migrate(o);
    if (!s.legacy && current?.legacy) s.legacy = current.legacy;
    return s;
  }
  if (o.days && typeof o.days === 'object') {
    // Summer 2026 data: adopt it as history, keep the current semester plan and records.
    const s = migrate(JSON.parse(JSON.stringify(current || emptyState())));
    s.legacy = o;
    return s;
  }
  throw new Error('Formato non riconosciuto: niente è stato toccato');
}
