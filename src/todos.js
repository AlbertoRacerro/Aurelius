// Task management is separate from time accounting: checking an item never adds study hours.
export const PRIORITIES = Object.freeze([
  { id: 'P0', label: 'Urgente' },
  { id: 'P1', label: 'Alta priorità' },
  { id: 'P2', label: 'Importante' },
  { id: 'P3', label: 'Flessibile' },
  { id: 'D', label: 'Rimandata' },
]);
const rank = Object.fromEntries(PRIORITIES.map((p, i) => [p.id, i]));

export function taskPriority(task) {
  return Object.hasOwn(rank, task?.priority) ? task.priority : 'P3';
}

export function orderedTasks(backlog, filter = 'open') {
  const tasks = (Array.isArray(backlog) ? backlog : []).filter((task) =>
    task && task.id && typeof task.text === 'string');
  const shown = tasks.filter((task) => filter === 'all' || (filter === 'done' ? task.done : !task.done));
  return shown.slice().sort((a, b) =>
    Number(!!a.done) - Number(!!b.done) ||
    rank[taskPriority(a)] - rank[taskPriority(b)] ||
    String(a.due || '9999-12-31').localeCompare(String(b.due || '9999-12-31')) ||
    Number(a.at || 0) - Number(b.at || 0) ||
    String(a.id).localeCompare(String(b.id)));
}

export function normalizeTaskInput(input, activities) {
  const text = String(input.text || '').trim();
  if (!text || text.length > 300) throw new Error('Inserisci un testo (massimo 300 caratteri)');
  const priority = input.priority || 'P3';
  if (!Object.hasOwn(rank, priority)) throw new Error('Priorità non valida');
  const act = String(input.act || '');
  if (!activities.some((a) => a.id === act)) throw new Error('Categoria non valida');
  const due = String(input.due || '');
  if (due && (!/^\\d{4}-\\d{2}-\\d{2}$/.test(due) ||
    Number.isNaN(Date.parse(due)))) throw new Error('Scadenza non valida');
  return { text, priority, act, due };
}
