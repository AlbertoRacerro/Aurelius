// Service worker: offline app shell, Web Push display and notification taps.
// Same-origin GETs are network-first with a short timeout, so updates arrive promptly and the app still
// opens instantly offline or on a slow network.

const CACHE = 'aurelius-v2.4.1';
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png',
  'src/app.js', 'src/config.js', 'src/model.js', 'src/store.js', 'src/time.js', 'src/schedule.js', 'src/ledger.js',
  'src/timer.js', 'src/stats.js', 'src/reminders.js', 'src/plan-import.js', 'src/todos.js', 'src/todo-view.js', 'src/reflections.js', 'src/relationship.js', 'src/phase-guidance.js', 'src/rituals-view.js', 'src/push.js'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k.startsWith('aurelius-')) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const first = await Promise.race([net, timeout]);
      if (first) return first;
    } catch { /* offline: fall back to cache */ }
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    return net;
  })());
});

// Payloads use the Declarative Web Push format ({ web_push: 8030, notification: {...} }); Safari 18.4+
// can display them without this handler, older versions rely on it.
self.addEventListener('push', (ev) => {
  let data = {};
  try { data = ev.data ? ev.data.json() : {}; } catch { data = { notification: { title: 'Aurelius', body: ev.data?.text() || '' } }; }
  const n = data.notification || data;
  ev.waitUntil(self.registration.showNotification(n.title || 'Aurelius', {
    body: n.body || '', tag: n.tag, data: { url: n.navigate || n.url || './' }, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = new URL(ev.notification.data?.url || './', self.registration.scope).href;
  ev.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        w.postMessage({ type: 'open', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
