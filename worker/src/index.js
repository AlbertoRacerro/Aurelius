// Aurelius push worker: stores one Web Push subscription per device and the reminders the app sends it,
// and delivers due reminders from a once-a-minute Cron Trigger. It knows nothing about the plan.
//
// API (JSON; CORS limited to ALLOWED_ORIGIN):
//   GET    /v1/vapid                      -> { key }
//   POST   /v1/register { subscription, enroll?, ntfy? } -> { device, token }
//   PUT    /v1/schedule { items:[{id,at,title,body,url}], ntfy? }   (Bearer token) -> { count }
//   POST   /v1/test                       (Bearer token) -> { status }
//   DELETE /v1/device                     (Bearer token)

import { b64uDecode, b64uEncode, sendPush } from './webpush.js';

const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_ITEMS = 400;
const LEAD_MS = 30_000;        // cron runs once a minute: send up to 30 s early rather than up to 60 s late
const STALE_MS = 2 * 3600_000; // reminders this late are dropped, not sent
const RETRY_MS = 10 * 60_000;  // transient failures are retried for this long

const te = new TextEncoder();

async function sha256(s) {
  return b64uEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s))));
}

function timingSafeEqual(a, b) {
  const x = te.encode(String(a)), y = te.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function origins(env) { return String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean); }

function cors(req, env) {
  const o = req.headers.get('origin');
  const h = { 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400', vary: 'origin' };
  if (o && origins(env).includes(o)) h['access-control-allow-origin'] = o;
  return h;
}

function json(req, env, status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors(req, env) } });
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function vapid(env) {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC) throw new HttpError(503, 'Chiavi VAPID non configurate');
  return { jwk: JSON.parse(env.VAPID_PRIVATE_JWK), publicKey: env.VAPID_PUBLIC, subject: env.VAPID_SUBJECT };
}

function validSubscription(sub, env) {
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) throw new HttpError(400, 'Sottoscrizione non valida');
  let u;
  try { u = new URL(sub.endpoint); } catch { throw new HttpError(400, 'Endpoint non valido'); }
  const anyHost = env.ALLOW_ANY_ENDPOINT === '1';
  if (!anyHost && (u.protocol !== 'https:' || !PUSH_HOSTS.some((r) => r.test(u.hostname)))) throw new HttpError(400, 'Servizio push non riconosciuto');
  let p, a;
  try { p = b64uDecode(sub.keys.p256dh); a = b64uDecode(sub.keys.auth); } catch { throw new HttpError(400, 'Chiavi non valide'); }
  if (p.length !== 65 || p[0] !== 4 || a.length !== 16) throw new HttpError(400, 'Chiavi non valide');
  return p;
}

async function validPoint(p) {
  // Rejects public keys that are not a point on P-256 (encryption would fail at send time).
  try { await crypto.subtle.importKey('raw', p, { name: 'ECDH', namedCurve: 'P-256' }, false, []); } catch { throw new HttpError(400, 'Chiavi non valide'); }
}

function subscriptionFields(sub) {
  return { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
}

function validTopic(t) {
  const s = String(t || '').trim();
  if (s && !ID_RE.test(s)) throw new HttpError(400, 'Canale ntfy non valido');
  return s;
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 200_000) throw new HttpError(413, 'Richiesta troppo grande');
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'JSON non valido'); }
}

async function authDevice(req, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('authorization') || '');
  if (!m) throw new HttpError(401, 'Non autorizzato');
  const dev = await env.DB.prepare('SELECT * FROM devices WHERE token_hash = ?').bind(await sha256(m[1])).first();
  if (!dev) throw new HttpError(401, 'Dispositivo non registrato');
  return dev;
}

async function register(req, env) {
  const body = await readJson(req);
  if (env.ENROLL_KEY && !timingSafeEqual(body.enroll || '', env.ENROLL_KEY)) throw new HttpError(403, 'Codice di registrazione errato');
  await validPoint(validSubscription(body.subscription, env));
  const sub = subscriptionFields(body.subscription);
  const ntfy = validTopic(body.ntfy);
  const now = Date.now();
  const token = b64uEncode(crypto.getRandomValues(new Uint8Array(32)));
  const existing = await env.DB.prepare('SELECT id FROM devices WHERE endpoint = ?').bind(sub.endpoint).first();
  const id = existing?.id || b64uEncode(crypto.getRandomValues(new Uint8Array(12)));
  if (!existing) {
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first();
    if (n >= Number(env.MAX_DEVICES || 3)) throw new HttpError(403, 'Numero massimo di dispositivi raggiunto');
  }
  await env.DB.prepare(`INSERT INTO devices (id, token_hash, endpoint, p256dh, auth, ntfy, created, seen, fails)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, 0)
    ON CONFLICT(id) DO UPDATE SET token_hash = ?2, p256dh = ?4, auth = ?5, ntfy = ?6, seen = ?7, fails = 0`)
    .bind(id, await sha256(token), sub.endpoint, sub.p256dh, sub.auth, ntfy, now).run();
  return { device: id, token };
}

function validItems(items, env, now) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new HttpError(400, 'Elenco promemoria non valido');
  const allowed = origins(env);
  const seen = new Set();
  return items.map((x) => {
    if (!x || !ID_RE.test(x.id) || seen.has(x.id)) throw new HttpError(400, 'Id promemoria non valido');
    seen.add(x.id);
    const at = Number(x.at);
    if (!Number.isFinite(at) || at < now - STALE_MS || at > now + 9 * 864e5) throw new HttpError(400, 'Orario promemoria non valido');
    let u;
    try { u = new URL(x.url); } catch { throw new HttpError(400, 'Link promemoria non valido'); }
    if (!allowed.includes(u.origin)) throw new HttpError(400, 'Link promemoria non consentito');
    return { id: x.id, at: Math.round(at), title: String(x.title || 'Aurelius').slice(0, 120), body: String(x.body || '').slice(0, 300), url: u.href };
  });
}

async function schedule(req, env, dev) {
  const body = await readJson(req);
  const now = Date.now();
  const items = validItems(body.items, env, now);
  const ntfy = body.ntfy === undefined ? dev.ntfy : validTopic(body.ntfy);
  // Schedules carry a client revision; an older one arriving late must not replace a newer one.
  const rev = Number.isSafeInteger(body.rev) && body.rev > 0 ? body.rev : null;
  if (rev !== null && rev <= dev.rev) return { count: 0, stale: true };
  const stmts = [
    env.DB.prepare('DELETE FROM reminders WHERE device = ?').bind(dev.id),
    env.DB.prepare('UPDATE devices SET seen = ?, ntfy = ?, rev = ? WHERE id = ?').bind(now, ntfy, rev ?? dev.rev, dev.id),
    ...items.map((x) => env.DB.prepare(`INSERT INTO reminders (device, id, at, title, body, url)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE NOT EXISTS (SELECT 1 FROM sent WHERE device = ?1 AND id = ?2 AND at = ?3)`)
      .bind(dev.id, x.id, x.at, x.title, x.body, x.url)),
  ];
  await env.DB.batch(stmts);
  return { count: items.length };
}

function message(r) {
  // Declarative Web Push: Safari 18.4+ shows it even if the service worker does not run.
  return { web_push: 8030, notification: { title: r.title, body: r.body, navigate: r.url, tag: r.id, silent: false } };
}

async function ntfy(topic, r, fetchImpl) {
  try {
    await fetchImpl('https://ntfy.sh/', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic, title: r.title, message: r.body, click: r.url, priority: 4 }) });
  } catch { /* fallback is best effort */ }
}

/** Delivers one reminder; returns 'sent' | 'gone' | 'retry' | 'failed'. */
export async function deliver(env, dev, r, fetchImpl = fetch) {
  const status = await sendPush(dev, message(r), vapid(env), { ttl: 1800, urgency: 'high', topic: r.id.slice(0, 32) }, fetchImpl);
  if (status >= 200 && status < 300) {
    if (dev.fails) await env.DB.prepare('UPDATE devices SET fails = 0 WHERE id = ?').bind(dev.id).run();
    return 'sent';
  }
  if (status === 404 || status === 410) {
    // The subscription no longer exists (app removed, permission revoked): forget the device.
    await env.DB.batch([env.DB.prepare('DELETE FROM reminders WHERE device = ?').bind(dev.id),
      env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(dev.id)]);
    if (dev.ntfy) await ntfy(dev.ntfy, r, fetchImpl);
    return 'gone';
  }
  await env.DB.prepare('UPDATE devices SET fails = fails + 1 WHERE id = ?').bind(dev.id).run();
  if (dev.ntfy) await ntfy(dev.ntfy, r, fetchImpl);
  return status === 0 || status === 429 || status >= 500 ? 'retry' : 'failed';
}

/** Cron: claim due reminders atomically (so overlapping runs never send twice), then deliver them. */
export async function runDue(env, now = Date.now(), fetchImpl = fetch) {
  const { results } = await env.DB.prepare(`DELETE FROM reminders WHERE rowid IN
      (SELECT rowid FROM reminders WHERE at <= ? ORDER BY at LIMIT 50) RETURNING *`).bind(now + LEAD_MS).all();
  const out = { sent: 0, dropped: 0, retried: 0, failed: 0 };
  if (results.length) {
    await env.DB.batch(results.map((r) => env.DB.prepare('INSERT OR IGNORE INTO sent (device, id, at) VALUES (?, ?, ?)').bind(r.device, r.id, r.at)));
  }
  await env.DB.prepare('DELETE FROM sent WHERE at < ?').bind(now - 3 * 864e5).run();
  const devices = new Map();
  for (const r of results) {
    try {
      await deliverOne(env, r, now, devices, out, fetchImpl);
    } catch {
      out.failed += 1; // one bad device or reminder never blocks the rest of the batch
    }
  }
  return out;
}

async function deliverOne(env, r, now, devices, out, fetchImpl) {
  if (r.at < now - STALE_MS) { out.dropped += 1; return; }
  if (!devices.has(r.device)) devices.set(r.device, await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(r.device).first());
  const dev = devices.get(r.device);
  if (!dev) { out.dropped += 1; return; }
  const res = await deliver(env, dev, r, fetchImpl);
  if (res === 'sent') out.sent += 1;
  else if (res === 'gone') devices.set(r.device, null);
  else if (res === 'retry' && r.at > now - RETRY_MS) {
    out.retried += 1;
    await env.DB.prepare('INSERT OR IGNORE INTO reminders (device, id, at, title, body, url) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(r.device, r.id, r.at, r.title, r.body, r.url).run();
  } else out.failed += 1;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
    const { pathname } = new URL(req.url);
    try {
      if (req.method === 'GET' && pathname === '/v1/vapid') return json(req, env, 200, { key: vapid(env).publicKey });
      if (req.method === 'GET' && pathname === '/v1/health') return json(req, env, 200, { ok: true });
      if (req.method === 'POST' && pathname === '/v1/register') return json(req, env, 200, await register(req, env));
      if (req.method === 'PUT' && pathname === '/v1/schedule') return json(req, env, 200, await schedule(req, env, await authDevice(req, env)));
      if (req.method === 'POST' && pathname === '/v1/test') {
        const dev = await authDevice(req, env);
        const r = { id: 'test', title: 'Aurelius', body: 'Notifica di prova: funziona.', url: env.APP_URL || `${origins(env)[0] || ''}/` };
        return json(req, env, 200, { result: await deliver(env, dev, r) });
      }
      if (req.method === 'DELETE' && pathname === '/v1/device') {
        const dev = await authDevice(req, env);
        await env.DB.batch([env.DB.prepare('DELETE FROM reminders WHERE device = ?').bind(dev.id),
          env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(dev.id)]);
        return json(req, env, 200, { ok: true });
      }
      return json(req, env, 404, { error: 'Non trovato' });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json(req, env, status, { error: status === 500 ? 'Errore interno' : err.message });
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runDue(env));
  },
};
