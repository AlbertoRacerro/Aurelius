import {test,expect} from '@playwright/test';
const clock=async page=>page.clock.install({time:new Date('2026-10-21T12:00:00+02:00')});
test('notes and draft survive offline reload; plaintext is escaped; no credentials or state leave without linking',async({page,context})=>{
 await clock(page);let requests=0;await page.route('**/v1/personal/**',r=>{requests++;return r.abort();});
 await page.goto('./#inbox');await page.locator('#inbox-text').fill('Nota sintetica <script>alert(1)</script>');await page.getByRole('button',{name:'Salva nota',exact:true}).click();
 await expect(page.locator('.inbox-note')).toContainText('Sul dispositivo');await expect(page.locator('.inbox-note')).toContainText('<script>');expect(requests).toBe(0);
 await page.locator('#inbox-text').fill('Bozza ancora da salvare');await page.reload();await expect(page.locator('#inbox-text')).toHaveValue('Bozza ancora da salvare');await expect(page.locator('.inbox-note')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('authenticated note-only synchronization applies bounded results and undo preserves a locally completed task',async({page})=>{
 await clock(page);let note;let pending=true;
 await page.route('**/v1/personal/notes',async r=>{expect(r.request().headers().authorization).toBe('Bearer '+'x'.repeat(32));note=r.request().postDataJSON();expect(Object.keys(note).sort()).toEqual(['created_at','id','schema','text','timezone']);await r.fulfill({json:{received:true,id:note.id}});});
 await page.route('**/v1/personal/poll',async r=>r.fulfill({json:{results:pending?[]:[{schema:1,note_id:note.id,summary:'Aggiunte attività e serie',operations:[{id:'a',type:'task',text:'Comprare oggetto sintetico'},{id:'b',type:'list',text:'Serie Esempio',list:'Serie'},{id:'c',type:'idea',text:'Hobby di prova'}]}],errors:[]}}));
 await page.goto('./#inbox');await page.locator('#inbox-text').fill('Comprare oggetto sintetico; Serie Esempio da vedere');await page.getByRole('button',{name:'Salva nota',exact:true}).click();
 await page.getByText('Collega archivio privato',{exact:true}).click();await page.locator('#personal-token').fill('x'.repeat(32));await page.getByRole('button',{name:'Salva codice e collega'}).click();await expect(page.locator('#inbox-status')).toContainText('Archivio sincronizzato');await expect(page.locator('.inbox-note')).toContainText('In attesa di elaborazione');
 await page.locator('#inbox-text').fill('Non cancellare questa bozza');pending=false;await page.getByRole('button',{name:'Sincronizza',exact:true}).click();await expect(page.locator('.inbox-note')).toContainText('Organizzata');await expect(page.locator('#inbox-text')).toHaveValue('Non cancellare questa bozza');
 await expect(page.locator('.inbox-item').filter({hasText:'Serie Esempio'})).toBeVisible();
 await page.goto('./#todos');const task=page.locator('.todo-item',{hasText:'Comprare oggetto sintetico'});await expect(task).toBeVisible();await task.locator('input[type=checkbox]').click();
 await page.goto('./#inbox');await page.getByRole('button',{name:'Annulla aggiunte',exact:true}).click();await expect(page.locator('.inbox-item')).toHaveCount(0);
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('aurelius.v2')));expect(state.backlog.find(x=>x.sourceNote===note.id).done).toBe(true);expect(state.entries).toHaveLength(0);expect(Object.keys(state.dateOverrides)).toHaveLength(0);
 await page.reload();await expect(page.getByText('Collegamento personale salvato',{exact:true})).toBeVisible();await expect(page.locator('.inbox-note')).toContainText('annullata');
});
test('503 never acknowledges queued note; late sync preserves edits; disconnect retains notes',async({page})=>{
 await clock(page);await page.addInitScript(()=>localStorage.setItem('aurelius.personal.auth.v1','x'.repeat(32)));
 await page.route('**/v1/personal/notes',r=>r.fulfill({status:503,json:{error:'Archivio non configurato'}}));
 await page.goto('./#inbox');await page.locator('#inbox-text').fill('Nota di prova');await page.getByRole('button',{name:'Salva nota',exact:true}).click();await expect(page.locator('#inbox-status')).toContainText('Archivio non configurato');await expect(page.locator('.inbox-note')).toContainText('Sul dispositivo');
 await page.getByText('Collegamento personale salvato',{exact:true}).click();await page.getByRole('button',{name:'Scollega',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('aurelius.personal.auth.v1'))).toBeNull();await expect(page.locator('.inbox-note')).toHaveCount(1);
});

test('late result merges the latest saved state and preserves a draft and a completed duplicate',async({page})=>{
 await clock(page);let note,release;const gate=new Promise(r=>release=r);
 await page.route('**/v1/personal/notes',async r=>{note=r.request().postDataJSON();await r.fulfill({json:{received:true,id:note.id}});});
 await page.route('**/v1/personal/poll',async r=>{await gate;await r.fulfill({json:{results:[{schema:1,note_id:note.id,summary:'Organizzata',operations:[{id:'a',type:'task',text:'Attività sintetica'}]}],errors:[]}});});
 await page.goto('./#inbox');await page.locator('#inbox-text').fill('Attività sintetica');await page.getByRole('button',{name:'Salva nota',exact:true}).click();await page.getByText('Collega archivio privato',{exact:true}).click();await page.locator('#personal-token').fill('x'.repeat(32));await page.getByRole('button',{name:'Salva codice e collega'}).click();
 await expect.poll(()=>!!note).toBe(true);await page.locator('#inbox-text').fill('Bozza durante la sincronizzazione');
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('aurelius.v2'));s.backlog.push({id:'manual-task',text:'Attività sintetica',done:true,priority:'P0',act:'vita',at:1});localStorage.setItem('aurelius.v2',JSON.stringify(s));});
 release();await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('aurelius.v2')).personalInbox.receipts.length)).toBe(1);
 await expect(page.locator('#inbox-text')).toHaveValue('Bozza durante la sincronizzazione');
 const tasks=await page.evaluate(()=>JSON.parse(localStorage.getItem('aurelius.v2')).backlog);expect(tasks).toHaveLength(1);expect(tasks[0].done).toBe(true);expect(tasks[0].priority).toBe('P0');
});

test.describe('installed inbox',()=>{
 test.use({serviceWorkers:'allow'});
 test('new note stays available after a real offline reload',async({page,context})=>{
  await clock(page);await page.goto('./#inbox');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
  await context.setOffline(true);await page.locator('#inbox-text').fill('Nota offline sintetica');await page.getByRole('button',{name:'Salva nota',exact:true}).click();await page.reload();await expect(page.locator('.inbox-note')).toContainText('Nota offline sintetica');await expect(page.locator('.inbox-note')).toContainText('Sul dispositivo');
 });
});
