import{test,expect}from'@playwright/test';
test.use({serviceWorkers:'allow'});
test('installed shell and edition open after a real offline reload',async({page,context})=>{
 await page.clock.install({time:new Date('2026-10-20T12:00:00+02:00')});await page.goto('./#rituali');await expect(page.locator('.editorial-card')).toHaveCount(3);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();await expect(page.locator('.editorial-card')).toHaveCount(3);
 await context.setOffline(true);await page.reload();await expect(page.locator('.editorial-card')).toHaveCount(3);await page.locator('.editorial-card').first().getByRole('link',{name:/Leggi/}).click();await expect(page.locator('.reader')).toContainText('La distanza');
});
