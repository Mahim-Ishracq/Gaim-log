const CACHE = 'gainlog-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Cache-first for app shell; network-only for API calls
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.hostname === 'api.anthropic.com') return; // never cache API calls
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      if (res.ok && url.origin === self.location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() => cached))
  );
});

// ---- Reminder notifications (best-effort) ----
const REMINDERS = [
  { hour: 8,  title: 'Breakfast time 🌅', body: "Big breakfast, big gains. Log it when you're done!" },
  { hour: 13, title: 'Lunch check-in 🍛', body: "Don't skip lunch — log your meal to stay on track." },
  { hour: 20, title: 'Dinner reminder 🌙', body: 'Last big meal of the day. Log it and check your surplus!' },
];

async function maybeNotify() {
  const now = new Date();
  const hour = now.getHours();
  const todayKey = now.toDateString();
  for (const r of REMINDERS) {
    // fire if we're within 2 hours after the slot
    if (hour >= r.hour && hour < r.hour + 2) {
      const tag = `gainlog-${r.hour}-${todayKey}`;
      const existing = await self.registration.getNotifications({ tag });
      if (existing.length === 0) {
        // check a marker in cache to avoid re-firing after dismissal
        const cache = await caches.open('gainlog-notif-markers');
        const marker = await cache.match(`https://local/marker/${tag}`);
        if (!marker) {
          await self.registration.showNotification(r.title, {
            body: r.body,
            tag,
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png',
          });
          await cache.put(`https://local/marker/${tag}`, new Response('1'));
        }
      }
    }
  }
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'gainlog-reminders') e.waitUntil(maybeNotify());
});

self.addEventListener('message', (e) => {
  if (e.data === 'check-reminders') e.waitUntil ? e.waitUntil(maybeNotify()) : maybeNotify();
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
