// Web Push sender with WebCrypto only: RFC 8291 (aes128gcm message encryption) and RFC 8292 (VAPID).

const te = new TextEncoder();

export function b64uEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/**
 * Encrypts `plaintext` for a subscription (RFC 8291). `salt` and `asKeyPair` are for tests only.
 * Returns the complete aes128gcm body (header + single record).
 */
export async function encrypt(plaintext, p256dh, auth, { salt, asKeyPair } = {}) {
  const uaPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  const as = asKeyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(s, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(s, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(plaintext, new Uint8Array([2])); // 0x02: last (and only) record
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(s, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ct);
}

/** VAPID Authorization header value. The JWT is valid for 12 hours (Apple accepts at most 24). */
export async function vapidHeader(endpoint, privateJwk, publicKey, subject, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const h = b64uEncode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64uEncode(te.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const { kty, crv, x, y, d } = privateJwk;
  const key = await crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${h}.${c}`)));
  return `vapid t=${h}.${c}.${b64uEncode(sig)}, k=${publicKey}`;
}

/** Sends one push. Returns the push service's HTTP status (or 0 on network failure). */
export async function sendPush(device, message, vapid, { ttl = 1800, urgency = 'high', topic } = {}, fetchImpl = fetch) {
  const body = await encrypt(te.encode(JSON.stringify(message)), device.p256dh, device.auth);
  const headers = {
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
    ttl: String(ttl),
    urgency,
    authorization: await vapidHeader(device.endpoint, vapid.jwk, vapid.publicKey, vapid.subject),
  };
  if (topic) headers.topic = topic;
  try {
    const res = await fetchImpl(device.endpoint, { method: 'POST', headers, body });
    return res.status;
  } catch {
    return 0;
  }
}
