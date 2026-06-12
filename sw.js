// service worker «Мои дела»: уведомления + офлайн-режим (PWA)
const CACHE = 'moi-dela-v3';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
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
  // облако и прочие чужие домены не трогаем
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate') {
    // страница: сеть в приоритете, офлайн — из кэша
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // остальное (иконка, манифест): кэш в приоритете, фоном обновляем
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(r => {
        caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

// клик по уведомлению — открыть/сфокусировать сайт
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      for (const w of ws) {
        if ('focus' in w) return w.focus();
      }
      return clients.openWindow('./');
    })
  );
});
