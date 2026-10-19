// Persistence. The summer 2026 app stored everything under localStorage['aurelius'] (schema 1). This app never
// writes that key: it keeps a verbatim copy inside its own state (`legacy`), snapshots the raw string once
// under 'aurelius.v1.snapshot', and stores its own state under 'aurelius.v2'. The legacy page in /legacy/
// keeps working on the original key.

import { SCHEMA_VERSION, DEFAULT_ACTIVITIES, defaultSettings, emptyState, DEFAULT_TARGETS } from './model.js';

export const KEY = 'aurelius.v2';
export const PREV_KEY = 'aurelius.v2.prev';
export const LEGACY_KEY = 'aurelius';
export const LEGACY_SNAPSHOT_KEY = 'aurelius.v1.snapshot';

function parse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

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
  const acts = Array.isArray(s.activities) ? s.activities.filter((a) => a && a.id) : [];
  for (const d of DEFAULT_ACTIVITIES) if (!acts.some((a) => a.id === d.id)) acts.push({ ...d });
  out.activities = acts;
  out.template = {};
  for (let d = 0; d < 7; d++) out.template[d] = Array.isArray(s.template?.[d]) ? s.template[d] : (s.template ? [] : base.template[d]);
  out.weekOverrides = s.weekOverrides && typeof s.weekOverrides === 'object' ? s.weekOverrides : {};
  out.dateOverrides = s.dateOverrides && typeof s.dateOverrides === 'object' ? s.dateOverrides : {};
  const seen = new Set();
  out.entries = (Array.isArray(s.entries) ? s.entries : []).filter((e) => {
    if (!e || !e.id || seen.has(e.id) || !(Number(e.end) > Number(e.start)) || !e.act) return false;
    seen.add(e.id); return true;
  });
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
  if (raw && !state) {
    storage.setItem(`${KEY}.corrupt.${Date.now()}`, raw);
    state = parse(storage.getItem(PREV_KEY));
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
  return JSON.stringify({
    format: 'aurelius-backup', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    state, legacyRaw: storage ? storage.getItem(LEGACY_KEY) : null,
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
    const s = migrate(o.state);
    if (!s.legacy && o.legacyRaw) s.legacy = parse(o.legacyRaw);
    if (!s.legacy && current?.legacy) s.legacy = current.legacy;
    return s;
  }
  if (o.schema >= 2) {
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
