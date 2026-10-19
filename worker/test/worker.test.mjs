// Push worker tests: a D1 stand-in on node:sqlite, a fake push service, and decryption of what the worker
// sends with an independent implementation (http_ece) to prove the RFC 8291/8292 output is valid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createECDH, randomBytes, createPublicKey, verify } from 'node:crypto';
import ece from 'http_ece';
import worker, { runDue } from '../src/index.js';
import { b64uEncode, b64uDecode } from '../src/webpush.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    _exec: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => { db.exec('BEGIN'); try { for (const s of stmts) s._exec(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return []; },
    raw: db,
  };
}

async function vapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
  return { jwk, pub };
}

let subSeq = 0;
function browserSub(endpoint = `https://web.push.apple.com/QQ-${++subSeq}`) {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  return { ua, auth, json: { endpoint, keys: { p256dh: b64uEncode(ua.getPublicKey()), auth: b64uEncode(auth) } } };
}

const ORIGIN = 'https://albertoracerro.github.io';
async function setup(extra = {}) {
  const { jwk, pub } = await vapidKeys();
  const env = { DB: d1(), VAPID_PRIVATE_JWK: JSON.stringify(jwk), VAPID_PUBLIC: pub, VAPID_SUBJECT: 'https://albertoracerro.github.io/Aurelius/',
    ALLOWED_ORIGIN: ORIGIN, APP_URL: `${ORIGIN}/Aurelius/`, MAX_DEVICES: '3', ...extra };
  const call = async (method, path, body, token) => {
    const res = await worker.fetch(new Request(`https://w.test${path}`, { method, headers: {
      origin: ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, data: await res.json(), headers: res.headers };
  };
  return { env, call, pub };
}

function pushService(status = 201) {
  const sent = [];
  const impl = async (url, init) => { sent.push({ url, init }); return new Response(null, { status: typeof status === 'function' ? status(url) : status }); };
  return { sent, impl };
}

function decrypt(sub, body) {
  return JSON.parse(ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: sub.ua, dh: undefined, authSecret: sub.auth }).toString());
}

test('register, schedule, cron delivers a decryptable declarative push with valid VAPID', async () => {
  const { env, call, pub } = await setup();
  const sub = browserSub();
  const reg = await call('POST', '/v1/register', { subscription: sub.json });
  assert.equal(reg.status, 200);
  assert.equal(reg.headers.get('access-control-allow-origin'), ORIGIN);
  const now = Date.now();
  const items = [
    { id: 'b1', at: now + 10_000, title: 'Finito: ATP', body: '10:15–13:15', url: `${ORIGIN}/Aurelius/?occ=x` },
    { id: 'b2', at: now + 3600_000, title: 'Finito: POCI', body: 'later', url: `${ORIGIN}/Aurelius/?occ=y` },
  ];
  const sch = await call('PUT', '/v1/schedule', { items }, reg.data.token);
  assert.deepEqual(sch.data, { count: 2 });

  const ps = pushService();
  const r = await runDue(env, now, ps.impl);
  assert.equal(r.sent, 1);
  assert.equal(ps.sent.length, 1);
  const { url, init } = ps.sent[0];
  assert.equal(url, sub.json.endpoint);
  assert.equal(init.headers['content-encoding'], 'aes128gcm');
  assert.equal(init.headers.urgency, 'high');
  assert.equal(init.headers.ttl, '1800');
  const msg = decrypt(sub, init.body);
  assert.deepEqual(msg, { web_push: 8030, notification: { title: 'Finito: ATP', body: '10:15–13:15', navigate: `${ORIGIN}/Aurelius/?occ=x`, tag: 'b1', silent: false } });

  // VAPID: ES256 JWT for the push service origin, signed by the advertised key, expiring within 24 h.
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(init.headers.authorization);
  assert.ok(m);
  assert.equal(m[4], pub);
  const claims = JSON.parse(Buffer.from(b64uDecode(m[2])).toString());
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.ok(claims.exp * 1000 - Date.now() <= 24 * 3600_000);
  assert.match(claims.sub, /^https:\/\//);
  const raw = b64uDecode(pub);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64uEncode(raw.slice(1, 33)), y: b64uEncode(raw.slice(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64uDecode(m[3]))));

  // Sent once only: a second run finds nothing due.
  assert.equal((await runDue(env, now, ps.impl)).sent, 0);
  // Re-scheduling replaces the device's pending reminders.
  await call('PUT', '/v1/schedule', { items: [] }, reg.data.token);
  assert.equal((await runDue(env, now + 7200_000, ps.impl)).sent, 0);
});

test('expired subscription (410) removes the device; transient failures are retried, stale ones dropped', async () => {
  const { env, call } = await setup();
  const reg = await call('POST', '/v1/register', { subscription: browserSub().json });
  const now = Date.now();
  await call('PUT', '/v1/schedule', { items: [{ id: 'a', at: now, title: 't', body: '', url: `${ORIGIN}/Aurelius/` }] }, reg.data.token);
  const flaky = pushService(503);
  assert.equal((await runDue(env, now, flaky.impl)).retried, 1);
  assert.equal((await runDue(env, now + 60_000, flaky.impl)).retried, 1);
  assert.equal((await runDue(env, now + 11 * 60_000, flaky.impl)).failed, 1); // retry window over
  await call('PUT', '/v1/schedule', { items: [{ id: 'a2', at: now, title: 't', body: '', url: `${ORIGIN}/Aurelius/` }] }, reg.data.token);
  const gone = pushService(410);
  await runDue(env, now, gone.impl);
  const again = await call('PUT', '/v1/schedule', { items: [] }, reg.data.token);
  assert.equal(again.status, 401);
});

test('validation: push host allowlist, link origin, ids, auth, device cap, enrollment key', async () => {
  const { call } = await setup();
  assert.equal((await call('POST', '/v1/register', { subscription: browserSub('https://evil.test/x').json })).status, 400);
  assert.equal((await call('POST', '/v1/register', { subscription: browserSub('http://web.push.apple.com/x').json })).status, 400);
  const reg = await call('POST', '/v1/register', { subscription: browserSub().json });
  const bad = await call('PUT', '/v1/schedule', { items: [{ id: 'a', at: Date.now() + 1000, title: 't', body: '', url: 'https://evil.test/' }] }, reg.data.token);
  assert.equal(bad.status, 400);
  assert.equal((await call('PUT', '/v1/schedule', { items: [{ id: 'a b', at: Date.now(), url: `${ORIGIN}/` }] }, reg.data.token)).status, 400);
  assert.equal((await call('PUT', '/v1/schedule', { items: [] }, 'x'.repeat(43))).status, 401);
  assert.equal((await call('PUT', '/v1/schedule', { items: [] })).status, 401);
  // Re-registering the same endpoint keeps one device; the old token stops working.
  const sub = browserSub('https://web.push.apple.com/same');
  const r1 = await call('POST', '/v1/register', { subscription: sub.json });
  const r2 = await call('POST', '/v1/register', { subscription: sub.json });
  assert.equal(r1.data.device, r2.data.device);
  assert.equal((await call('PUT', '/v1/schedule', { items: [] }, r1.data.token)).status, 401);
  await call('POST', '/v1/register', { subscription: browserSub().json });
  assert.equal((await call('POST', '/v1/register', { subscription: browserSub().json })).status, 403); // cap 3

  const locked = await setup({ ENROLL_KEY: 'k3y-secret' });
  assert.equal((await locked.call('POST', '/v1/register', { subscription: browserSub().json })).status, 403);
  assert.equal((await locked.call('POST', '/v1/register', { subscription: browserSub().json, enroll: 'k3y-secret' })).status, 200);
});

test('CORS refuses other origins; secrets never appear in responses', async () => {
  const { env } = await setup();
  const res = await worker.fetch(new Request('https://w.test/v1/vapid', { headers: { origin: 'https://evil.test' } }), env);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  const text = await res.text();
  assert.ok(!text.includes(JSON.parse(env.VAPID_PRIVATE_JWK).d));
});

test('a reminder already sent is not sent again when the app re-syncs before its time', async () => {
  const { env, call } = await setup();
  const reg = await call('POST', '/v1/register', { subscription: browserSub().json });
  const now = Date.now();
  const item = { id: 'early', at: now + 20_000, title: 't', body: '', url: `${ORIGIN}/Aurelius/` };
  await call('PUT', '/v1/schedule', { items: [item] }, reg.data.token);
  const ps = pushService();
  assert.equal((await runDue(env, now, ps.impl)).sent, 1);       // sent 20 s early
  await call('PUT', '/v1/schedule', { items: [item] }, reg.data.token); // app re-syncs the same reminder
  assert.equal((await runDue(env, now + 25_000, ps.impl)).sent, 0);
  assert.equal(ps.sent.length, 1);
  // A rescheduled reminder (same id, new time, e.g. timer resumed) is still delivered.
  await call('PUT', '/v1/schedule', { items: [{ ...item, at: now + 600_000 }] }, reg.data.token);
  assert.equal((await runDue(env, now + 600_000, ps.impl)).sent, 1);
});

test('an off-curve key is refused at registration; one failing reminder does not drop the batch', async () => {
  const { env, call } = await setup();
  const bad = browserSub();
  const p = Buffer.from(b64uDecode(bad.json.keys.p256dh));
  p[64] ^= 1; // still 65 bytes starting with 04, but no longer on the curve
  bad.json.keys.p256dh = b64uEncode(p);
  assert.equal((await call('POST', '/v1/register', { subscription: bad.json })).status, 400);

  const a = await call('POST', '/v1/register', { subscription: browserSub().json });
  const b = await call('POST', '/v1/register', { subscription: browserSub().json });
  // Corrupt device a's stored key behind the API's back.
  env.DB.raw.prepare('UPDATE devices SET p256dh = ? WHERE id = ?').run(b64uEncode(p), a.data.device);
  const now = Date.now();
  await call('PUT', '/v1/schedule', { items: [{ id: 'x', at: now, title: 't', body: '', url: `${ORIGIN}/` }] }, a.data.token);
  await call('PUT', '/v1/schedule', { items: [{ id: 'y', at: now, title: 't', body: '', url: `${ORIGIN}/` }] }, b.data.token);
  const ps = pushService();
  const r = await runDue(env, now, ps.impl);
  assert.equal(r.sent, 1);
  assert.equal(r.failed, 1);
});

test('an older schedule revision arriving late does not replace a newer one', async () => {
  const { env, call } = await setup();
  const reg = await call('POST', '/v1/register', { subscription: browserSub().json });
  const now = Date.now();
  const newer = await call('PUT', '/v1/schedule', { rev: 200, items: [] }, reg.data.token);
  assert.equal(newer.data.count, 0);
  const older = await call('PUT', '/v1/schedule', { rev: 100, items: [{ id: 'timer', at: now, title: 't', body: '', url: `${ORIGIN}/` }] }, reg.data.token);
  assert.equal(older.data.stale, true);
  assert.equal((await runDue(env, now, pushService().impl)).sent, 0);
});

test('a re-sync keeps a reminder waiting for retry after a transient failure', async () => {
  const { env, call } = await setup();
  const reg = await call('POST', '/v1/register', { subscription: browserSub().json });
  const now = Date.now();
  await call('PUT', '/v1/schedule', { rev: 1, items: [{ id: 'r', at: now, title: 't', body: '', url: `${ORIGIN}/` }] }, reg.data.token);
  assert.equal((await runDue(env, now, pushService(503).impl)).retried, 1);
  await call('PUT', '/v1/schedule', { rev: 2, items: [] }, reg.data.token); // app re-syncs; the block is over
  const ok = pushService(201);
  assert.equal((await runDue(env, now + 60_000, ok.impl)).sent, 1);
});

test('concurrent schedules: the higher revision wins whatever the commit order', async () => {
  for (const order of [[100, 200], [200, 100]]) {
    const { env, call } = await setup();
    const reg = await call('POST', '/v1/register', { subscription: browserSub().json });
    const now = Date.now();
    const body = (rev) => ({ rev, items: rev === 100 ? [{ id: 'timer', at: now, title: 'old', body: '', url: `${ORIGIN}/` }] : [] });
    await Promise.all(order.map((rev) => call('PUT', '/v1/schedule', body(rev), reg.data.token)));
    assert.equal((await runDue(env, now, pushService().impl)).sent, 0, `order ${order}`);
  }
});
