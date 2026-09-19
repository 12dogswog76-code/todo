// Сборщик боевой хроники Endfield со skport.
//
// Зачем так, а не через воркер. Запросы skport подписываются: к каждому идут
// заголовки cred (это ключ от аккаунта), sign и timestamp, где
//     sign = md5( HMAC-SHA256(путь + query + timestamp + служебные, token) )
// Значит, чтобы ходить туда со стороны, пришлось бы отдать наружу cred —
// то есть ключ входа. Вместо этого скрипт работает прямо в твоей вкладке:
// он ничего не отправляет, только слушает ответы, которые страница и так
// получает, и складывает их в файл.
//
// Как запускать (Chrome на компьютере):
//   1. открыть game.skport.com, войти в аккаунт;
//   2. F12 → Ctrl+Shift+M (режим телефона) → открыть
//      https://game.skport.com/endfield/game-data → F5;
//   3. F12 → Console → вставить:
//        fetch('https://alextask.ru/ef/sk-ef.js').then(r=>r.text()).then(eval)
//   4. пролистать страницу и открыть разделы: оперативники, регионы,
//      кризисный контракт, эхо войны — скрипт поймает их ответы;
//   5. нажать «Скачать» в плашке снизу.
// Файл потом загрузить на alextask.ru/ef → вкладка «Хроника».
//
// cred и sign скрипт не читает, никуда не шлёт и в файл не кладёт.

(() => {
  'use strict';

  const ДОМЕНЫ = /(?:zonai|web-api|game)\.skport\.com/;
  const пойманное = {};      // путь → последний ответ
  let счёт = 0;

  // Из адреса берём только путь: он и станет ключом в файле.
  const путь = адрес => {
    try { const u = new URL(адрес, location.origin); return u.pathname + (u.search || ''); }
    catch (e) { return String(адрес); }
  };

  function запомнить(адрес, текст) {
    if (!ДОМЕНЫ.test(String(адрес))) return;
    let данные;
    try { данные = JSON.parse(текст); } catch (e) { return; }   // не json — не наше
    const к = путь(адрес);
    // Секреты в ответах не ожидаются, но на всякий случай выкидываем поля,
    // похожие на ключи доступа.
    вычистить(данные);
    пойманное[к] = данные;
    счёт++;
    обновить();
  }

  function вычистить(о) {
    if (!о || typeof о !== 'object') return;
    for (const k of Object.keys(о)) {
      if (/cred|token|secret|sign|password|session/i.test(k)) { delete о[k]; continue; }
      вычистить(о[k]);
    }
  }

  // ── перехват сети ──────────────────────────────────────────────────────────
  const роднойFetch = window.fetch;
  window.fetch = function (...арг) {
    return роднойFetch.apply(this, арг).then(ответ => {
      try {
        const адрес = (арг[0] && арг[0].url) || арг[0];
        if (ДОМЕНЫ.test(String(адрес))) {
          ответ.clone().text().then(t => запомнить(адрес, t)).catch(() => {});
        }
      } catch (e) {}
      return ответ;
    });
  };

  const роднойOpen = XMLHttpRequest.prototype.open;
  const роднойSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (м, а, ...ост) {
    this.__адрес = а;
    return роднойOpen.call(this, м, а, ...ост);
  };
  XMLHttpRequest.prototype.send = function (...арг) {
    this.addEventListener('load', () => {
      try { запомнить(this.__адрес, this.responseText); } catch (e) {}
    });
    return роднойSend.apply(this, арг);
  };

  // ── плашка ─────────────────────────────────────────────────────────────────
  const п = document.createElement('div');
  п.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:999999;' +
    'background:#0e0f11;color:#edeef2;border:1px solid #ffd046;border-radius:12px;' +
    'padding:10px 12px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.6)';
  п.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<b style="color:#ffd046">Сбор хроники</b>' +
      '<span id="sk-n">поймано: 0</span>' +
      '<button id="sk-dl" style="margin-left:auto;background:#ffd046;color:#0e0f11;border:0;' +
        'border-radius:8px;padding:7px 12px;font-weight:600;cursor:pointer">Скачать</button>' +
      '<button id="sk-x" style="background:#1e2026;color:#8d919c;border:1px solid #2a2d35;' +
        'border-radius:8px;padding:7px 10px;cursor:pointer">Закрыть</button>' +
    '</div>' +
    '<div id="sk-list" style="margin-top:7px;color:#8d919c;font-size:11px;max-height:90px;' +
      'overflow:auto"></div>';
  document.body.appendChild(п);

  function обновить() {
    const n = document.getElementById('sk-n');
    if (n) n.textContent = 'поймано: ' + счёт + ' (разделов: ' + Object.keys(пойманное).length + ')';
    const l = document.getElementById('sk-list');
    if (l) l.textContent = Object.keys(пойманное).join('  ·  ');
  }

  document.getElementById('sk-dl').onclick = () => {
    const файл = {
      источник: 'skport, боевая хроника Endfield',
      снято: new Date().toISOString(),
      разделы: пойманное,
    };
    const b = new Blob([JSON.stringify(файл, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'ef-хроника.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  document.getElementById('sk-x').onclick = () => п.remove();

  обновить();
  console.log('%cСборщик хроники запущен. Полистай страницу и открой разделы, ' +
    'потом нажми «Скачать».', 'color:#ffd046');
})();
