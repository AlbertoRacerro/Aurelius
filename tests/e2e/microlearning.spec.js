import {test,expect} from '@playwright/test';
test('four finite cards, optional sources, saved copies and archive without a completion counter',async({page})=>{
 await page.clock.install({time:new Date('2026-10-22T12:00:00+02:00')});await page.goto('./#microlearning');
 await expect(page.locator('.micro-card')).toHaveCount(4);await expect(page.getByRole('heading',{name:'Per oggi è tutto.'})).toBeVisible();
 await expect(page.locator('.micro-card').first().locator('details')).not.toHaveAttribute('open','');
 await page.locator('.micro-card').first().getByRole('button',{name:'Conserva',exact:true}).click();await expect(page.locator('.micro-card').first().getByRole('button',{name:'Conservata ✓'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('link',{name:'Le tue salvate'}).click();await expect(page.locator('.micro-card')).toHaveCount(1);await page.reload();await expect(page.locator('.micro-card')).toHaveCount(1);
 await page.getByRole('link',{name:'Archivio',exact:true}).click();await expect(page.getByText('Le schede restano qui. Nessun arretrato da recuperare.')).toBeVisible();await page.locator('.micro-archive a').first().click();await expect(page.locator('.micro-card')).toHaveCount(4);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/microlearning-phone.png',fullPage:true});
});
test('private copy includes current tasks without exporting authentication or push credentials',async({page})=>{
 await page.clock.install({time:new Date('2026-10-22T12:00:00+02:00')});let body;
 await page.addInitScript(()=>{localStorage.setItem('aurelius.personal.auth.v1','x'.repeat(32));localStorage.setItem('aurelius.v2',JSON.stringify({schema:2,entries:[],backlog:[{id:'test-task',text:'Synthetic task',done:false}],settings:{tz:'Europe/Rome'}}));});
 await page.route('**/v1/personal/snapshot',async r=>{body=r.request().postDataJSON();await r.fulfill({json:{received:true,revision:body.snapshot.revision,context_hash:body.context_hash}});});
 await page.goto('./#inbox');await expect.poll(()=>!!body).toBe(true);expect(body.snapshot.state.backlog[0].id).toBe('test-task');expect(JSON.stringify(body.snapshot)).not.toContain('x'.repeat(32));
 await expect(page.locator('#private-sync-status')).toContainText('Copia privata aggiornata');await expect(page.locator('#inbox-text')).toHaveValue('');
});
test.describe('installed microlearning',()=>{test.use({serviceWorkers:'allow'});test('cached date and saved card survive a real offline reopen',async({page,context})=>{
 await page.clock.install({time:new Date('2026-10-22T12:00:00+02:00')});await page.goto('./#microlearning');await expect(page.locator('.micro-card')).toHaveCount(4);await page.evaluate(async()=>navigator.serviceWorker.ready);await page.reload();
 await page.locator('.micro-card').first().getByRole('button',{name:'Conserva',exact:true}).click();await context.setOffline(true);await page.reload();await expect(page.locator('.micro-card')).toHaveCount(4);await page.getByRole('link',{name:'Le tue salvate'}).click();await expect(page.locator('.micro-card')).toHaveCount(1);
});});
