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

  // ── каналы ─────────────────────────────────────────────────────────────────
  const имя = s => String(s || '').trim().replace(/^https?:\/\/t\.me\/(s\/)?/i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  const разобрать = s => String(s || '').split(/[\s,;]+/).map(имя).filter(x => /^[A-Za-z][A-Za-z0-9_]{3,40}$/.test(x));
  let каналы = чит(LS_CH, { zzz: [], nte: [], ef: [] });
  const всеКаналы = () => Object.keys(ИГРЫ).reduce((a, g) => a.concat((каналы[g] || []).map(c => [g, c])), []);

  function настройкаОткрыть(on) {
    $('chset').classList.toggle('on', on);
    if (on) document.querySelectorAll('[data-ch]').forEach(i => {
      i.value = (каналы[i.dataset.ch] || []).map(c => '@' + c).join(', ');
    });
  }
  $('nSet').onclick = () => настройкаОткрыть(!$('chset').classList.contains('on'));
  $('chCancel').onclick = () => настройкаОткрыть(false);
  $('chSave').onclick = () => {
    const н = {};
    document.querySelectorAll('[data-ch]').forEach(i => { н[i.dataset.ch] = разобрать(i.value); });
    каналы = н; пиши(LS_CH, н);
    настройкаОткрыть(false);
    забрать(true);
  };

  // ── данные ─────────────────────────────────────────────────────────────────
  let кеш = чит(LS_CACHE, { t: 0, list: [] });   // list: [{g, ch, title, photo, error, posts:[]}]
  const видели = чит(LS_SEEN, {});
  let фильтр = чит(LS_F, 'all');
  let показано = ПОРЦИЯ;
  let идёт = false;

  async function запрос(список, свежее) {
    const q = '/api/tg?c=' + encodeURIComponent(список.join(',')) + (свежее ? '&fresh=1' : '');
    let ош;
    for (const base of API) {
      try {
        const r = await fetch(base + q, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (!d.channels) throw new Error(d.error || 'воркер старый — нет /api/tg');
        return d.channels;
      } catch (e) { ош = e; }
    }
    throw ош;
  }

  async function забрать(свежее) {
    const пары = всеКаналы();
    if (!пары.length) { кеш = { t: 0, list: [] }; нарисовать(); return; }
    if (идёт) return;
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
      идёт = false; нарисовать(true); return;
    }
    идёт = false;
    нарисовать();
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
  if (всеКаналы().length && Date.now() - (кеш.t || 0) > СВЕЖЕСТЬ) забрать(false).then(() => {
    if (!Object.keys(видели).length) отметить();
  });
  // окно висит открытым — подтягиваем раз в 15 минут
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) забрать(false); }, СВЕЖЕСТЬ);
})();
