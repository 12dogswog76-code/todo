// service worker «Мои дела»: уведомления + офлайн-режим (PWA) + Web Push
const CACHE = 'moi-dela-v5';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; }).catch(() => cached);
      return cached || net;
    })
  );
});

// === Web Push: показать уведомление ===
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Мои дела', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Мои дела';
  const opts = {
    body: d.body || '',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || 'https://alextask.ru' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// клик по уведомлению — открыть/сфокусировать сайт
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      for (const w of ws) { if ('focus' in w) { try { w.navigate(url); } catch (_) {} return w.focus(); } }
      return clients.openWindow(url);
    })
  );
});
