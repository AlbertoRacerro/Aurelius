// Web Push client: opt-in (from a tap), registration with the push worker, and reminder sync.
// The device token returned by the worker is the only credential; it never leaves this device except
// as a bearer token to the worker, and it is stripped from backups.

import { PUSH_API, VAPID_PUBLIC } from './config.js';

export function apiBase(state) {
  return String(state.settings.pushApi || PUSH_API || '').trim().replace(/\/+$/, '');
}

export function support() {
  const standalone = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
    || navigator.standalone === true;
  return {
    sw: 'serviceWorker' in navigator,
    push: typeof window.PushManager !== 'undefined',
    notif: typeof window.Notification !== 'undefined',
    permission: typeof window.Notification !== 'undefined' ? Notification.permission : 'unsupported',
    standalone,
    ios: /iPhone|iPad|iPod/.test(navigator.userAgent),
  };
}

function fromB64u(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function call(api, path, { method = 'GET', token = '', body } = {}) {
  const res = await fetch(api + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Errore del server (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Must be started directly from a tap: iOS only shows the permission prompt for a user gesture. */
export async function enable(state, enrollKey = '') {
  const api = apiBase(state);
  if (!api) throw new Error('Server notifiche non configurato');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied'
    ? 'Notifiche negate: riattivale in Impostazioni › Notifiche › Aurelius' : 'Permesso non concesso');
  const key = VAPID_PUBLIC || (await call(api, '/v1/vapid')).key;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
  const r = await call(api, '/v1/register', { method: 'POST',
    body: { subscription: sub.toJSON(), enroll: enrollKey || undefined, ntfy: state.settings.ntfyTopic || undefined } });
  return { api, device: r.device, token: r.token, endpoint: sub.endpoint, at: Date.now(), syncedHash: '' };
}

export async function disable(push) {
  try { await call(push.api, '/v1/device', { method: 'DELETE', token: push.token }); } catch { /* best effort */ }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch { /* best effort */ }
}

export function hashItems(items, extra = '') {
  let h = 2166136261;
  const s = JSON.stringify(items) + extra;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export async function sync(push, items, ntfy, rev) {
  return call(push.api, '/v1/schedule', { method: 'PUT', token: push.token, body: { items, ntfy: ntfy || '', rev } });
}

export async function test(push) {
  return call(push.api, '/v1/test', { method: 'POST', token: push.token, body: {} });
}
