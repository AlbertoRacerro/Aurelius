import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const token = 'synthetic-personal-token-1234567890';
const id = '12345678-1234-4123-8123-123456789abc';
const note = { schema: 1, id, text: 'Nota sintetica è 日本語', created_at: 123, timezone: 'Europe/Rome' };

test('Cloudflare runtime uploads private notes and refuses redirects without forwarding credentials', async () => {
 const calls = [];
 let redirectAt = '';
 const mf = new Miniflare(convertV4MiniflareOptions({
  modulesRoot: fileURLToPath(new URL('../../', import.meta.url)),
  modules: ['worker/src/index.js','worker/src/private-sync.js','src/private-sync-contract.js','src/store.js','src/model.js','src/ideas.js','src/schedule.js','src/time.js', 'worker/src/personal.js', 'worker/src/editorial.js', 'worker/src/webpush.js', 'src/inbox-contract.js', 'src/editorial-contract.js'].map(path => ({ type: 'ESModule', path: fileURLToPath(new URL('../../' + path, import.meta.url)) })),
  compatibilityDate: '2026-10-01',
  d1Databases: ['DB'],
  bindings: { PERSONAL_TOKEN: token, GITHUB_PERSONAL_TOKEN: 'synthetic-github-token', PERSONAL_REPO: 'AlbertoRacerro/-Aurelius-Personal' },
  outboundService: async request => {
   const url = new URL(request.url);
   calls.push({ url: request.url, method: request.method, authorization: request.headers.get('authorization'), body: request.method === 'PUT' ? await request.json() : null });
   assert.equal(url.hostname, 'api.github.com');
   const stage = !url.pathname.includes('/contents/') ? 'repository' : request.method === 'PUT' ? 'write' : url.pathname.endsWith('/inbox') ? 'list' : 'read';
   if (stage === redirectAt) return new Response(null, { status: 302, headers: { location: 'https://unexpected.example/credential-target' } });
   if (stage === 'repository') return Response.json({ private: true });
   if (stage === 'read') return Response.json({}, { status: 404 });
   if (stage === 'list') return Response.json([]);
   return Response.json({ commit: { sha: 'synthetic' } }, { status: 201 });
  },
 }));
 try {
  const db = await mf.getD1Database('DB');
  await db.exec(readFileSync(new URL('../migrations/0003_personal.sql', import.meta.url), 'utf8').replace(/^--.*$/gm, '').trim());
  const upload = () => mf.dispatchFetch('https://worker.test/v1/personal/notes', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(note) });
  const accepted = await upload();
  assert.equal(accepted.status, 200, await accepted.text());
  assert.equal(calls.length, 4);
  const write = calls.find(call => call.method === 'PUT');
  assert.deepEqual(JSON.parse(Buffer.from(write.body.content, 'base64').toString('utf8')), note);
  assert.ok(calls.every(call => call.authorization === 'Bearer synthetic-github-token'));
  for (const [stage, expectedCode, expectedCalls] of [['repository', 'REPOSITORY', 1], ['read', 'NOTE_READ', 2], ['list', 'INBOX_LIST', 3], ['write', 'NOTE_WRITE', 4]]) {
   redirectAt = stage;
   calls.length = 0;
   const response = await upload();
   assert.equal(response.status, 503);
   assert.equal((await response.json()).code, `PERSONAL_${expectedCode}_302`);
   assert.equal(calls.length, expectedCalls);
  }
 } finally {
  await mf.dispose();
 }
});

test('Cloudflare runtime accepts a private state copy, proves context digest and never forwards credentials on a redirect',async()=>{
 const {makeSnapshot}=await import('../../src/private-sync.js');const {emptyState}=await import('../../src/model.js');
 const files=new Map(),storage=new Map(),store={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};let redirected=false;
 const mf=new Miniflare(convertV4MiniflareOptions({
  modulesRoot:fileURLToPath(new URL('../../',import.meta.url)),
  modules:['worker/src/index.js','worker/src/private-sync.js','src/private-sync-contract.js','src/store.js','src/model.js','src/ideas.js','src/schedule.js','src/time.js','worker/src/personal.js','worker/src/editorial.js','worker/src/webpush.js','src/inbox-contract.js','src/editorial-contract.js'].map(path=>({type:'ESModule',path:fileURLToPath(new URL('../../'+path,import.meta.url))})),
  compatibilityDate:'2026-10-01',d1Databases:['DB'],bindings:{PERSONAL_TOKEN:token,GITHUB_PERSONAL_TOKEN:'synthetic-github-token',PERSONAL_REPO:'AlbertoRacerro/-Aurelius-Personal'},
  outboundService:async request=>{assert.equal(new URL(request.url).hostname,'api.github.com');if(redirected)return new Response(null,{status:302,headers:{location:'https://unexpected.example/private'}});if(!request.url.includes('/contents/'))return Response.json({private:true});if(request.method==='PUT'){const body=await request.json();files.set(request.url,{content:body.content,sha:'synthetic-sha'});return Response.json({content:{sha:'synthetic-sha'}});}return Response.json({},{status:404});}
 }));
 try{
  const db=await mf.getD1Database('DB');for(const file of ['migrations/0003_personal.sql','migrations/0004_private_sync.sql'])await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const body=await makeSnapshot(emptyState(),store);const send=()=>mf.dispatchFetch('https://worker.test/v1/personal/snapshot',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({...body,device_token:''})});
  const accepted=await send();assert.equal(accepted.status,200,await accepted.text());assert.equal(files.size,1);const copy=JSON.parse(Buffer.from([...files.values()][0].content,'base64'));assert.equal(copy.context_hash,body.context_hash);assert.doesNotMatch(JSON.stringify(copy),/synthetic-github-token|device_token/);
  redirected=true;const refused=await send();assert.equal(refused.status,503);assert.doesNotMatch(await refused.text(),/synthetic-github-token|unexpected/);
 }finally{await mf.dispose();}
});
