// Dedicated checklist is the primary surface for the private backlog imported earlier.
import { test, expect } from '@playwright/test';

const T = (hhmm) => new Date('2026-10-19T' + hhmm + ':00+02:00');

async function bootWithBacklog(page, backlog) {
  await page.clock.install({ time: T('12:00') });
  await page.addInitScript((tasks) => {
    if (sessionStorage.getItem('todos-seeded')) return;
    sessionStorage.setItem('todos-seeded', '1');
    localStorage.clear();
    localStorage.setItem('aurelius.v2', JSON.stringify({
      schema: 2, entries: [], backlog: tasks, settings: { trackFrom: Date.now() },
    }));
  }, backlog);
  await page.goto('./#todos');
  await expect(page.locator('h1')).toContainText('Da fare');
}

test('imported backlog appears sorted; completion, adding and editing persist after reload', async ({ page }) => {
  await bootWithBacklog(page, [
    { id: 'p1', act: 'vita', text:'Pulire camera', priority:'P1', due:'2026-10-25', done:false, at:1 },
    { id: 'p0', act: 'vita', text:'Costumi Halloween', priority:'P0', due:'2026-10-21', done:false, at:2 },
    { id: 'd', act: 'bluerev', text:'Avvocato IP', priority:'D', done:false, at:3 },
  ]);
  await expect(page.locator('.todo-item')).toHaveCount(3);
  await expect(page.locator('.todo-item').first()).toContainText('Costumi Halloween');
  await expect(page.locator('.todo-item').last()).toContainText('Avvocato IP');

  // A click redraws the row immediately; .check() waits on the detached checkbox.
  await page.locator('[data-todo-id="p1"] input[type=checkbox]').click();
  await expect(page.locator('.todo-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Completate' }).click();
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await expect(page.locator('.todo-item')).toContainText('Pulire camera');
  await page.getByRole('button', { name: 'Aperte' }).click();

  await page.locator('#q-text').fill('Fare il bucato');
  await page.locator('#q-priority').selectOption('P1');
  await page.locator('#q-act').selectOption('vita');
  await page.locator('#q-due').fill('2026-10-22');
  await page.getByRole('button', { name: /Aggiungi alla checklist/ }).click();
  await expect(page.locator('.todo-item')).toHaveCount(3);
  const added = page.locator('.todo-item', { hasText: 'Fare il bucato' });
  await added.getByRole('button', { name: 'Modifica attività' }).click();
  await page.locator('#b-text').fill('Lavare vestiti delicati');
  await page.locator('#b-priority').selectOption('P0');
  await page.getByRole('button', { name: 'Salva modifiche' }).click();
  await expect(page.locator('.todo-item').nth(1)).toContainText('Lavare vestiti delicati');
  await page.reload();
  await expect(page.locator('.todo-item').nth(1)).toContainText('Lavare vestiti delicati');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aurelius.v2')));
  expect(saved.backlog).toHaveLength(4);
  expect(saved.backlog.find(x => x.id === 'p1').done).toBe(true);
  expect(saved.backlog.find(x => x.text === 'Lavare vestiti delicati').priority).toBe('P0');
  expect(saved.entries).toHaveLength(0);

  const row = page.locator('.todo-item', { hasText:'Lavare vestiti delicati' });
  await row.getByRole('button', { name: 'Modifica attività' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Elimina' }).click();
  await expect(page.locator('.todo-item', { hasText:'Lavare vestiti delicati' })).toHaveCount(0);
});

test('personal plan import feeds Da fare without duplicating tasks', async ({ page }) => {
  await bootWithBacklog(page, []);
  await page.locator('#nav [data-tab=altro]').click();
  const plan = { format:'aurelius-plan-patch', version:1, id:'test-import-checklist',
    backlog:[{id:'safe-imported',act:'vita',text:'Pulizia e riordino',priority:'P1',due:'2026-10-25'}],
    blockEdits:[] };
  page.once('dialog', (d) => d.accept());
  await page.locator('#f-plan').setInputFiles({
    name:'plan.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(plan)),
  });
  await expect(page.getByText('Piano personale importato', { exact: true })).toBeVisible();
  await page.locator('#nav [data-tab=todos]').click();
  await expect(page.locator('.todo-item')).toContainText('Pulizia e riordino');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aurelius.v2')));
  expect(state.importedPlans).toContain('test-import-checklist');
  expect(state.backlog).toHaveLength(1);
});
