// Лента новостей оболочки (app.html) и часы в шапке.
//
// Источник — открытые Telegram-каналы. Браузер сам читать t.me не может (нет
// CORS), поэтому идём через свой воркер: /api/tg?c=канал1,канал2 отдаёт по
// каждому каналу последние ~20 постов — дата, картинка, начало текста,
// ссылка. Полный текст остаётся в Telegram: в карточке превью и ссылка.
//
// Каналы задаются в самой оболочке (кнопка «Каналы») и лежат в localStorage
// этого окна. Последний ответ тоже кладётся в localStorage — без сети лента
// показывает то, что было.
//
// «Новое» — посты свежее момента, когда ленту в последний раз видели:
// отметка ставится при уходе со страницы. Счётчик новых — на плитке игры.

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = ['https://api.alextask.ru', 'https://alextask-push.12dogswog76.workers.dev'];
  const LS_CH = 'alextask_news_ch';
  const LS_CACHE = 'alextask_news_cache';
  const LS_SEEN = 'alextask_news_seen';
  const LS_F = 'alextask_news_filter';
  const LS_GLOB = 'alextask_news_glob';   // общий список каналов из воркера — копия на случай без сети
  const LS_KEY = 'alextask_news_key';     // ключ владельца: им сохраняется общий список
  const ИГРЫ = { zzz: 'ZZZ', nte: 'NTE', ef: 'Endfield' };
  const СВЕЖЕСТЬ = 15 * 60 * 1000;
  const ПОРЦИЯ = 12;

  const чит = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const пиши = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ── часы ───────────────────────────────────────────────────────────────────
  const МЕС = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const ДН = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  function часы() {
    const d = new Date();
    $('clk').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    $('dt').textContent = ДН[d.getDay()] + ' · ' + d.getDate() + ' ' + МЕС[d.getMonth()];
  }
  часы(); setInterval(часы, 15000);

  // ── знак = F5 ──────────────────────────────────────────────────────────────
  // Клик по знаку: спросить у service worker свежую версию сайта (новый sw.js
  // сменит кэш, и ZZZ, NTE, Endfield откроются уже новыми), сбросить отметку
  // свежести ленты — после перезагрузки новости придут с сервера, — и
  // перезагрузить страницу, как F5.
  const знак = $('reload');
  if (знак) знак.onclick = async () => {
    if (знак.classList.contains('spin')) return;
    знак.classList.add('spin');
    try {
      const c = чит(LS_CACHE, null);
      if (c) { c.t = 0; пиши(LS_CACHE, c); }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await Promise.race([reg.update(), new Promise(r => setTimeout(r, 2500))]);
      }
    } catch (e) {}
    location.reload();
  };

  // ── перенос из Chrome (только в окне alextask.exe) ─────────────────────────
  // Окно на WebView2 держит своё хранилище. Кнопка просит окно прочитать
  // localStorage Chrome с диска и положить сюда — отметки и коды облака.
  const wv = window.chrome && window.chrome.webview;
  if (wv) {
    const b = $('imp');
    b.hidden = false;
    b.onclick = () => {
      if (!confirm('Забрать данные сайта из Chrome? Ключи, которые есть в Chrome, заменят здешние. Дальше разделы синхронизируются через облако как обычно.')) return;
      b.disabled = true; b.textContent = 'переношу…';
      wv.postMessage('import-chrome');
    };
    wv.addEventListener('message', e => {
      let d; try { d = JSON.parse(e.data); } catch (x) { return; }
      if (d.import == null) return;
      b.disabled = false;
      if (d.error) { b.textContent = 'не вышло: ' + d.error; return; }
      b.classList.add('ok');
      b.textContent = 'перенесено ' + d.import + ' · ' + d.profile;
      setTimeout(() => location.reload(), 1400);
    });
  }

  // ── каналы ─────────────────────────────────────────────────────────────────
  const имя = s => String(s || '').trim().replace(/^https?:\/\/t\.me\/(s\/)?/i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  const разобрать = s => String(s || '').split(/[\s,;]+/).map(имя).filter(x => /^[A-Za-z][A-Za-z0-9_]{3,40}$/.test(x));
  // Каналы по умолчанию — стандарт, вводить их не нужно. Своё, заданное
  // кнопкой «Каналы», их заменяет; если список игры пустой — берётся стандарт.
  const СТАНДАРТ = { zzz: ['zenlessleak'], nte: ['NTE_MIUMIU'], ef: ['ArknightsEndfieldleaks'] };
  // Список каналов один на всех и лежит в воркере (/api/news/ch): любой, кто
  // открыл сайт или приложение, видит те же каналы. Пока общего списка нет
  // (воркер не обновлён или ещё не сохраняли) — свой старый из localStorage,
  // а у гостя — стандарт. Сохраняет общий список только владелец, по ключу.
  const дополнить = к => { const н = {}; Object.keys(СТАНДАРТ).forEach(g => { н[g] = Array.isArray(к && к[g]) && к[g].length ? к[g].slice() : СТАНДАРТ[g].slice(); }); return н; };
  const глоб = чит(LS_GLOB, null);
  let каналы = дополнить(глоб && глоб.ch ? глоб.ch : чит(LS_CH, {}));
  const всеКаналы = () => Object.keys(ИГРЫ).reduce((a, g) => a.concat((каналы[g] || []).map(c => [g, c])), []);

  function настройкаОткрыть(on) {
    $('chset').classList.toggle('on', on);
    if (on) document.querySelectorAll('[data-ch]').forEach(i => {
      i.value = (каналы[i.dataset.ch] || []).map(c => '@' + c).join(', ');
    });
  }
  $('nSet').onclick = () => настройкаОткрыть(!$('chset').classList.contains('on'));
  $('chCancel').onclick = () => настройкаОткрыть(false);
  const ключ = $('chKey');
  if (ключ) ключ.value = чит(LS_KEY, '');
  const сообщ = (t, плохо) => { const m = $('chMsg'); if (m) { m.textContent = t; m.classList.toggle('bad', !!плохо); } };
  $('chSave').onclick = async () => {
    const н = {};
    document.querySelectorAll('[data-ch]').forEach(i => { н[i.dataset.ch] = разобрать(i.value); });
    const k = (ключ && ключ.value || '').trim();
    if (!k) { сообщ('Впиши ключ владельца — без него общий список не сохранить.', true); return; }
    сообщ('сохраняю для всех…');
    let ош = '';
    for (const base of API) {
      try {
        const r = await fetch(base + '/api/news/ch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: k, ch: н }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 403 && /ключ/i.test(d.error || '')) { сообщ('Неверный ключ.', true); return; }
        if (!r.ok || !d.ok) throw new Error(d.error || ('HTTP ' + r.status));
        пиши(LS_KEY, k);
        пиши(LS_GLOB, { ch: d.ch, t: d.t });
        каналы = дополнить(d.ch);
        сообщ('Сохранено — эти каналы теперь видят все.');
        setTimeout(() => { настройкаОткрыть(false); сообщ(''); }, 900);
        забрать(true);
        return;
      } catch (e) { ош = (e && e.message) || String(e); }
    }
    сообщ('Не сохранилось: ' + ош, true);
  };

  // Сверка с общим списком при каждом открытии: если владелец поменял каналы,
  // у всех остальных лента перестроится сама.
  async function общий() {
    for (const base of API) {
      try {
        const r = await fetch(base + '/api/news/ch', { cache: 'no-store', signal: AbortSignal.timeout(СРОК) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (!d.ch) return;                       // общего списка ещё нет
        const н = дополнить(d.ch);
        пиши(LS_GLOB, { ch: d.ch, t: d.t });
        if (JSON.stringify(н) === JSON.stringify(каналы)) return;
        каналы = н;
        кеш = { t: 0, list: [] };
        забрать(false);
        return;
      } catch (e) {}
    }
  }

  // ── данные ─────────────────────────────────────────────────────────────────
  let кеш = чит(LS_CACHE, { t: 0, list: [] });   // list: [{g, ch, title, photo, error, posts:[]}]
  const видели = чит(LS_SEEN, {});
  let фильтр = чит(LS_F, 'all');
  let показано = ПОРЦИЯ;
  let идёт = false, повтор = false;

  // Оба адреса воркера сразу, кто первый ответил — тот и прав. Раньше шли по
  // очереди и без срока: api.alextask.ru из части сетей иногда висит минутами,
  // запрос не кончался, флаг «идёт» не снимался — и лента стояла на
  // «обновляю…», а кнопка «обновить» молча ничего не делала (27.10.2026).
  const СРОК = 12000;
  async function запрос(список, свежее) {
    const q = '/api/tg?c=' + encodeURIComponent(список.join(',')) + (свежее ? '&fresh=1' : '');
    const один = base => fetch(base + q, { cache: 'no-store', signal: AbortSignal.timeout(СРОК) }).then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (!d.channels) throw new Error(d.error || 'воркер старый — нет /api/tg');
      return d.channels;
    });
    try { return await Promise.any(API.map(один)); }
    catch (e) { throw (e && e.errors && e.errors[0]) || e; }
  }

  async function забрать(свежее) {
    const пары = всеКаналы();
    if (!пары.length) { кеш = { t: 0, list: [] }; нарисовать(); return; }
    // Пока идёт прошлый запрос, новый не запускаем, но запоминаем: список
    // каналов мог смениться (пришёл общий из воркера) — догоним после.
    if (идёт) { повтор = true; return; }
    идёт = true;
    $('nst').textContent = 'обновляю…';
    try {
      // по 8 каналов за запрос — столько воркер берёт за раз
      const имена = [...new Set(пары.map(p => p[1]))];
      const ответы = [];
      for (let i = 0; i < имена.length; i += 8) ответы.push(...await запрос(имена.slice(i, i + 8), свежее));
      const поИмени = {};
      ответы.forEach(o => { поИмени[String(o.ch).toLowerCase()] = o; });
      кеш = { t: Date.now(), list: пары.map(([g, c]) => ({ g, ...(поИмени[c.toLowerCase()] || { ch: c, error: 'нет ответа', posts: [] }) })) };
      пиши(LS_CACHE, кеш);
    } catch (e) {
      $('nst').textContent = 'не обновилось: ' + (e && e.message || e) + (кеш.t ? ' · показано сохранённое' : '');
      идёт = false; нарисовать(true);
      if (повтор) { повтор = false; забрать(свежее); }
      return;
    }
    идёт = false;
    нарисовать();
    if (повтор) { повтор = false; забрать(свежее); }
  }

  // ── вывод ──────────────────────────────────────────────────────────────────
  function когда(iso) {
    const t = Date.parse(iso); if (!t) return '';
    const мин = Math.round((Date.now() - t) / 60000);
    if (мин < 1) return 'только что';
    if (мин < 60) return мин + ' мин назад';
    if (мин < 24 * 60) return Math.round(мин / 60) + ' ч назад';
    const d = new Date(t), сег = new Date(); сег.setHours(0, 0, 0, 0);
    if (t >= сег - 864e5) return 'вчера';
    return d.getDate() + ' ' + МЕС[d.getMonth()].slice(0, 3) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }
  const эл = (тег, кл, текст) => { const e = document.createElement(тег); if (кл) e.className = кл; if (текст != null) e.textContent = текст; return e; };
  const https = u => /^https:\/\//.test(u || '') ? u : '';

  function все() {
    const out = [];
    кеш.list.forEach(k => (k.posts || []).forEach(p => out.push({ ...p, g: k.g, chTitle: k.title || k.ch, chPhoto: k.photo })));
    // один пост мог прийти из двух каналов-репостов — дубли по ссылке убираем
    const был = new Set();
    return out.filter(p => !был.has(p.url) && был.add(p.url))
      .sort((a, b) => (Date.parse(b.t) || 0) - (Date.parse(a.t) || 0));
  }

  function карточка(p) {
    const a = эл('a', 'nc');
    a.href = https(p.url) || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.dataset.g = p.g;
    const новый = Date.parse(p.t) > (видели[p.g] || 0) && (видели[p.g] || 0) > 0;
    if (новый) a.appendChild(эл('span', 'nw', 'NEW'));
    if (https(p.img)) {
      const im = эл('div', 'im');
      im.style.backgroundImage = 'url("' + https(p.img).replace(/"/g, '%22') + '")';
      a.appendChild(im);
    }
    const bd = эл('div', 'bd');
    const who = эл('div', 'who');
    if (https(p.chPhoto)) { const i = эл('img'); i.src = https(p.chPhoto); i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer'; who.appendChild(i); }
    who.appendChild(эл('span', 'gm', ИГРЫ[p.g] || p.g));
    who.appendChild(эл('span', '', p.chTitle));
    who.appendChild(эл('u', '', когда(p.t)));
    bd.appendChild(who);
    // первая строка поста обычно заголовок — её жирным, остальное превью
    const строки = String(p.text || '').split('\n');
    const заг = (строки.shift() || '').trim();
    if (заг) bd.appendChild(эл('div', 'h', заг.length > 140 ? заг.slice(0, 140) + '…' : заг));
    const тело = строки.join('\n').trim();
    if (тело) bd.appendChild(эл('div', 't', тело));
    if (!заг && !тело && p.video) bd.appendChild(эл('div', 't', 'видео'));
    bd.appendChild(эл('div', 'ft', 'Открыть в Telegram →'));
    a.appendChild(bd);
    return a;
  }

  function нарисовать(оставитьСтатус) {
    document.querySelectorAll('.chip[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === фильтр));
    const box = $('news'); box.textContent = '';
    const пары = всеКаналы();
    // счётчики новых на плитках игр
    const список = все();
    Object.keys(ИГРЫ).forEach(g => {
      const n = (видели[g] || 0) ? список.filter(p => p.g === g && Date.parse(p.t) > видели[g]).length : 0;
      const b = document.querySelector('[data-new="' + g + '"]');
      if (b) { b.classList.toggle('on', n > 0); b.lastChild.textContent = n + ' ' + (n === 1 ? 'новость' : n < 5 ? 'новости' : 'новостей'); }
    });
    if (!пары.length) {
      const e = эл('div', 'empty');
      e.innerHTML = '<b>Каналы не заданы.</b> Нажми «Каналы» и впиши открытые Telegram-каналы по каждой игре — ' +
        'анонсы персонажей, баннеры, ивенты, сюжет будут собираться здесь, свежие сверху.';
      box.appendChild(e); $('nMore').hidden = true;
      if (!оставитьСтатус) $('nst').textContent = '';
      return;
    }
    const видно = список.filter(p => фильтр === 'all' || p.g === фильтр);
    видно.slice(0, показано).forEach(p => box.appendChild(карточка(p)));
    $('nMore').hidden = видно.length <= показано;
    if (!видно.length) {
      const e = эл('div', 'empty');
      e.textContent = кеш.t ? 'Постов нет — проверь имена каналов (кнопка «Каналы»).' : 'Загружаю…';
      box.appendChild(e);
    }
    if (!оставитьСтатус) {
      const ош = кеш.list.filter(k => k.error).map(k => '@' + k.ch + ': ' + k.error);
      $('nst').textContent = (кеш.t ? 'обновлено ' + когда(new Date(кеш.t).toISOString()) : '') +
        (ош.length ? ' · ' + ош.join('; ') : '');
    }
  }

  document.querySelectorAll('.chip[data-f]').forEach(b => b.onclick = () => {
    фильтр = b.dataset.f; пиши(LS_F, фильтр); показано = ПОРЦИЯ; нарисовать();
  });
  $('nMore').onclick = () => { показано += ПОРЦИЯ; нарисовать(); };
  $('nRefresh').onclick = () => забрать(true);

  // Отметка «видели»: при уходе со страницы. Первый заход ставит её сразу,
  // иначе вся лента разом оказалась бы «новой».
  function отметить() {
    const список = все();
    Object.keys(ИГРЫ).forEach(g => {
      const max = Math.max(0, ...список.filter(p => p.g === g).map(p => Date.parse(p.t) || 0));
      if (max) видели[g] = Math.max(видели[g] || 0, max);
    });
    пиши(LS_SEEN, видели);
  }
  addEventListener('pagehide', отметить);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') отметить(); });

  нарисовать();
  общий();
  if (всеКаналы().length && Date.now() - (кеш.t || 0) > СВЕЖЕСТЬ) забрать(false).then(() => {
    if (!Object.keys(видели).length) отметить();
  });
  // окно висит открытым — подтягиваем раз в 15 минут; вернулся в свёрнутое
  // окно или вкладку, а лента старше 15 минут — подтягиваем сразу
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) забрать(false); }, СВЕЖЕСТЬ);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - (кеш.t || 0) > СВЕЖЕСТЬ) забрать(false);
  });
})();
