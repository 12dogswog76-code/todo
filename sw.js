// service worker «Мои дела»: уведомления + офлайн-режим (PWA)
// Этот файл выкладывается отсюда (он в списке $files в deploy-zzz.ps1), локальная
// копия сверена с боевой. При замене картинок обязательно поднимать CACHE.
// v5: страницы кэшируются каждая под своим адресом (задачи / деньги / ZZZ) + картинки ZZZ
// v8: карточки агентов переведены на card_*.webp / hero_*.webp вместо полноразмерных
// art_*.png. Версию обязательно поднимать при любой замене картинок — ветка /img/zzz/
// работает cache-first, иначе браузер вечно отдаёт старый файл под тем же именем.
// v21: справочник Endfield переехал на свою базу (ef/data/), свои картинки
// (ef/img/) и карту (ef/map/). Картинки и тайлы — в кэше картинок, cache-first;
// данные и код раздела — сеть в приоритете, как у остальных.
// v17: появилась оболочка app.html — одна иконка на все разделы, и офлайн
// докачивается оттуда пачками в кэш картинок.
// v16: код страниц переехал в отдельные файлы (*-app.js). Они кэшируются как
// данные — сеть в приоритете: иначе браузер отдал бы новую страницу со старым
// скриптом, и это худшая из возможных комбинаций.
// v15: в офлайн уехал и справочник NTE — страница, её данные и манифест.
// Картинки NTE (их больше сотни мегабайт) в предзагрузку не идут: они
// оседают в кэше картинок по мере просмотра, как и у ZZZ.
// v14: появился обработчик push. Без него уведомления не показывались вовсе:
// воркер их исправно отправлял, браузер исправно получал, а показать было
// некому — сюда доезжало событие, которое никто не слушал.
const CACHE = 'moi-dela-v24';
// Картинки — в отдельном кэше без номера версии. Раньше они лежали вместе со
// страницами, и при каждом обновлении сайта старый кэш удалялся целиком: браузер
// заново тянул около десяти мегабайт артов и значков. На хорошем канале это
// незаметно, на плохом — минуты пустых карточек.
const IMG_CACHE = 'moi-dela-img';
const ASSETS = ['./', './index.html', './money.html', './zzz.html', './zzz-db.json',
                './zzz-extra.json', './zzz-guide.json', './manifest.json', './icon.svg',
                './manifest-zzz.json',
                './todo-app.js', './money-app.js', './zzz-app.js',
                './app.html', './app-shell.js', './app-news.js', './manifest-app.json',
                // оболочка: арты плиток и шрифты (берутся из NTE)
                './img/app/zzz.webp', './img/app/nte.webp', './img/app/ef.webp', './img/app/mark.svg',
                './nte/fonts/oswald-cyr.woff2', './nte/fonts/oswald-latin.woff2',
                './nte/fonts/inter-cyr.woff2', './nte/fonts/inter-latin.woff2',
                './menu.js', './install.js',
                './manifest-money.json', './offline-list.json',
                // справочник NTE: страница и данные, без картинок
                './nte/', './nte/index.html', './nte/app.js', './nte/manifest.json',
                './nte/nte-db.json', './nte/nte-guide.json', './nte/nte-gear.json',
                './nte/nte-ru.json', './nte/nte-city.json', './nte/nte-map.json',
                './nte/nte-awaken.json', './nte/nte-build.json', './nte/nte-skills.json',
                './nte/nte-art.json', './nte/nte-i18n.json', './nte/nte-ev-ru.json',
                // справочник Endfield: страница, код и база. Арты операторов
                // лежат на чужих сайтах, в офлайн-кэш не кладутся
                './ef/', './ef/index.html', './ef/app.js', './ef/map.js', './ef/tools.js',
                './ef/factory.js', './ef/sk-sign.js', './ef/manifest.json', './ef/icon.svg',
                './ef/font/efsans-bold.woff2', './ef/data/ef-db.json', './ef/data/ef-tools.json',
                './ef/data/ef-map.json', './ef/data/ef-factory.json'];

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

  // Движок распознавания NTE (/nte/ocr/) — шесть мегабайт, которые не меняются
  // годами. Держать их в кэше страниц нельзя: при каждом подъёме версии старый
  // кэш чистится целиком, и браузер качал бы их заново. Обычного HTTP-кэша тут
  // достаточно, а модель распознавателя и так лежит в IndexedDB.
  if (url.pathname.indexOf('/nte/ocr/') === 0) return;

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
      // ignoreSearch: exe открывает app.html?app=1, а в кэше лежит app.html —
      // без этого офлайн вместо оболочки показывался бы список дел.
      const cached = (await caches.match(e.request)) ||
                     (await caches.match(e.request, { ignoreSearch: true }));
      if (!cached) {
        // в кэше пусто — ждём сеть до конца, иначе показывать нечего
        // Если сети нет и страницы в кэше ещё не было — отдаём ту оболочку,
        // которая ближе по адресу: с /nte/ логично показать справочник, а не
        // список дел.
        return net.catch(() => caches.match(
          url.pathname.indexOf('/nte/') === 0 ? './nte/index.html' :
          url.pathname.indexOf('/ef/') === 0 ? './ef/index.html' : './index.html'));
      }
      const slow = new Promise(res => setTimeout(() => res(null), 6000));
      const first = await Promise.race([net.catch(() => null), slow]);
      return first || cached;
    })());
    return;
  }

  // Картинки ZZZ: кэш в приоритете (их много, они не меняются) и живут в своём
  // кэше, который не сбрасывается при обновлении сайта.
  if (url.pathname.indexOf('/img/zzz/') !== -1 || url.pathname.indexOf('/nte/img/') !== -1 ||
      url.pathname.indexOf('/ef/img/') === 0 || url.pathname.indexOf('/ef/map/') === 0) {
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
  if (/zzz-(db|extra|guide|tier)\.json$/.test(url.pathname) ||
      /\/nte\/nte-[a-z-]+\.json$/.test(url.pathname) ||
      /-?app\.js$/.test(url.pathname) ||
      url.pathname.indexOf('/ef/data/') === 0 || /\/ef\/[a-z-]+\.js$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const c2 = r.clone(); caches.open(CACHE).then(c => c.put(e.request, c2)); }
        return r;
      // Страницы просят файлы с ?v=версия, а в предзагрузке они лежат без
      // хвоста: без ignoreSearch офлайн не находил ни данных, ни кода.
      }).catch(() => caches.match(e.request).then(m => m || caches.match(e.request, { ignoreSearch: true })))
    );
    return;
  }

  // остальное (иконка, манифест): кэш в приоритете, фоном обновляем.
  // Копию ответа снимаем сразу: тело читается ровно один раз, и если звать
  // clone() уже после того, как ответ ушёл странице, он падает с ошибкой —
  // а вместе с ним падал и весь обработчик, подсовывая старый файл из кэша.
  e.respondWith(
    // ignoreSearch запасным: файлы подключаются с ?v=, а в предзагрузке лежат без хвоста
    caches.match(e.request).then(c => c || caches.match(e.request, { ignoreSearch: true })).then(cached => {
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

// Приход уведомления. Воркер шлёт JSON вида {title, body, url, tag}; если по
// какой-то причине тела нет, показываем хотя бы заголовок — молча проглатывать
// push нельзя, браузер за это ругается своим «сайт обновился в фоне».
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'alextask.ru';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: d.tag || 'alextask',
    renotify: true,
    data: { url: d.url || './' }
  }));
});

// клик по уведомлению — открыть нужную страницу или сфокусировать уже открытую
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const цель = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      for (const w of ws) {
        // окно с нужным разделом уже открыто — просто выводим его вперёд
        if (w.url.indexOf(цель) >= 0 && 'focus' in w) return w.focus();
      }
      for (const w of ws) {
        if ('navigate' in w && 'focus' in w) return w.navigate(цель).then(x => x && x.focus());
      }
      return clients.openWindow(цель);
    })
  );
});
