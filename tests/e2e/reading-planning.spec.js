import {test,expect} from '@playwright/test';
const at=new Date('2026-10-21T10:33:00+02:00');
async function home(page){
 await page.clock.install({time:new Date(at.getTime()-60000)});await page.clock.pauseAt(at);await page.goto('./');
 await page.evaluate(()=>{
  const s=JSON.parse(localStorage.getItem('aurelius.v2'));
  s.dateOverrides['2026-10-21']=[{id:'two-hours',start:'10:00',end:'12:00',act:'poci'}];s.settings.trackFrom=Date.now();
  s.backlog=[{id:'task',text:'Attività sintetica di prova',act:'vita',priority:'P1',done:false,at:Date.now()}];
  localStorage.setItem('aurelius.v2',JSON.stringify(s));
 });await page.reload();
}
test('home hierarchy and current-block edit: 75 available minutes, no actual hours invented',async({page})=>{
 await home(page);
 const tops=await page.locator('.now,.home-cycle,.home-inbox,.home-checklist,.day').evaluateAll(xs=>xs.map(x=>x.offsetTop));
 expect(tops).toEqual([...tops].sort((a,b)=>a-b));
 await expect(page.locator('.day [aria-current=time]')).toContainText('POCI');
 await page.locator('.home-checklist input').check();await expect(page.locator('.home-checklist .is-done')).toBeVisible();
 await page.locator('.now').getByRole('button',{name:'Modifica il tempo rimanente'}).click();
 const sheet=page.locator('#sheet');await expect(sheet).toContainText("1h 15' disponibili");
 await sheet.getByRole('button',{name:'+ ATP',exact:true}).click();await expect(sheet.locator('[data-f=min]')).toHaveValue('75');
 await sheet.locator('[data-f=min]').fill('90');await sheet.getByRole('button',{name:'Aggiorna piano'}).click();await expect(sheet.locator('#err')).toContainText('Restano 75');
 await sheet.locator('[data-f=min]').fill('75');await sheet.getByRole('button',{name:'Aggiorna piano'}).click();await expect(sheet).toBeHidden();
 const s=await page.evaluate(()=>JSON.parse(localStorage.getItem('aurelius.v2')));expect(s.entries).toEqual([]);expect(s.accounts).toEqual({});
 expect(s.dateOverrides['2026-10-21'].map(b=>[b.start,b.end,b.act])).toEqual([['10:00','10:33','poci'],['10:33','11:48','atp'],['11:48','12:00','poci']]);
 await expect(page.locator('.now .what')).toHaveText('ATP');await expect(page.locator('.day .past')).toHaveCount(1);
});
test('an open editor rechecks elapsed time, rejects stale duration, and does not backdate',async({page})=>{
 await home(page);await page.locator('.now [data-act=replan-open]').click();await page.locator('#sheet').getByRole('button',{name:'+ ATP',exact:true}).click();
 await page.clock.fastForward('16:00');await page.locator('#sheet').getByRole('button',{name:'Aggiorna piano'}).click();
 await expect(page.locator('#sheet #err')).toContainText('Restano 60');
 await page.locator('#sheet [data-f=min]').fill('60');await page.locator('#sheet').getByRole('button',{name:'Aggiorna piano'}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aurelius.v2')).dateOverrides['2026-10-21'][1].start)).toBe('10:49');
});
test('paper default ignores OS dark mode; every theme retains legibility and preferences survive reload',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});await page.clock.install({time:at});await page.goto('./#article/books/2026-10-21');await expect(page.locator('.reader')).toBeVisible();
 const colors=async()=>page.locator('.reader').evaluate(el=>{
  const style=getComputedStyle(el),root=getComputedStyle(document.documentElement);
  const lum=color=>{const a=color.match(/\d+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*a[0]+.7152*a[1]+.0722*a[2];};
  const foreground=lum(style.color),background=lum(getComputedStyle(document.body).backgroundColor);
  return {bg:root.getPropertyValue('--bg').trim(),font:style.fontSize,contrast:(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)};
 });
 expect((await colors()).bg).toBe('#e9e6de');
 await page.getByText('Aspetto della lettura',{exact:true}).click();
 for(const theme of ['paper','mist','night']){await page.locator('[data-reader=theme]').selectOption(theme);expect((await colors()).contrast).toBeGreaterThanOrEqual(4.5);}
 await page.locator('[data-reader=font]').selectOption('sans');await page.locator('[data-reader=size]').selectOption('24');await page.reload();
 expect((await colors()).font).toBe('24px');expect((await colors()).bg).toBe('#272d2a');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByText('Aspetto della lettura',{exact:true}).click();await page.getByRole('button',{name:'Ripristina lettura'}).click();expect((await colors()).bg).toBe('#e9e6de');expect((await colors()).font).toBe('20px');
});
test('Radar supports real bullet lists and accessible charts with numeric values and provenance',async({page})=>{
 await page.clock.install({time:at});
 await page.route('**/content/editions/2026-10-21.json',async route=>{const response=await route.fetch();const data=await response.json();const s=data.articles[2].sections[0];s.bullets=['Risultato sintetico di test','Condizioni del confronto di test'];s.chart={title:'Confronto di prova',unit:'token/s',bars:[{label:'A',value:10},{label:'B',value:20}],note:'Dati sintetici solo per questa prova',source_url:'https://example.org/benchmark'};await route.fulfill({json:data});});
 await page.goto('./#article/future/2026-10-21');await expect(page.locator('.reader .editorial-bullets li')).toHaveCount(2);await expect(page.locator('.editorial-chart')).toContainText('10 token/s');await expect(page.locator('.editorial-chart a')).toHaveAttribute('href','https://example.org/benchmark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
