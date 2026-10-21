import{test,expect}from'@playwright/test';
const clock=async page=>page.clock.install({time:new Date('2026-10-20T12:00:00+02:00')});
test('three-slot board, long reader, positive reasons, offline edit and authenticated retry without push',async({page})=>{
 await clock(page);await page.goto('./#rituali');await expect(page.locator('.editorial-card')).toHaveCount(3);await expect(page.locator('#nav')).toContainText('Rituali');await expect(page.locator('#nav')).not.toContainText('Statistiche');
 await page.locator('.editorial-card').nth(1).getByRole('link',{name:/Leggi/}).click();await expect(page.locator('.reader')).toContainText('Il diritto di cambiare idea');await expect(page.locator('.reader .sources a')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Tanto',exact:true}).click();await page.locator('[data-reason=too_short]').check();await page.getByRole('button',{name:'Salva feedback',exact:true}).click();await expect(page.locator('#feedback-status')).toContainText('Salvato sul dispositivo');
 let sent;await page.route('**/v1/feedback',async route=>{sent=route.request().postDataJSON();expect(route.request().headers().authorization).toBe('Bearer '+'x'.repeat(32));await route.fulfill({json:{received:true,published:false}});});
 await page.getByText('Collega feedback pubblico',{exact:true}).click();await page.locator('#editorial-token').fill('x'.repeat(32));await page.getByRole('button',{name:'Salva codice e sincronizza'}).click();await expect(page.locator('#feedback-status')).toContainText('Ricevuto dal server');expect(sent.score).toBe(3);expect(sent.reasons).toEqual(['too_short']);
 await page.unroute('**/v1/feedback');await page.route('**/v1/feedback',r=>r.abort());await page.getByRole('button',{name:'Per niente',exact:true}).click();await page.getByRole('button',{name:'Salta motivazione'}).click();
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('aurelius.feedback.local.v1'))).length)).toBe(1);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aurelius.v2')).settings.push)).toBeNull();
 await page.reload();await expect(page.locator('.reader')).toBeVisible();await expect(page.locator('#feedback-status')).toContainText('Salvato sul dispositivo');
});
test('morning deep link opens the correct article and missing day is visibly stale',async({page})=>{
 await clock(page);
 // Model an unavailable edition explicitly; published content must not change this case.
 await page.route('**/content/editions/2026-10-21.json',r=>r.fulfill({status:404,body:'Not found'}));
 await page.route('**/content/manifest.json',r=>r.fulfill({json:{schema:1,latest:'2026-10-20',editions:['2026-10-20']}}));
 await page.goto('./?edition=2026-10-20#rituali');
 await expect(page.locator('.reader h2')).toContainText('La distanza');
 await page.goto('./#article/philosophy/2026-10-21');
 await expect(page.locator('.reader')).toBeVisible();
 await expect(page.locator('main')).toContainText('Pubblicazione di oggi non disponibile');
 await expect(page.locator('main')).toContainText('2026-10-20');
});

test('ideas plan is voluntary, shopping ingredient union and structured context survives calendar edit',async({page})=>{await clock(page);await page.goto('./#idee');const card=page.locator('.card',{hasText:'Pancake avena e castagne'});await expect(card).toBeVisible();await card.getByRole('button',{name:'Aggiungi ingredienti alla spesa'}).click();await card.getByRole('button',{name:'Aggiungi ingredienti alla spesa'}).click();await page.goto('./#spesa');await expect(page.locator('.shopping-row')).toHaveCount(3);await page.locator('.shopping-row input').first().check();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aurelius.v2')).shopping[0].inHouse)).toBe(true);await page.goto('./#idee');await card.getByRole('button',{name:'Pianifica',exact:true}).click();const sheet=page.locator('#sheet');const row=sheet.locator('.erow').last();await expect(row.locator('[data-f=note]')).toHaveValue('Pancake avena e castagne');expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('aurelius.v2')).dateOverrides).length)).toBe(0);await row.locator('[data-f=start]').fill('22:00');await row.locator('[data-f=end]').fill('22:30');await row.locator('[data-f=context]').selectOption('shopping');await sheet.getByRole('button',{name:'Salva',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aurelius.v2')).dateOverrides['2026-10-20'].at(-1).context)).toBe('shopping');});
test('cached edition remains readable with network blocked',async({page,context})=>{await clock(page);await page.goto('./#rituali');await expect(page.locator('.editorial-card')).toHaveCount(3);await page.route('**/content/**',r=>r.abort());await page.reload();await expect(page.locator('.editorial-card')).toHaveCount(3);await page.locator('.editorial-card').first().getByRole('link',{name:/Leggi/}).click();await expect(page.locator('.reader')).toBeVisible();});
test('late edition response does not erase a private form being edited',async({page})=>{
 await clock(page);let release;const gate=new Promise(r=>{release=r;});await page.route('**/content/editions/2026-10-20.json',async route=>{await gate;await route.continue();});await page.goto('./#rituali');await page.locator('#r-start').fill('2026-10-01');const response=page.waitForResponse(r=>r.url().endsWith('/content/editions/2026-10-20.json'));release();await response;await page.waitForTimeout(150);await expect(page.locator('#r-start')).toHaveValue('2026-10-01');
});
