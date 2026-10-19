// iPhone-width end-to-end tests with a controlled clock (Monday 19 Oct 2026, Europe/Rome).
import { test, expect } from '@playwright/test';

const T = (hhmm, day = '2026-10-19') => new Date(`${day}T${hhmm}:00+02:00`);

/** Seeds a plain Monday plan; trackFrom is set so earlier blocks are not asked about. */
async function boot(page, at, { trackFrom = T('06:00'), legacy = null, extra = null } = {}) {
  await page.clock.install({ time: at });
  await page.addInitScript(([tf, legacyRaw, extraJson]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (legacyRaw) localStorage.setItem('aurelius', legacyRaw);
    if (tf) localStorage.setItem('__trackFrom', String(tf));
    if (extraJson) localStorage.setItem('__extra', extraJson);
  }, [trackFrom ? trackFrom.getTime() : 0, legacy, extra ? JSON.stringify(extra) : null]);
  await page.goto('./');
  // Apply the test's trackFrom once the app created its state.
  await page.evaluate(() => {
    const tf = Number(localStorage.getItem('__trackFrom') || 0);
    const s = JSON.parse(localStorage.getItem('aurelius.v2'));
    if (tf) s.settings.trackFrom = tf;
    const extra = JSON.parse(localStorage.getItem('__extra') || 'null');
    if (extra) Object.assign(s, extra);
    localStorage.setItem('aurelius.v2', JSON.stringify(s));
    localStorage.removeItem('__trackFrom'); localStorage.removeItem('__extra');
  });
  await page.reload();
  await expect(page.locator('.now')).toBeVisible();
}

const entries = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('aurelius.v2')).entries);
const mins = (es, act) => es.filter((e) => !act || e.act === act).reduce((n, e) => n + (e.end - e.start) / 60000, 0);

test('Now screen: current block, time left, next block, fast', async ({ page }) => {
  await boot(page, T('10:30'));
  const t0 = Date.now();
  await page.reload();
  await expect(page.locator('.now .what')).toHaveText('Studio (materia da scegliere)');
  expect(Date.now() - t0).toBeLessThan(2000);
  await expect(page.locator('.now .left')).toHaveText("mancano 2h 45'");
  await expect(page.locator('.next')).toContainText('Pausa / pranzo');
  await expect(page.locator('.next')).toContainText('13:15–15:15');
});

test('one tap "Sì, tutto" records the block exactly once', async ({ page }) => {
  await boot(page, T('10:20'));
  // Lezione ATP 08:15–10:15 ended: one tap.
  const card = page.locator('.card.alert', { hasText: 'Lezione ATP' });
  await card.getByRole('button', { name: /Sì, tutto/ }).click();
  await expect(card).toHaveCount(0);
  let es = await entries(page);
  expect(mins(es, 'lez-atp')).toBe(120);
  // Correct it later: reopen from the day list and confirm again — still 120, never 240.
  await page.locator('.day button', { hasText: 'Lezione ATP' }).click();
  await page.getByRole('button', { name: 'Annulla registrazione' }).click();
  await page.locator('#sheet').getByRole('button', { name: 'Sì, tutto' }).click();
  es = await entries(page);
  expect(mins(es, 'lez-atp')).toBe(120);
  // Unconfirmed planned time (ATP 06:20–08:00) never counts.
  expect(mins(es, 'atp')).toBe(0);
});

test('generic study block: one tap on the subject', async ({ page }) => {
  await boot(page, T('13:20'));
  const card = page.locator('.card.alert', { hasText: '10:15–13:15' });
  await card.getByRole('button', { name: 'POCI' }).click();
  expect(mins(await entries(page), 'poci')).toBe(180);
});

test('partial split: ATP 45 + POCI 30 + pausa 15, rest unaccounted', async ({ page }) => {
  await boot(page, T('13:20'));
  const card = page.locator('.card.alert', { hasText: '10:15–13:15' });
  await card.getByRole('button', { name: 'Altro' }).click();
  const sheet = page.locator('#sheet');
  await sheet.getByRole('button', { name: '+ ATP' }).click();
  await sheet.locator('.alloc').nth(0).locator('input').fill('45');
  await sheet.getByRole('button', { name: '+ POCI' }).click();
  await sheet.locator('.alloc').nth(1).locator('input').fill('30');
  await sheet.getByRole('button', { name: '+ Pausa / pranzo' }).click();
  await sheet.locator('.alloc').nth(2).locator('input').fill('15');
  await expect(sheet.locator('#remain')).toHaveText("1h 30'");
  await sheet.getByRole('button', { name: 'Salva' }).click();
  const es = await entries(page);
  expect(mins(es, 'atp')).toBe(45);
  expect(mins(es, 'poci')).toBe(30);
  expect(mins(es, 'pausa')).toBe(15);
  expect(mins(es)).toBe(90);
  // Over-allocation is refused.
  await page.locator('.day button', { hasText: '10:15–13:15' }).click();
  await page.locator('#sheet').getByRole('button', { name: 'In parte' }).click();
  await page.locator('#sheet .alloc').nth(0).locator('input').fill('500');
  await page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#sheet #err')).toContainText('restano');
  expect(mins(await entries(page))).toBe(90);
});

test('timer: start, pause, reload, resume, completes at planned length, confirm', async ({ page }) => {
  await boot(page, T('10:30'));
  await page.getByRole('button', { name: '25\'', exact: true }).first().click();
  await page.getByRole('button', { name: /Avvia ATP · 25'/ }).click();
  await expect(page.locator('#tclock')).toHaveText('25:00');
  await page.clock.fastForward('10:00');
  await expect(page.locator('#tclock')).toHaveText('15:00');
  await page.getByRole('button', { name: 'Pausa', exact: true }).click();
  await page.clock.fastForward('05:00');
  await page.reload();
  await expect(page.locator('#tclock')).toHaveText('15:00');
  await page.getByRole('button', { name: 'Riprendi' }).click();
  // Closed app for an hour: the session stops at the planned length, not later.
  await page.clock.fastForward('01:00:00');
  await page.reload();
  const card = page.locator('[data-session]');
  await expect(card).toContainText("Focus ATP · 25'");
  await card.getByRole('button', { name: 'Correggi' }).click();
  await page.locator('#s-act').selectOption('pseb');
  await page.locator('#s-min').fill('20');
  await page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  const es = await entries(page);
  expect(mins(es, 'pseb')).toBe(20);
  expect(mins(es, 'atp')).toBe(0);
  expect(es.every((e) => !e.unconfirmed)).toBe(true);
});

test('timer inside a block plus "Sì, tutto" does not double count', async ({ page }) => {
  await boot(page, T('11:00'));
  await page.getByRole('button', { name: /Avvia ATP/ }).click();
  await page.clock.fastForward('30:00');
  await page.getByRole('button', { name: 'Stop e registra' }).click();
  await page.locator('[data-session]').getByRole('button', { name: 'Sì, giusto' }).click();
  await page.clock.fastForward('02:00:00'); // 13:30, block 10:15–13:15 ended
  await page.reload();
  const card = page.locator('.card.alert', { hasText: '10:15–13:15' });
  await expect(card).toContainText("2h 30'");
  await card.getByRole('button', { name: 'ATP' }).click();
  expect(mins(await entries(page))).toBe(180);
});

test('plan edits: single date, single week, template, reset', async ({ page }) => {
  await boot(page, T('09:00'));
  await page.click('#nav [data-tab=piano]');
  await page.click('.week button:has-text("21")'); // Wednesday
  await page.getByRole('button', { name: 'Modifica' }).click();
  const sheet = page.locator('#sheet');
  await sheet.locator('input[value=date]').check();
  await sheet.locator('.erow').nth(0).locator('[data-f=act]').selectOption('palestra');
  await sheet.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('.tag', { hasText: 'solo questa data' })).toBeVisible();
  await expect(page.locator('.day li').first()).toContainText('Palestra');
  // Next Wednesday is unaffected.
  await page.getByRole('button', { name: '›' }).click();
  await page.click('.week button:has-text("28")');
  await expect(page.locator('.day li').first()).toContainText('Routine mattina');
  // Week override on Thursday 29 Oct: add a lesson.
  await page.click('.week button:has-text("29")');
  await page.getByRole('button', { name: 'Modifica' }).click();
  await sheet.locator('input[value=week]').check();
  await sheet.getByRole('button', { name: '+ Blocco' }).click();
  const last = sheet.locator('.erow').last();
  await last.locator('[data-f=start]').fill('22:00');
  await last.locator('[data-f=end]').fill('23:00');
  await last.locator('[data-f=act]').selectOption('review');
  await sheet.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('.day li').last()).toContainText('Review');
  // Overlap is refused.
  await page.getByRole('button', { name: 'Modifica' }).click();
  await sheet.locator('.erow').last().locator('[data-f=start]').fill('21:30');
  await sheet.getByRole('button', { name: 'Salva' }).click();
  await expect(sheet.locator('#err')).toContainText('sovrappongono');
  await sheet.getByRole('button', { name: 'Annulla' }).click();
  // Template: every Friday gets the real lesson; copy to Monday too.
  await page.click('.week button:has-text("30")');
  await page.getByRole('button', { name: 'Modifica' }).click();
  await sheet.locator('input[value=template]').check();
  await sheet.locator('.erow').nth(1).locator('[data-f=act]').selectOption('lezione');
  await sheet.getByRole('button', { name: 'Salva' }).click();
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('aurelius.v2')));
  expect(s.template[4][1].act).toBe('lezione');
  expect(s.dateOverrides['2026-10-21'][0].act).toBe('palestra');
  expect(s.weekOverrides['2026-W44'][3].at(-1).act).toBe('review');
  // Reset the Thursday override.
  await page.click('.week button:has-text("29")');
  await page.getByRole('button', { name: 'Torna al modello' }).click();
  await expect(page.locator('.tag', { hasText: 'Modello settimanale' })).toBeVisible();
});

test('summer data is adopted as history and left untouched', async ({ page }) => {
  const legacy = JSON.stringify({ days: { '2026-07-01': { ore: 5 }, '2026-07-02': { ore: 3.5 } }, tlog: [{ a: 1 }], pk: [] });
  await boot(page, T('10:30'), { legacy });
  expect(await page.evaluate(() => localStorage.getItem('aurelius'))).toBe(legacy);
  expect(await page.evaluate(() => localStorage.getItem('aurelius.v1.snapshot'))).toBe(legacy);
  await page.click('#nav [data-tab=stats]');
  await expect(page.locator('text=2 giorni registrati, 8,5 h')).toBeVisible();
});

test('statistics: study vs plan, unaccounted is not wasted', async ({ page }) => {
  await boot(page, T('13:20'));
  await page.locator('.card.alert', { hasText: 'Lezione ATP' }).getByRole('button', { name: /Sì, tutto/ }).click();
  await page.locator('.card.alert', { hasText: '10:15–13:15' }).getByRole('button', { name: 'CPPOM / Plants' }).click();
  await page.click('#nav [data-tab=stats]');
  await expect(page.locator('.kpi', { hasText: 'studio registrato' })).toContainText('3,0 h');
  // Lessons do not count as study; 06:00–08:00 was never confirmed -> unaccounted.
  await expect(page.locator('.kpi', { hasText: 'non registrato' })).toContainText('2,1 h');
  await expect(page.locator('table.t')).toContainText('CPPOM / Plants');
});

test('backup export and restore round trip', async ({ page }) => {
  await boot(page, T('10:20'));
  await page.locator('.card.alert', { hasText: 'Lezione ATP' }).getByRole('button', { name: /Sì, tutto/ }).click();
  await page.click('#nav [data-tab=altro]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Esporta backup' }).click()]);
  const path = await dl.path();
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('aurelius.v2')); s.entries = []; localStorage.setItem('aurelius.v2', JSON.stringify(s)); });
  await page.reload();
  await page.click('#nav [data-tab=altro]');
  page.on('dialog', (d) => d.accept());
  await page.locator('#f-restore').setInputFiles(path);
  await expect(page.locator('#toast')).toHaveText('Backup ripristinato');
  expect(mins(await entries(page), 'lez-atp')).toBe(120);
});
