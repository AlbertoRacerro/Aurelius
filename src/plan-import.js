// A personal plan patch is imported locally, not stored in the public GitHub repository.
// Apply it atomically: never overwrite ledger entries, user-edited blocks, or an already-imported plan.
import { dayPlan, validateBlocks } from './schedule.js';

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const DATE = /^\\d{4}-\\d{2}-\\d{2}$/;
const HM = /^([01]\\d|2[0-3]):[0-5]\\d$/;
const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3', 'D']);

function assert(ok, message) { if (!ok) throw new Error(message); }

export function applyPlanPatch(current, plan) {
  assert(plan && typeof plan === 'object' && !Array.isArray(plan)
    && plan.format === 'aurelius-plan-patch' && plan.version === 1
    && ID.test(plan.id || ''), 'Formato piano non valido');
  const applied = Array.isArray(current.importedPlans) ? current.importedPlans : [];
  if (applied.includes(plan.id)) return { state: current, alreadyApplied: true };
  const backlog = plan.backlog || [];
  const edits = plan.blockEdits || [];
  assert(Array.isArray(backlog) && backlog.length <= 100, 'Elenco attività non valido');
  assert(Array.isArray(edits) && edits.length <= 100, 'Modifiche ai blocchi non valide');
  const next = JSON.parse(JSON.stringify(current));
  const known = new Set(next.activities.map((a) => a.id));
  const seen = new Set();
  for (const t of backlog) {
    assert(t && ID.test(t.id || '') && typeof t.text === 'string'
      && t.text.trim().length > 0 && t.text.length <= 300
      && known.has(t.act) && PRIORITIES.has(t.priority || 'P3')
      && (!t.due || (DATE.test(t.due) && !Number.isNaN(Date.parse(t.due)))),
      'Attività del piano non valida');
    assert(!seen.has(t.id), 'Attività duplicata nel piano');
    seen.add(t.id);
    if (!next.backlog.some((x) => x.id === t.id)) {
      next.backlog.push({ id: t.id, act: t.act, text: t.text.trim(),
        priority: t.priority || 'P3', due: t.due || '', done: false, at: Date.now() });
    }
  }
  const days = new Map();
  for (const [i, change] of edits.entries()) {
    assert(change && DATE.test(change.date || '') && !Number.isNaN(Date.parse(change.date))
      && change.find && HM.test(change.find.start || '')
      && HM.test(change.find.end || '') && known.has(change.find.act)
      && Array.isArray(change.replace) && change.replace.length > 0 && change.replace.length <= 8,
      'Modifica calendario non valida');
    if (!days.has(change.date)) days.set(change.date, dayPlan(next, change.date).blocks.map((b) => ({ ...b })));
    const blocks = days.get(change.date);
    const hits = blocks.map((b, n) => ({ b, n })).filter(({ b }) =>
      b.start === change.find.start && b.end === change.find.end && b.act === change.find.act);
    assert(hits.length === 1, `Conflitto nel calendario ${change.date}: blocco ${change.find.start}–${change.find.end} non corrisponde. Nessuna modifica applicata.`);
    const replacement = change.replace.map((b, j) => {
      assert(b && HM.test(b.start || '') && HM.test(b.end || '') && known.has(b.act)
        && typeof (b.note || '') === 'string' && (b.note || '').length <= 300,
        'Nuovo blocco non valido');
      return { id: `p${i}_${j}_${plan.id}`.slice(0, 100),
        start: b.start, end: b.end, act: b.act, note: b.note || '',
        provisional: false, source: 'personal-import' };
    });
    blocks.splice(hits[0].n, 1, ...replacement);
  }
  for (const [date, blocks] of days) {
    const res = validateBlocks(blocks);
    assert(res.errors.length === 0, `Conflitto negli orari del ${date}: ${res.errors.join('; ')}`);
    next.dateOverrides[date] = res.blocks;
  }
  next.importedPlans = [...applied, plan.id];
  return { state: next, alreadyApplied: false, backlogAdded: backlog.length,
    daysEdited: days.size };
}
