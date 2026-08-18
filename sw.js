// service worker «Мои дела»: уведомления + офлайн-режим (PWA)
// Этот файл выкладывается отсюда (он в списке $files в deploy-zzz.ps1), локальная
// копия сверена с боевой. При замене картинок обязательно поднимать CACHE.
// v5: страницы кэшируются каждая под своим адресом (задачи / деньги / ZZZ) + картинки ZZZ
// v8: карточки агентов переведены на card_*.webp / hero_*.webp вместо полноразмерных
// art_*.png. Версию обязательно поднимать при любой замене картинок — ветка /img/zzz/
// работает cache-first, иначе браузер вечно отдаёт старый файл под тем же именем.
const CACHE = 'moi-dela-v13';
// Картинки — в отдельном кэше без номера версии. Раньше они лежали вместе со
// страницами, и при каждом обновлении сайта старый кэш удалялся целиком: браузер
// заново тянул около десяти мегабайт артов и значков. На хорошем канале это
// незаметно, на плохом — минуты пустых карточек.
const IMG_CACHE = 'moi-dela-img';
const ASSETS = ['./', './index.html', './money.html', './zzz.html', './zzz-db.json',
                './zzz-extra.json', './zzz-guide.json', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // кэш картинок переживает смену версии, чистим только старые оболочки
      Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // облако и прочие чужие домены не трогаем
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  // Прокси к Enka (Cloudflare Worker на /api/zzz/*) обходим стороной: это живые
  // данные, кешировать их здесь нельзя — иначе после прокачки трекер будет
  // показывать вчерашнюю витрину. Свой кеш у воркера уже есть.
  if (url.pathname.indexOf('/api/') === 0) return;

  if (e.request.mode === 'navigate') {
    // Страница: сеть в приоритете, офлайн — из кэша.
    //
    // Отдать кэш, если сеть не ответила за 6 секунд, — но не бросать при этом
    // саму загрузку: она продолжается и кладёт свежую страницу в кэш, так что
    // следующее открытие будет уже свежим. Без этого получался замкнутый круг:
    // сеть тормозит -> отдаём старую страницу -> в ней старый код, который
    // тормозит ещё сильнее, и новая версия не доезжает вообще никогда.
    e.respondWith((async () => {
      const net = fetch(e.request).then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      });
      const cached = await caches.match(e.request);
      if (!cached) {
        // в кэше пусто — ждём сеть до конца, иначе показывать нечего
        return net.catch(() => caches.match('./index.html'));
      }
      const slow = new Promise(res => setTimeout(() => res(null), 6000));
      const first = await Promise.race([net.catch(() => null), slow]);
      return first || cached;
    })());
    return;
  }

  // Картинки ZZZ: кэш в приоритете (их много, они не меняются) и живут в своём
  // кэше, который не сбрасывается при обновлении сайта.
  if (url.pathname.indexOf('/img/zzz/') !== -1) {
    e.respondWith(
      caches.open(IMG_CACHE).then(c => c.match(e.request).then(cached => cached ||
        fetch(e.request).then(r => {
          if (r.ok) { const c2 = r.clone(); c.put(e.request, c2).catch(() => {}); }
          return r;
        }).catch(() => cached)
      ))
    );
    return;
  }

  // данные трекера: сеть в приоритете. Раньше они отдавались из кэша, и после
  // пересборки zzz-extra.json на сайте ещё сутки могли жить старые прибавки ядра
  if (/zzz-(db|extra|guide|tier)\.json$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const c2 = r.clone(); caches.open(CACHE).then(c => c.put(e.request, c2)); }
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // остальное (иконка, манифест): кэш в приоритете, фоном обновляем.
  // Копию ответа снимаем сразу: тело читается ровно один раз, и если звать
  // clone() уже после того, как ответ ушёл странице, он падает с ошибкой —
  // а вместе с ним падал и весь обработчик, подсовывая старый файл из кэша.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
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
