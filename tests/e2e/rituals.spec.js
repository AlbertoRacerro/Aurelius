import { test, expect } from '@playwright/test';

test('rituals can store consented local data without adding it to Aurelius backup/state', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-19T07:30:00+02:00')});
  await page.goto('./#rituali');
  await expect(page.locator('.ritual-quote')).toContainText('Pensiero del giorno');
  await expect(page.locator('h1')).toContainText('Rituali');
  await page.locator('#r-start').fill('2026-10-01');
  await page.locator('#r-days').fill('28');
  await page.locator('#r-period').fill('5');
  await page.locator('#r-regular').check();
  await page.locator('[data-gesture=tea]').check();
  await page.locator('#r-consent').check();
  await page.locator('#r-care-notify').check();
  await page.getByRole('button', { name: 'Salva sul dispositivo' }).click();
  await expect(page.locator('h1')).toContainText('Rituali');
  await expect(page.locator('.card', {hasText:'Giorno indicativo'}).first()).toBeVisible();
  let saved = await page.evaluate(() => ({
    privateData: localStorage.getItem('aurelius.relationship.local.v1'),
    main: localStorage.getItem('aurelius.v2'),
  }));
  expect(JSON.parse(saved.privateData).lastStart).toBe('2026-10-01');
  expect(JSON.parse(saved.main).settings.habits.care.enabled).toBe(true);
  expect(saved.main).not.toContain('lastStart');
  expect(saved.main).not.toContain('2026-10-01');
  await page.reload();
  await expect(page.locator('#r-start')).toHaveValue('2026-10-01');
  await page.locator('#r-quote-enable').uncheck();
  await page.getByRole('button', {name:'Salva notifica'}).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aurelius.v2')).settings.habits.quote.enabled)).toBe(false);
  await page.locator('#r-start').evaluate((el) => { el.closest('details').open = true; });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', {name:'Cancella dati e notifiche'}).click();
  expect(await page.evaluate(() => localStorage.getItem('aurelius.relationship.local.v1'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aurelius.v2')).settings.habits.care.enabled)).toBe(false);
});

test('a user without consent cannot save a third-party cycle record', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-19T07:30:00+02:00')});
  await page.goto('./#rituali');
  await page.locator('#r-start').fill('2026-10-01');
  await page.getByRole('button', {name:'Salva sul dispositivo'}).click();
  expect(await page.evaluate(() => localStorage.getItem('aurelius.relationship.local.v1'))).toBeNull();
});
