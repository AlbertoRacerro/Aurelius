import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedTasks, normalizeTaskInput, taskPriority } from '../../src/todos.js';
import { emptyState } from '../../src/model.js';

const tasks = [
  { id: 'a', text: 'Lavare vestiti', act: 'vita', priority: 'P1', due: '2026-10-25', done: false, at: 4 },
  { id: 'b', text: 'Costumi Halloween', act: 'vita', priority: 'P0', due: '2026-10-21', done: false, at: 2 },
  { id: 'c', text: 'Pulire camera', act: 'vita', priority: 'P1', due: '2026-10-20', done: false, at: 1 },
  { id: 'd', text: 'Contattare un amico', act: 'vita', priority: 'P3', done: true, at: 3 },
  { id: 'e', text: 'Consulenza dicembre', act: 'bluerev', priority: 'D', done: false, at: 5 },
];
test('sorts open tasks by priority and within priority by due date; completed separate', () => {
  assert.deepEqual(orderedTasks(tasks).map(x => x.id), ['b','c','a','e']);
  assert.deepEqual(orderedTasks(tasks,'done').map(x => x.id), ['d']);
  assert.deepEqual(orderedTasks(tasks,'all').map(x => x.id), ['b','c','a','e','d']);
});
test('old backlog entries missing priority default to flexible', () => {
  assert.equal(taskPriority({ id: 'legacy' }), 'P3');
});
test('new and edited personal tasks require valid fields', () => {
  const acts = emptyState().activities;
  assert.deepEqual(normalizeTaskInput({ text:'  Pulire camera  ', priority:'P1', act:'vita', due:'2026-10-25' },acts),
    { text:'Pulire camera',priority:'P1',act:'vita',due:'2026-10-25' });
  assert.throws(() => normalizeTaskInput({text:'',act:'vita'},acts), /testo/);
  assert.throws(() => normalizeTaskInput({text:'ok',priority:'P9',act:'vita'},acts), /Priorità/);
  assert.throws(() => normalizeTaskInput({text:'ok',priority:'P2',act:'???'},acts), /Categoria/);
  assert.throws(() => normalizeTaskInput({text:'ok',priority:'P2',act:'vita',due:'2026-02-30'},acts), /Scadenza/);
});
