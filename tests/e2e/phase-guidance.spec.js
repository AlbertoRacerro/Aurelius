import { test, expect } from '@playwright/test';
test('phase-appropriate advice and outlook activate automatically after initial date entry', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-19T12:00:00+02:00')});
  await page.goto('./#rituali');
  await expect(page.locator('.phase-library')).toContainText('Esplora tutte le quattro fasi');
  await expect(page.locator('.phase-library .phase-guide')).toHaveCount(4);
  await page.locator('#r-start').fill('2026-10-01');
  await page.locator('#r-days').fill('28');
  await page.locator('#r-regular').check();
  await page.locator('#r-consent').check();
  // No gesture selections; base advice must be available.
  await page.getByRole('button',{name:'Salva sul dispositivo'}).click();
  await expect(page.locator('.phase-guide[data-phase=luteal]')).toHaveCount(2);
  await expect(page.locator('.phase-timeline .phase-range')).not.toHaveCount(0);
  await expect(page.locator('.phase-guide[data-phase=luteal]').first()).toContainText('Idea di oggi');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aurelius.v2')));
  expect(state).not.toHaveProperty('relationship');
  const care = JSON.parse(await page.evaluate(() => localStorage.getItem('aurelius.relationship.local.v1')));
  expect(care.gestures).toEqual([]);
  await page.locator('#r-start').evaluate((el)=>{el.closest('details').open=true;});
  await page.locator('#r-start').fill('2026-10-17');
  await page.getByRole('button',{name:'Salva sul dispositivo'}).click();
  await expect(page.locator('.phase-guide[data-phase=menstrual]')).toHaveCount(2);
  await expect(page.locator('.phase-guide[data-phase=menstrual]').first()).toContainText('crampi');
});
test('uncertain cycles do not fabricate hormone stages or future phase dates', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-19T12:00:00+02:00')});
  await page.goto('./#rituali');
  await page.locator('#r-start').fill('2026-10-01');
  await page.locator('#r-consent').check();
  await page.getByRole('button',{name:'Salva sul dispositivo'}).click();
  await expect(page.locator('.phase-guide[data-phase=unknown]')).toHaveCount(1);
  await expect(page.locator('.phase-timeline')).toHaveCount(0);
});
