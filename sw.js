// ВНИМАНИЕ: это устаревшая копия. Источник правды — репозиторий 12dogswog76-code/todo. НЕ деплоить.
// service worker «Мои дела»: уведомления + офлайн-режим (PWA)
// v5: страницы кэшируются каждая под своим адресом (задачи / деньги / ZZZ) + картинки ZZZ
// v8: карточки агентов переведены на card_*.webp / hero_*.webp вместо полноразмерных
// art_*.png. Версию обязательно поднимать при любой замене картинок — ветка /img/zzz/
// работает cache-first, иначе браузер вечно отдаёт старый файл под тем же именем.
const CACHE = 'moi-dela-v9';
const ASSETS = ['./', './index.html', './money.html', './zzz.html', './zzz-db.json', './zzz-extra.json', './manifest.json', './icon.svg'];

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
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  // картинки ZZZ: кэш в приоритете (их много, они не меняются)
  if (url.pathname.indexOf('/img/zzz/') !== -1) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
        if (r.ok) { const c2 = r.clone(); caches.open(CACHE).then(c => c.put(e.request, c2)); }
        return r;
      }).catch(() => cached))
    );
    return;
  }

  // данные трекера: сеть в приоритете. Раньше они отдавались из кэша, и после
  // пересборки zzz-extra.json на сайте ещё сутки могли жить старые прибавки ядра
  if (/zzz-(db|extra)\.json$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const c2 = r.clone(); caches.open(CACHE).then(c => c.put(e.request, c2)); }
        return r;
      }).catch(() => caches.match(e.request))
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
