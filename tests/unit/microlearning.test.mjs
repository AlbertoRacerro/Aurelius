import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateMicroEdition,loadMicro,rule30,MICRO_CACHE} from '../../src/microlearning.js';
import {renderMicro} from '../../src/microlearning-view.js';
const edition=JSON.parse(readFileSync(new URL('../../content/microlearning/editions/2026-10-22.json',import.meta.url)));
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
test('four autonomous cards, unique IDs and safe source links; exact rule 30 generations',()=>{
 assert.equal(validateMicroEdition(edition).cards.length,4);
 const bad=structuredClone(edition);bad.cards[1].id=bad.cards[0].id;assert.throws(()=>validateMicroEdition(bad));
 bad.cards[1].id='safe';bad.cards[0].sources[0].url='javascript:alert(1)';assert.throws(()=>validateMicroEdition(bad));
 assert.deepEqual(rule30(4),[[0,0,0,0,1,0,0,0,0],[0,0,0,1,1,1,0,0,0],[0,0,1,1,0,0,1,0,0],[0,1,1,0,1,1,1,1,0]]);
 const html=renderMicro({edition,dates:[edition.date]},s=>String(s),[], 'feed');assert.match(html,/Per oggi è tutto/);assert.doesNotMatch(html,/streak|arretrato|completa/i);
 // Saved cards imported from a backup cannot smuggle unsafe links into the page.
 const forged={...edition.cards[0],sources:[{title:'bad',url:'javascript:alert(1)'}]};assert.doesNotMatch(renderMicro(null,String,[forged],'saved'),/javascript:/);
});
test('offline reopen retains exact date and archive; an unavailable old edition never masquerades as today',async()=>{
 const store=storage(),manifest={schema:1,latest:edition.date,editions:['2026-10-21',edition.date]};
 const online=async url=>Response.json(String(url).endsWith('manifest.json')?manifest:edition);
 const initial=await loadMicro(store,new URL('https://example.test/content/'),edition.date,online);assert.equal(initial.offline,false);
 const offline=async()=>{throw Error('offline');};const repeat=await loadMicro(store,new URL('https://example.test/content/'),edition.date,offline);assert.equal(repeat.edition.date,edition.date);assert.equal(repeat.offline,true);assert.equal(repeat.dates.length,2);
 const old=await loadMicro(store,new URL('https://example.test/content/'),'2026-10-21',offline);assert.equal(old.edition,null);assert.match(old.error,/non è salvata/);
 assert.ok(JSON.parse(store.getItem(MICRO_CACHE)).editions[edition.date]);
});
