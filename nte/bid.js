// nte/bid.js — вкладка «Аукцион»: мини-игра «Раз, два, продано!» (Корабль сокровищ).
//
// Все числа — из таблиц игры (DataTable/BidKing в Waifus-Grace/NTE_Assets),
// собраны в nte-bid.json. Четыре раздела:
//   · Витрина     — какие красные предметы выставить на поле 15×8, чтобы
//                   получать больше ракушек или фонсов в час;
//   · Оценка лота — сколько стоит контейнер по тому, что уже раскрыто, и
//                   какую ставку делать в каждом раунде;
//   · Справочник  — все 227 коллекционных предметов с ценой и размером;
//   · Подсказки   — залы, условия площадки, помощники, устройства.
//
// Подключается после app.js и пользуется его общими $, esc, plural.
// Своё состояние держит в localStorage под ключами nte-bid-*: префикс nte-
// значит, что облачная синхронизация справочника увезёт и его.
(function () {
'use strict';

let BD = null, loading = null, loadErr = '';
const LS_OWN = 'nte-bid-own', LS_UI = 'nte-bid-ui';

const Q_ORDER = ['red', 'orange', 'purple', 'blue', 'green', 'white'];
const Q_RU = { red: 'красный', orange: 'золотой', purple: 'фиолетовый', blue: 'синий',
               green: 'зелёный', white: 'белый' };
const TYPE_RU = { antique: 'антиквариат', jewel: 'самоцветы', technology: 'техника',
                  food: 'еда', commodity: 'повседневное', superpower: 'аномалии' };
const SIZE_RU = { few: 'крошечный', small: 'малый', middle: 'средний', big: 'больше среднего', large: 'большой' };
const SUBS = [['show', 'Витрина'], ['lot', 'Оценка лота'], ['log', 'Журнал'], ['dir', 'Справочник'], ['tips', 'Подсказки']];
// Журнал торгов (с 27.10.2026): каждый выигранный или проигранный лот — строка
// {t, venue, rule, bid, sold, note}. Прибыль = выручка − ставка. Ключ nte-bid-log
// уезжает в облако вместе с остальным справочником.
const LS_LOG = 'nte-bid-log';

const fmt = n => (n == null || !isFinite(n)) ? '—' : Math.round(n).toLocaleString('ru-RU');
const kfmt = n => {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace('.', ',') + ' млн';
  if (a >= 1e4) return Math.round(n / 1e3) + ' тыс';
  return fmt(n);
};
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const ui = Object.assign({
  sub: 'show', mode: 'shells', bonus: 0, theory: false,
  dq: '', dqual: '', dtype: '', dsort: 'price',
  venue: 'BidKing2', rule: 'BKE_Normal', known: [], rar: {}, total: '', cells: '',
  risk: 'p50', round: 1, second: ''
}, lsGet(LS_UI, {}));
const saveUi = () => lsSet(LS_UI, ui);
let own = lsGet(LS_OWN, {});

function load() {
  if (BD) return Promise.resolve(BD);
  if (loading) return loading;
  const v = (typeof APP_VER !== 'undefined') ? APP_VER : '';
  loading = fetch('nte-bid.json?v=' + v).then(r => {
    if (!r.ok) throw new Error('nte-bid.json: ' + r.status);
    return r.json();
  }).then(d => {
    const c = d.cols;
    d.items = d.items.map(a => { const o = {}; c.forEach((k, i) => o[k] = a[i]); o.a = o.w * o.h; return o; });
    d.byId = {}; d.items.forEach(i => d.byId[i.id] = i);
    d.reds = d.items.filter(i => i.q === 'red');
    BD = d; return d;
  }).catch(e => { loadErr = e.message; loading = null; throw e; });
  return loading;
}

const icon = (it, cls) => '<img class="' + (cls || 'bk-ic') + '" src="img/bid/' + esc(it.id) +
  '.webp" alt="" loading="lazy" data-nf="drop">';
const qdot = q => '<span class="bk-q bk-' + q + '" title="' + esc(Q_RU[q] || q) + '"></span>';

// ── точка входа ────────────────────────────────────────────────────────────
function draw() {
  $('filters').innerHTML = '<div class="fgrp">' + SUBS.map(s =>
    '<button class="fb' + (ui.sub === s[0] ? ' on' : '') + '" data-bsub="' + s[0] + '">' +
    esc(s[1]) + '</button>').join('') + '</div>';
  $('filters').querySelectorAll('[data-bsub]').forEach(b => b.onclick = () => {
    ui.sub = b.dataset.bsub; saveUi(); draw();
  });
  footer();
  if (!BD) {
    $('body').innerHTML = '<div class="empty">' + (loadErr ? 'Не загрузилось: ' + esc(loadErr) : 'Загружаю…') + '</div>';
    load().then(draw).catch(() => draw());
    return;
  }
  if (ui.sub === 'lot') drawLot();
  else if (ui.sub === 'log') drawLog();
  else if (ui.sub === 'dir') drawDir();
  else if (ui.sub === 'tips') drawTips();
  else drawShow();
}
function footer() {
  $('foot').innerHTML = 'Цены, размеры, доход витрины и вероятности — из таблиц игры ' +
    '(<a href="https://github.com/Waifus-Grace/NTE_Assets" target="_blank" rel="noopener">NTE_Assets</a>, DataTable/BidKing)' +
    (BD && BD.built ? ', собрано ' + esc(BD.built) : '') + '. Идея витрины — ' +
    '<a href="https://anko-monn.github.io/nte-ichigeki-rakusatsu-optimizer/" target="_blank" rel="noopener">anko-monn</a>.';
}

// ═════ ВИТРИНА ══════════════════════════════════════════════════════════════
// Поле 15×8, не больше 99 предметов, поворачивать нельзя. Доход идёт только с
// красных: ракушки в час и фонсы в час. Фонсы копятся до 350 000, дальше
// витрина стоит впустую, пока не соберёшь.
//
// Поиск точный в пределах времени: перебор по первой свободной клетке (её
// либо закрывает левый верхний угол какого-то предмета, либо она остаётся
// пустой — так перечисляются все раскладки без поворотов), с отсечением по
// оценке сверху «дробный рюкзак по оставшимся клеткам». Если перебор кончился
// раньше лимита времени — найденное доказанно лучшее.
function solve(types, W, H, maxItems, ms) {
  const N = W * H, g = new Uint8Array(N);
  const order = types.slice().sort((a, b) => b.v / b.a - a.v / a.a);
  const rem = order.map(t => t.cnt);
  let best = -1, bestPl = [], cur = 0, nItems = 0, nodes = 0, timeout = false;
  const pl = [];
  const t0 = performance.now();
  const bound = free => {
    let s = 0;
    for (let i = 0; i < order.length && free > 0; i++) {
      if (!rem[i]) continue;
      const k = Math.min(rem[i], free / order[i].a);
      s += k * order[i].v; free -= k * order[i].a;
    }
    return s;
  };
  const fits = (p, t) => {
    const r = (p / W) | 0, c = p % W;
    if (c + t.w > W || r + t.h > H) return false;
    for (let y = 0; y < t.h; y++) {
      const o = (r + y) * W + c;
      for (let x = 0; x < t.w; x++) if (g[o + x]) return false;
    }
    return true;
  };
  const mark = (p, t, v) => {
    const r = (p / W) | 0, c = p % W;
    for (let y = 0; y < t.h; y++) { const o = (r + y) * W + c; for (let x = 0; x < t.w; x++) g[o + x] = v; }
  };
  function dfs(p, free) {
    if ((++nodes & 1023) === 0 && performance.now() - t0 > ms) { timeout = true; }
    if (timeout) return;
    while (p < N && g[p]) p++;
    if (cur > best + 1e-9) { best = cur; bestPl = pl.slice(); }
    if (p >= N || free <= 0) return;
    if (cur + bound(free) <= best + 1e-9) return;
    if (nItems < maxItems) {
      for (let i = 0; i < order.length; i++) {
        if (!rem[i]) continue;
        const t = order[i];
        if (!fits(p, t)) continue;
        mark(p, t, 1); rem[i]--; cur += t.v; nItems++; pl.push([p, i]);
        dfs(p + 1, free - t.a);
        pl.pop(); nItems--; cur -= t.v; rem[i]++; mark(p, t, 0);
        if (timeout) return;
      }
    }
    // клетку оставляем пустой
    g[p] = 2;
    dfs(p + 1, free - 1);
    g[p] = 0;
  }
  dfs(0, N);
  const ub = bound(N);
  return {
    best, ub, done: !timeout, ms: Math.round(performance.now() - t0), nodes,
    place: bestPl.map(x => ({ r: (x[0] / W) | 0, c: x[0] % W, t: order[x[1]] }))
  };
}

let solveTimer = 0, lastRes = null, lastKey = '';
function showKey() {
  return JSON.stringify([ui.mode, ui.theory, ui.theory ? 0 : own]);
}
function runSolve() {
  const B = BD.board;
  const reds = BD.reds;
  const cnt = it => ui.theory ? B.maxItems : Math.max(0, Math.min(B.maxItems, +own[it.id] || 0));
  const list = reds.filter(it => cnt(it) > 0);
  if (!list.length) return null;
  const sd = Math.max.apply(null, list.map(it => it.shellsH / it.a));
  const val = it => ui.mode === 'fons' ? it.fonsH * 1e5 + it.shellsH
                  : ui.mode === 'both' ? it.shellsH / sd + it.fonsH / 7 + it.shellsH * 1e-9
                  : it.shellsH * 1e3 + it.fonsH;
  const types = list.map(it => ({ it, w: it.w, h: it.h, a: it.a, v: val(it), cnt: cnt(it) }));
  const res = solve(types, B.w, B.h, B.maxItems, 1200);
  res.shells = 0; res.fons = 0; res.cells = 0;
  res.place.forEach(p => { res.shells += p.t.it.shellsH; res.fons += p.t.it.fonsH; res.cells += p.t.a; });
  res.proved = res.done || res.best >= res.ub - 1e-6;
  return res;
}

function drawShow() {
  const B = BD.board;
  const reds = BD.reds.slice().sort((a, b) => (b.fonsH / b.a - a.fonsH / a.a) || (b.shellsH / b.a - a.shellsH / a.a));
  const ownTotal = BD.reds.reduce((s, it) => s + (+own[it.id] || 0), 0);
  let h = '';
  h += '<div class="cap"><b>Витрина</b><span></span><em>поле ' + B.w + '×' + B.h + ' · до ' + B.maxItems + ' предметов</em></div>';
  h += '<div class="box bk-ctl">' +
    '<div class="fgrp"><u>Что важнее</u>' +
      [['shells', 'ракушки'], ['fons', 'фонсы'], ['both', 'и то и другое']].map(m =>
        '<button class="fb' + (ui.mode === m[0] ? ' on' : '') + '" data-bmode="' + m[0] + '">' + m[1] + '</button>').join('') +
    '</div>' +
    '<div class="fgrp"><u>Навык города на фонсы</u>' +
      [0, 5, 10, 15].map(b => '<button class="fb' + (ui.bonus === b ? ' on' : '') + '" data-bbon="' + b + '">' +
        (b ? '+' + b + '%' : 'нет') + '</button>').join('') +
    '</div>' +
    '<div class="fgrp"><u>Предметы</u>' +
      '<button class="fb' + (!ui.theory ? ' on' : '') + '" data-bth="0">мои (' + ownTotal + ')</button>' +
      '<button class="fb' + (ui.theory ? ' on' : '') + '" data-bth="1">теория: любых сколько угодно</button>' +
    '</div>' +
  '</div>';
  h += '<div id="bkRes"></div>';
  h += '<div class="cap"><b>Что у тебя есть</b><span></span><em>красные — только они приносят доход</em></div>';
  h += '<div class="bk-acts"><button class="fb" data-bset="1">всё по 1</button>' +
       '<button class="fb" data-bset="0">обнулить</button>' +
       '<span class="hint" style="margin:0">Сортировка: фонсы на клетку, затем ракушки на клетку.</span></div>';
  h += '<div class="bk-own">' + reds.map(it => {
    const n = +own[it.id] || 0;
    return '<div class="bk-o' + (n ? ' on' : '') + '">' +
      '<div class="bk-oi">' + icon(it) + '</div>' +
      '<div class="bk-ot"><b>' + esc(it.ru) + '</b>' +
        '<span>' + it.w + '×' + it.h + ' · ' + fmt(it.shellsH) + ' рак/ч · ' + it.fonsH + ' ф/ч</span>' +
        '<span class="bk-dim">' + Math.round(it.shellsH / it.a) + ' рак и ' + (it.fonsH / it.a) + ' ф на клетку</span></div>' +
      '<div class="bk-cnt"><button data-bdec="' + it.id + '">−</button><input type="number" min="0" max="99" value="' + n +
        '" data-bn="' + it.id + '"><button data-binc="' + it.id + '">+</button></div>' +
    '</div>';
  }).join('') + '</div>';
  h += '<div class="hint">Доход идёт только с <b>красных</b> предметов. Фонсы на клетку у них ровно 7, 5, 4 или 3 — ' +
       'отсюда потолок 840 фонсов в час на полном поле из «семёрок». Поворачивать предметы на витрине нельзя. ' +
       'Несобранные фонсы копятся до <b>' + fmt(B.fonsCap) + '</b>: дальше витрина работает впустую, пока не заберёшь.</div>';
  $('body').innerHTML = h;

  const B2 = $('body');
  B2.querySelectorAll('[data-bmode]').forEach(b => b.onclick = () => { ui.mode = b.dataset.bmode; saveUi(); drawShow(); });
  B2.querySelectorAll('[data-bbon]').forEach(b => b.onclick = () => { ui.bonus = +b.dataset.bbon; saveUi(); drawShow(); });
  B2.querySelectorAll('[data-bth]').forEach(b => b.onclick = () => { ui.theory = b.dataset.bth === '1'; saveUi(); drawShow(); });
  B2.querySelectorAll('[data-bset]').forEach(b => b.onclick = () => {
    own = {}; if (b.dataset.bset === '1') BD.reds.forEach(it => own[it.id] = 1);
    lsSet(LS_OWN, own); ui.theory = false; saveUi(); drawShow();
  });
  const setN = (id, n) => {
    n = Math.max(0, Math.min(99, Math.round(+n || 0)));
    if (n) own[id] = n; else delete own[id];
    lsSet(LS_OWN, own);
    const inp = B2.querySelector('[data-bn="' + id + '"]');
    if (inp) { inp.value = n; inp.closest('.bk-o').classList.toggle('on', n > 0); }
    if (ui.theory) return;
    const tot = BD.reds.reduce((s, it) => s + (+own[it.id] || 0), 0);
    const tb = B2.querySelector('[data-bth="0"]'); if (tb) tb.textContent = 'мои (' + tot + ')';
    schedule();
  };
  B2.querySelectorAll('[data-binc]').forEach(b => b.onclick = () => setN(b.dataset.binc, (+own[b.dataset.binc] || 0) + 1));
  B2.querySelectorAll('[data-bdec]').forEach(b => b.onclick = () => setN(b.dataset.bdec, (+own[b.dataset.bdec] || 0) - 1));
  B2.querySelectorAll('[data-bn]').forEach(i => i.onchange = () => setN(i.dataset.bn, i.value));
  schedule(true);
}
function schedule(now) {
  clearTimeout(solveTimer);
  const box = $('bkRes'); if (!box) return;
  const key = showKey();
  if (lastRes !== undefined && key === lastKey && lastRes) { box.innerHTML = resHtml(lastRes); return; }
  box.innerHTML = '<div class="box bk-wait">Раскладываю…</div>';
  solveTimer = setTimeout(() => {
    lastKey = key; lastRes = runSolve();
    const b = $('bkRes'); if (b) b.innerHTML = resHtml(lastRes);
  }, now ? 30 : 350);
}
function hm(hours) {
  if (!isFinite(hours)) return '—';
  const h = Math.floor(hours), m = Math.round((hours - h) * 60);
  return (h ? h + ' ч ' : '') + (m ? m + ' мин' : (h ? '' : '0 мин'));
}
function resHtml(r) {
  if (!r) return '<div class="box bk-wait">Отметь ниже, какие красные предметы у тебя есть, — или включи «теорию».</div>';
  const B = BD.board;
  const fons = r.fons * (1 + ui.bonus / 100);
  const toCap = fons > 0 ? B.fonsCap / fons : Infinity;
  let board = '<div class="bk-board" style="--W:' + B.w + ';--H:' + B.h + '">';
  r.place.forEach(p => {
    const it = p.t.it;
    board += '<div class="bk-pc bk-' + it.q + '" title="' + esc(it.ru + ' · ' + it.w + '×' + it.h + ' · ' +
      fmt(it.shellsH) + ' рак/ч · ' + it.fonsH + ' ф/ч') + '" style="left:' + (p.c / B.w * 100) + '%;top:' +
      (p.r / B.h * 100) + '%;width:' + (it.w / B.w * 100) + '%;height:' + (it.h / B.h * 100) + '%">' +
      icon(it, 'bk-pimg') + '</div>';
  });
  board += '</div>';
  const cnt = {};
  r.place.forEach(p => { cnt[p.t.it.id] = (cnt[p.t.it.id] || 0) + 1; });
  const list = Object.keys(cnt).map(id => BD.byId[id]).sort((a, b) => b.shellsH * cnt[b.id] - a.shellsH * cnt[a.id]);
  const status = r.proved ? '<span class="bk-ok">лучше не разложить</span>'
    : (1 - r.best / r.ub) < 0.01 ? '<span class="bk-ok">практически лучшее: до верхней оценки меньше 1%</span>'
    : '<span class="bk-warn">лучшее за ' + (r.ms / 1000).toFixed(1).replace('.', ',') + ' с; верхняя оценка выше на ' +
      Math.round((1 - r.best / r.ub) * 100) + '% — но она не учитывает форму предметов</span>';
  return '<div class="bk-res">' +
    '<div class="box bk-bwrap">' + board + '</div>' +
    '<div class="box bk-sum">' +
      '<div class="bk-kpi"><b>' + fmt(r.shells) + '</b><span>ракушек в час</span></div>' +
      '<div class="bk-kpi"><b>' + fmt(fons) + '</b><span>фонсов в час' + (ui.bonus ? ' с +' + ui.bonus + '%' : '') + '</span></div>' +
      '<div class="bk-kpi"><b>' + hm(toCap) + '</b><span>до потолка ' + kfmt(B.fonsCap) + ' фонсов</span></div>' +
      '<div class="bk-kpi"><b>' + kfmt(r.shells * 24) + '</b><span>ракушек в сутки</span></div>' +
      '<div class="bk-line">' + r.place.length + ' ' + plural(r.place.length, 'предмет', 'предмета', 'предметов') +
        ' · занято ' + r.cells + ' из ' + (B.w * B.h) + ' клеток · ' + status + '</div>' +
      '<div class="bk-pl">' + list.map(it => '<div>' + qdot(it.q) + esc(it.ru) +
        (cnt[it.id] > 1 ? ' <i>×' + cnt[it.id] + '</i>' : '') + '<em>' + fmt(it.shellsH * cnt[it.id]) + ' · ' +
        (it.fonsH * cnt[it.id]) + ' ф</em></div>').join('') + '</div>' +
      '<div class="hint" style="margin-top:6px">Собирать фонсы — не реже чем раз в ' + hm(toCap) +
        ', иначе доход сверх ' + fmt(B.fonsCap) + ' сгорает.</div>' +
    '</div></div>';
}

// ═════ ОЦЕНКА ЛОТА ══════════════════════════════════════════════════════════
// Контейнер собирается так (таблицы WarehouseVenue/Level/Size): зал выбирает
// уровень склада и размер (число клеток), уровень задаёт веса редкостей и
// ступеней ценности, тип предмета равновероятен. Порядок заполнения игра не
// публикует — берём «добавлять предметы, пока клетки не кончатся». Поэтому
// это оценка, а не точная цена: разброс p10–p90 важнее средней.
//
// Раскрытое учитывается так: известные предметы — их точная цена; известна
// только редкость — цена случайного предмета этой редкости; остальное —
// случайные предметы. Каждый прогон взвешивается вероятностью увидеть такие
// редкости на его уровне склада: красный в контейнере сдвигает оценку к
// дорогим уровням.
let pools = null;
function buildPools() {
  pools = { byQT: {}, byQ: {}, jewel1: BD.items.filter(i => i.type === 'jewel' && i.a === 1) };
  BD.items.forEach(i => {
    const k = i.q + i.tier;
    (pools.byQT[k] = pools.byQT[k] || []).push(i);
    (pools.byQ[i.q] = pools.byQ[i.q] || []).push(i);
  });
}
function wpick(arr, wi) {
  let tot = 0; for (let i = 0; i < arr.length; i++) tot += arr[i][wi];
  let r = Math.random() * tot;
  for (let i = 0; i < arr.length; i++) { r -= arr[i][wi]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}
function qProb(level, q) {
  const L = BD.levels[level]; let tot = 0, w = 0;
  L.forEach(x => { tot += x[1]; if (x[0] === q) w = x[1]; });
  return tot ? w / tot : 0;
}
function sampleItem(level, q) {
  const L = BD.levels[level];
  const qd = q ? L.filter(x => x[0] === q)[0] : wpick(L, 1);
  if (!qd) return pick(pools.byQ[q]);
  const tiers = qd[2].map((w, i) => [i + 1, w]).filter(x => x[1] > 0);
  const tier = tiers.length ? wpick(tiers, 1)[0] : 1;
  return pick(pools.byQT[qd[0] + tier] || pools.byQ[qd[0]]);
}
const pick = a => a[(Math.random() * a.length) | 0];

function estimate() {
  if (!pools) buildPools();
  const V = BD.venues.filter(v => v.id === ui.venue)[0] || BD.venues[0];
  const dbl = ui.rule === 'BKE_PurpleDoubleValue' ? 'purple' : ui.rule === 'BKE_OrangeDoubleValue' ? 'orange' : '';
  const jewel = ui.rule === 'BKE_JewelLimit1x1';
  const price = it => it.price * (it.q === dbl ? 2 : 1);
  const known = ui.known.map(k => ({ it: BD.byId[k.id], n: k.n })).filter(k => k.it);
  let knownVal = 0, knownCnt = 0, knownCells = 0;
  known.forEach(k => { knownVal += price(k.it) * k.n; knownCnt += k.n; knownCells += k.it.a * k.n; });
  const rar = Q_ORDER.map(q => [q, Math.max(0, +ui.rar[q] || 0)]).filter(x => x[1] > 0);
  const rarCnt = rar.reduce((s, x) => s + x[1], 0);
  const total = Math.max(0, Math.round(+ui.total || 0));
  const cellsT = Math.max(0, Math.round(+ui.cells || 0));
  const SIMS = 4000, out = [];
  let redHits = 0, wsum = 0;
  for (let s = 0; s < SIMS; s++) {
    const level = wpick(V.lv, 1)[0];
    let w = 1;
    known.forEach(k => { w *= Math.pow(qProb(level, k.it.q) || 1e-6, k.n); });
    rar.forEach(x => { w *= Math.pow(qProb(level, x[0]) || 1e-6, x[1]); });
    let val = knownVal, red = known.some(k => k.it.q === 'red') || rar.some(x => x[0] === 'red');
    let cellsUsed = knownCells;
    const add = it => {
      if (jewel && it.a === 1 && pools.jewel1.length) it = pick(pools.jewel1);
      val += price(it); cellsUsed += it.a; if (it.q === 'red') red = true;
    };
    rar.forEach(x => { for (let i = 0; i < x[1]; i++) add(sampleItem(level, x[0])); });
    if (total) {
      for (let i = knownCnt + rarCnt; i < total; i++) add(sampleItem(level));
    } else {
      let target = cellsT;
      if (!target) {
        const sz = wpick(V.sz, 1)[0], mm = BD.sizes[sz];
        target = mm[0] + ((Math.random() * (mm[1] - mm[0] + 1)) | 0);
      }
      let guard = 0;
      while (cellsUsed < target && guard++ < 400) {
        const it = sampleItem(level);
        if (cellsUsed + it.a > target && it.a > 1 && Math.random() < 0.7) continue;
        add(it);
      }
    }
    out.push([val, w]); wsum += w; if (red) redHits += w;
  }
  out.sort((a, b) => a[0] - b[0]);
  const q = p => { let acc = 0; const lim = p * wsum; for (let i = 0; i < out.length; i++) { acc += out[i][1]; if (acc >= lim) return out[i][0]; } return out[out.length - 1][0]; };
  let mean = 0; out.forEach(x => mean += x[0] * x[1]); mean /= wsum || 1;
  return { V, knownVal, knownCnt, rarCnt, p10: q(.1), p25: q(.25), p50: q(.5), p75: q(.75), p90: q(.9), mean,
           pRed: wsum ? redHits / wsum : 0, dbl, jewel };
}

function drawLot() {
  const V = BD.venues.filter(v => v.id === ui.venue)[0] || BD.venues[0];
  if (!V.rules.some(r => r[1] === ui.rule)) ui.rule = 'BKE_Normal';
  const rt = BD.ruleTypes;
  const rtot = V.rules.reduce((s, r) => s + r[2], 0);
  let h = '<div class="cap"><b>Оценка лота</b><span></span><em>что уже раскрыто → сколько ставить</em></div>';
  h += '<div class="box bk-ctl">' +
    '<div class="fgrp"><u>Зал</u>' + BD.venues.map(v => '<button class="fb' + (v.id === V.id ? ' on' : '') +
      '" data-bven="' + v.id + '">' + esc(v.ru) + '</button>').join('') +
      '<span class="bk-dim">' + (V.need ? 'вход от ' + kfmt(V.need) + ', взнос ' + fmt(V.fee) : 'вход свободный') +
      ', совет игры — ' + kfmt(V.rec) + ' на руках</span></div>' +
    '<div class="fgrp"><u>Условие площадки</u>' + V.rules.slice().sort((a, b) => b[2] - a[2]).map(r =>
      '<button class="fb' + (r[1] === ui.rule ? ' on' : '') + '" data-brule="' + r[1] + '" title="' +
      esc((rt[r[1]] || {}).desc || '') + '">' + esc((rt[r[1]] || {}).ru || r[1]) + ' <i class="bk-dim">' +
      (Math.round(r[2] / rtot * 1000) / 10).toString().replace('.', ',') + '%</i></button>').join('') + '</div>' +
  '</div>';

  h += '<div class="bld bk-lot">';
  // известные предметы
  h += '<div class="box"><b class="bk-h">Раскрытые предметы</b>' +
    '<input class="bk-in" id="bkAdd" list="bkNames" placeholder="начни вводить название и выбери">' +
    '<datalist id="bkNames">' + BD.items.map(i => '<option value="' + esc(i.ru) + '">').join('') + '</datalist>' +
    (ui.known.length ? '<div class="bk-kn">' + ui.known.map((k, ix) => {
      const it = BD.byId[k.id]; if (!it) return '';
      return '<div>' + icon(it, 'bk-ic sm') + qdot(it.q) + '<span>' + esc(it.ru) + '</span><em>' + kfmt(it.price) + '</em>' +
        '<div class="bk-cnt sm"><button data-bkd="' + ix + '">−</button><b>' + k.n + '</b><button data-bki="' + ix + '">+</button></div></div>';
    }).join('') + '</div>' : '<div class="hint">Пусто. Сюда — то, что раскрыто полностью: устройство оценки, Чиз в 3-м раунде, «Пророчество 3» Блэкбёрд.</div>') +
  '</div>';
  // известна редкость
  h += '<div class="box"><b class="bk-h">Известна только редкость</b>' +
    '<div class="bk-rar">' + Q_ORDER.map(q => '<div>' + qdot(q) + '<span>' + Q_RU[q] + '</span>' +
      '<div class="bk-cnt sm"><button data-brd="' + q + '">−</button><b>' + (+ui.rar[q] || 0) + '</b><button data-bri="' + q + '">+</button></div></div>').join('') +
    '</div><div class="hint">Цвет видно после анализатора редкости, Ханиэль, Цзююань, Эдгара, Хатор в 5-м раунде.</div></div>';
  // размер контейнера
  h += '<div class="box"><b class="bk-h">Размер контейнера</b>' +
    '<label class="bk-lb">всего предметов <input class="bk-in sm" id="bkTot" type="number" min="0" value="' + esc(ui.total) + '"></label>' +
    '<label class="bk-lb">или занято клеток <input class="bk-in sm" id="bkCells" type="number" min="0" value="' + esc(ui.cells) + '"></label>' +
    '<div class="hint">Не знаешь — оставь пустым, возьмётся типичный для зала размер: ' +
      V.sz.map(s => SIZE_RU[s[0]] + ' ' + BD.sizes[s[0]][0] + '–' + BD.sizes[s[0]][1]).join(', ') + ' клеток. ' +
      'Число предметов даёт «Пророчество 1» Блэкбёрд.</div>' +
    '<button class="fb" id="bkClr" style="margin-top:6px">очистить всё раскрытое</button></div>';
  h += '</div>';
  h += '<div id="bkEst"><div class="box bk-wait">Считаю…</div></div>';
  $('body').innerHTML = h;

  const B2 = $('body');
  B2.querySelectorAll('[data-bven]').forEach(b => b.onclick = () => { ui.venue = b.dataset.bven; saveUi(); drawLot(); });
  B2.querySelectorAll('[data-brule]').forEach(b => b.onclick = () => { ui.rule = b.dataset.brule; saveUi(); drawLot(); });
  const add = $('bkAdd');
  // input, а не change: выбор из подсказки приходит событием input сразу,
  // а change срабатывает ещё и на потере фокуса — предмет добавлялся дважды.
  add.oninput = () => {
    const v = add.value.trim().toLowerCase();
    const it = BD.items.filter(i => i.ru.toLowerCase() === v || i.en.toLowerCase() === v)[0];
    if (!it) return;
    add.value = '';
    const k = ui.known.filter(x => x.id === it.id)[0];
    if (k) k.n++; else ui.known.push({ id: it.id, n: 1 });
    saveUi(); drawLot();
    const a2 = $('bkAdd'); if (a2) a2.focus();
  };
  B2.querySelectorAll('[data-bki]').forEach(b => b.onclick = () => { ui.known[+b.dataset.bki].n++; saveUi(); drawLot(); });
  B2.querySelectorAll('[data-bkd]').forEach(b => b.onclick = () => {
    const k = ui.known[+b.dataset.bkd]; k.n--; if (k.n <= 0) ui.known.splice(+b.dataset.bkd, 1); saveUi(); drawLot();
  });
  B2.querySelectorAll('[data-bri]').forEach(b => b.onclick = () => { ui.rar[b.dataset.bri] = (+ui.rar[b.dataset.bri] || 0) + 1; saveUi(); drawLot(); });
  B2.querySelectorAll('[data-brd]').forEach(b => b.onclick = () => { ui.rar[b.dataset.brd] = Math.max(0, (+ui.rar[b.dataset.brd] || 0) - 1); saveUi(); drawLot(); });
  $('bkTot').onchange = () => { ui.total = $('bkTot').value; saveUi(); drawLot(); };
  $('bkCells').onchange = () => { ui.cells = $('bkCells').value; saveUi(); drawLot(); };
  $('bkClr').onclick = () => { ui.known = []; ui.rar = {}; ui.total = ''; ui.cells = ''; ui.second = ''; saveUi(); drawLot(); };
  setTimeout(() => { const box = $('bkEst'); if (box) { box.innerHTML = estHtml(estimate()); bindEst(); } }, 20);
}
function estHtml(e) {
  const risk = { p25: ['осторожно', e.p25], p50: ['по медиане', e.p50], p75: ['смело', e.p75] };
  const cap = (risk[ui.risk] || risk.p50)[1];
  const R = BD.rounds;
  let h = '<div class="bld bk-lot">';
  h += '<div class="box bfull"><b class="bk-h">Стоимость контейнера</b>' +
    '<div class="bk-range">' +
      '<div><span>p10</span><b>' + kfmt(e.p10) + '</b></div>' +
      '<div><span>p25</span><b>' + kfmt(e.p25) + '</b></div>' +
      '<div class="mid"><span>медиана</span><b>' + kfmt(e.p50) + '</b></div>' +
      '<div><span>p75</span><b>' + kfmt(e.p75) + '</b></div>' +
      '<div><span>p90</span><b>' + kfmt(e.p90) + '</b></div>' +
    '</div>' +
    '<div class="bk-line">среднее ' + kfmt(e.mean) + ' · раскрыто на ' + kfmt(e.knownVal) +
      ' · шанс, что внутри есть красный: ' + Math.round(e.pRed * 100) + '%' +
      (e.dbl ? ' · ' + Q_RU[e.dbl] + ' идут ×2' : '') + (e.jewel ? ' · все 1×1 стали самоцветами' : '') + '</div>' +
    '<div class="hint">p10–p90: в восьми контейнерах из десяти цена окажется в этом коридоре. Чем больше раскрыто, тем он уже.</div>' +
  '</div>';
  h += '<div class="box bfull"><b class="bk-h">Ставки</b>' +
    '<div class="fgrp" style="margin:6px 0 8px"><u>Потолок</u>' + Object.keys(risk).map(k =>
      '<button class="fb' + (ui.risk === k ? ' on' : '') + '" data-brisk="' + k + '">' + risk[k][0] + ' — ' + kfmt(risk[k][1]) + '</button>').join('') + '</div>' +
    '<div class="mtab bk-t"><table class="tbl" style="margin:0"><thead><tr><th>раунд</th><th>досрочно забираешь, если</th>' +
      '<th>досрочка выгодна, пока вторая ставка ниже</th></tr></thead><tbody>' +
      R.map((k, i) => '<tr' + (ui.round === i + 1 ? ' class="top"' : '') + '><td><b>' + (i + 1) + '</b></td><td>' +
        (i < 4 ? 'ставка больше второй в <b>' + String(k).replace('.', ',') + '</b> раза' : 'просто самая высокая ставка') +
        '</td><td class="num">' + kfmt(cap / k) + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="bk-calc"><span>Раунд</span>' + [1, 2, 3, 4, 5].map(r => '<button class="fb' + (ui.round === r ? ' on' : '') +
      '" data-bround="' + r + '">' + r + '</button>').join('') +
      '<span>вторая ставка сейчас</span><input class="bk-in sm" id="bkSec" type="number" min="0" value="' + esc(ui.second) + '"></div>' +
    '<div id="bkAdv">' + advHtml(cap, e) + '</div>' +
    '<div class="hint">Потолок — сколько контейнер стоит по выбранной оценке; дороже его ставить — играть в минус. ' +
      'Если победитель ушёл в убыток, каждый из трёх остальных получает <b>10%</b> этого убытка: соперника, ' +
      'который зарвался, выгоднее не перебивать. При «Затемнении» чужие суммы не видны, только порядок — ' +
      'досрочку не посчитать, ориентируйся на потолок.</div>' +
  '</div></div>';
  return h;
}
function advHtml(cap, e) {
  const sec = Math.max(0, +ui.second || 0);
  const k = BD.rounds[ui.round - 1] || 1;
  if (!sec) return '<div class="hint">Впиши вторую по величине ставку прошлого раунда — посчитаю, сколько нужно на досрочную победу.</div>';
  const need = ui.round < 5 ? Math.floor(sec * k) + 1 : sec + 1;
  const prof = cap - need;
  const ok = prof > 0;
  return '<div class="verdict ' + (ok ? 'good' : 'bad') + '">' +
    (ui.round < 5 ? 'Досрочно в ' + ui.round + '-м раунде: от <b>' + fmt(need) + '</b>' : 'Перебить в 5-м раунде: от <b>' + fmt(need) + '</b>') +
    ' → ' + (ok ? 'ожидаемая прибыль около <b>' + kfmt(prof) + '</b>' : 'выйдет дороже оценки на <b>' + kfmt(-prof) + '</b>, не стоит') +
    (ok && e.p25 < need ? '. Но с вероятностью больше 25% контейнер дешевле этой суммы' : '') + '.</div>';
}
function bindEst() {
  const B2 = $('body');
  B2.querySelectorAll('[data-brisk]').forEach(b => b.onclick = () => { ui.risk = b.dataset.brisk; saveUi(); drawLot(); });
  B2.querySelectorAll('[data-bround]').forEach(b => b.onclick = () => { ui.round = +b.dataset.bround; saveUi(); drawLot(); });
  const s = $('bkSec');
  if (s) s.onchange = () => { ui.second = s.value; saveUi(); drawLot(); };
}

// ═════ СПРАВОЧНИК ═══════════════════════════════════════════════════════════
const SORTS = [['price', 'цена'], ['cell', 'цена за клетку'], ['shells', 'ракушки/ч'], ['fons', 'фонсы/ч'], ['size', 'размер']];
function drawDir() {
  let h = '<div class="cap"><b>Справочник</b><span></span><em>' + BD.items.length + ' коллекционных предметов</em></div>';
  h += '<div class="box bk-ctl">' +
    '<input class="bk-in" id="bkQ" placeholder="поиск по названию (рус/англ)" value="' + esc(ui.dq) + '">' +
    '<div class="fgrp"><u>Редкость</u><button class="fb' + (!ui.dqual ? ' on' : '') + '" data-bdq="">все</button>' +
      Q_ORDER.map(q => '<button class="fb' + (ui.dqual === q ? ' on' : '') + '" data-bdq="' + q + '">' + qdot(q) + Q_RU[q] + '</button>').join('') + '</div>' +
    '<div class="fgrp"><u>Тип</u><button class="fb' + (!ui.dtype ? ' on' : '') + '" data-bdt="">все</button>' +
      Object.keys(TYPE_RU).map(t => '<button class="fb' + (ui.dtype === t ? ' on' : '') + '" data-bdt="' + t + '">' + TYPE_RU[t] + '</button>').join('') + '</div>' +
    '<div class="fgrp"><u>Сортировка</u>' + SORTS.map(s => '<button class="fb' + (ui.dsort === s[0] ? ' on' : '') +
      '" data-bds="' + s[0] + '">' + s[1] + '</button>').join('') + '</div>' +
  '</div><div id="bkDir"></div>';
  $('body').innerHTML = h;
  const B2 = $('body');
  B2.querySelectorAll('[data-bdq]').forEach(b => b.onclick = () => { ui.dqual = b.dataset.bdq; saveUi(); drawDir(); });
  B2.querySelectorAll('[data-bdt]').forEach(b => b.onclick = () => { ui.dtype = b.dataset.bdt; saveUi(); drawDir(); });
  B2.querySelectorAll('[data-bds]').forEach(b => b.onclick = () => { ui.dsort = b.dataset.bds; saveUi(); drawDir(); });
  const q = $('bkQ');
  q.oninput = () => { ui.dq = q.value; saveUi(); dirList(); };
  dirList();
}
function dirList() {
  const s = (ui.dq || '').trim().toLowerCase();
  const key = { price: i => -i.price, cell: i => -i.price / i.a, shells: i => -i.shellsH, fons: i => -i.fonsH, size: i => -i.a }[ui.dsort] || (i => -i.price);
  const list = BD.items.filter(i => (!ui.dqual || i.q === ui.dqual) && (!ui.dtype || i.type === ui.dtype) &&
    (!s || i.ru.toLowerCase().indexOf(s) >= 0 || i.en.toLowerCase().indexOf(s) >= 0))
    .sort((a, b) => key(a) - key(b) || Q_ORDER.indexOf(a.q) - Q_ORDER.indexOf(b.q));
  $('bkDir').innerHTML = !list.length ? '<div class="empty">ничего не нашлось</div>' :
    '<div class="mtab bk-t"><table class="tbl bk-dir" style="margin:0"><thead><tr><th></th><th>предмет</th><th>тип</th>' +
    '<th>размер</th><th class="num">цена</th><th class="num">за клетку</th><th class="num">рак/ч</th><th class="num">ф/ч</th></tr></thead><tbody>' +
    list.map(i => '<tr><td class="bk-dic"><div class="bk-' + i.q + '">' + icon(i, 'bk-ic') + '</div></td>' +
      '<td>' + qdot(i.q) + '<b>' + esc(i.ru) + '</b><br><span class="bk-dim">' + esc(i.en) + ' · ступень ' + i.tier + '</span></td>' +
      '<td>' + esc(TYPE_RU[i.type] || i.type) + '</td><td>' + i.w + '×' + i.h + '</td>' +
      '<td class="num">' + fmt(i.price) + '</td><td class="num">' + fmt(i.price / i.a) + '</td>' +
      '<td class="num">' + (i.shellsH ? fmt(i.shellsH) : '—') + '</td><td class="num">' + (i.fonsH || '—') + '</td></tr>').join('') +
    '</tbody></table></div><div class="hint">Показано ' + list.length + '. Ракушки и фонсы в час — доход на витрине, есть только у красных.</div>';
}

// ═════ ПОДСКАЗКИ ════════════════════════════════════════════════════════════
function drawTips() {
  const rt = BD.ruleTypes;
  const types = Object.keys(rt).sort((a, b) => (a === 'BKE_Normal') - (b === 'BKE_Normal'));
  let h = '<div class="cap"><b>Залы</b><span></span><em>из таблиц игры</em></div>';
  h += '<div class="mtab bk-t"><table class="tbl" style="margin:0"><thead><tr><th>зал</th><th class="num">вход от</th><th class="num">взнос</th>' +
    '<th>уровни склада</th><th>размеры</th>' + types.map(t => '<th class="num">' + esc(rt[t].ru) + '</th>').join('') + '</tr></thead><tbody>' +
    BD.venues.map(v => {
      const tot = v.rules.reduce((s, r) => s + r[2], 0);
      const lt = v.lv.reduce((s, l) => s + l[1], 0);
      return '<tr><td><b>' + esc(v.ru) + '</b></td><td class="num">' + (v.need ? kfmt(v.need) : '—') + '</td><td class="num">' + (v.fee ? fmt(v.fee) : '—') + '</td>' +
        '<td>' + v.lv.map(l => l[0] + ': ' + Math.round(l[1] / lt * 100) + '%').join(', ') + '</td>' +
        '<td>' + v.sz.map(s => SIZE_RU[s[0]]).join(', ') + '</td>' +
        types.map(t => { const r = v.rules.filter(x => x[1] === t)[0]; return '<td class="num">' + (r ? (Math.round(r[2] / tot * 1000) / 10).toString().replace('.', ',') + '%' : '—') + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
  h += '<div class="hint">Вероятности условий — по таблице DT_BidKingWarehouseRuleConfig. В справке самой игры для ' +
    'Ракушечного зала вместо «Удвоения» и «Золотой лихорадки» записано «Затемнение» 7,5% и «Удвоение» 2,5% — в таблице ' +
    'Затемнения в этом зале нет совсем, верим таблице.</div>';

  h += '<div class="cap"><b>Условия площадки</b><span></span></div><div class="bld">' +
    types.map(t => '<div class="box"><b class="bk-h">' + esc(rt[t].ru) + '</b><div class="hint" style="margin-top:4px">' + esc(rt[t].desc) + '</div></div>').join('') + '</div>';

  h += '<div class="cap"><b>Как идут торги</b><span></span></div><div class="box"><ul class="bk-ul">' +
    '<li>Пять раундов, ставки закрытые. Досрочно контейнер забирает тот, чья ставка больше второй в ' +
      BD.rounds.slice(0, 4).map(k => String(k).replace('.', ',')).join(' / ') + ' раза (раунды 1–4). В 5-м побеждает просто самая высокая.</li>' +
    '<li>Ничья в 5-м — 6-й раунд только для лидеров, ставка не ниже прошлой. Снова ничья — лот не продаётся.</li>' +
    '<li>Победитель в минусе — каждый из трёх остальных получает 10% его убытка.</li>' +
    '<li>В раундах 1 и 3 аукционист открывает общие сведения; при «Инсайдерской информации» — дополнительные.</li>' +
    '<li>«Удвоение» и «Золотая лихорадка»: удвоенные предметы продаются автоматически при выходе из режима — на витрину их не поставить.</li>' +
  '</ul></div>';

  h += '<div class="cap"><b>Помощники</b><span></span><em>кого брать</em></div><div class="bld">' +
    Object.keys(BD.assistants).map(k => { const a = BD.assistants[k];
      // помощники — это эсперы: портрет берём из справочника, клик открывает карточку
      const e = (typeof DB !== 'undefined' && DB && DB.agents || []).filter(x => x.ru === a.ru)[0];
      return '<div class="box bk-as"' + (e ? ' data-bslug="' + esc(e.slug) + '"' : '') + '>' +
        (e ? '<img class="bk-ap" src="' + portrait(e) + '" alt="" loading="lazy" data-nf="drop">' : '') +
        '<div><b class="bk-h">' + esc(a.ru) + ' — ' + esc(a.skill) + '</b><div class="hint" style="margin-top:4px">' +
        esc(a.desc).replace(/\r?\n/g, '<br>') + '</div></div></div>'; }).join('') + '</div>';
  h += '<div class="hint">Для оценки цены полезнее всех те, кто раскрывает <b>редкость</b> дорогих предметов: Даффодил (сразу число фиолетовых, золотых и красных), ' +
    'Цзююань (силуэт самого редкого + по предмету за раунд), Ханиэль. Эдгар раскрывает дешёвую мелочь — по деньгам это почти ничего, зато ' +
    'сразу понятно, сколько клеток занимает мусор. Блэкбёрд даёт случайное — от числа предметов до точной цены самого редкого.</div>';

  h += '<div class="cap"><b>Комплекты устройств</b><span></span></div><div class="mtab bk-t"><table class="tbl" style="margin:0"><thead><tr><th>комплект</th><th class="num">цена</th><th>внутри</th></tr></thead><tbody>' +
    Object.keys(BD.sets).map(k => { const s = BD.sets[k];
      return '<tr><td><b>' + esc(s.ru) + '</b></td><td class="num">' + fmt(s.price) + '</td><td>' +
        s.items.map(d => esc((BD.devices[d] || {}).ru || d)).join(' · ') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  h += '<div class="cap"><b>Устройства</b><span></span></div><div class="mtab bk-t"><table class="tbl" style="margin:0"><thead><tr><th>устройство</th><th class="num">цена</th><th>что делает</th></tr></thead><tbody>' +
    Object.keys(BD.devices).map(k => { const d = BD.devices[k];
      return '<tr><td><b>' + esc(d.ru) + '</b></td><td class="num">' + fmt(d.price) + '</td><td>' + esc(d.desc) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  $('body').innerHTML = h;
  $('body').querySelectorAll('[data-bslug]').forEach(el => el.onclick = () => {
    if (typeof open === 'function') open(el.dataset.bslug);
  });
}

// ═════ ЖУРНАЛ ═══════════════════════════════════════════════════════════════
// Сколько реально заработал: вписываешь лот после торгов — сводка по неделе,
// месяцу, залам и условиям площадки. «Не выиграл» — ставка 0, выручка 0, это
// тоже полезно: видно, в каких залах чаще уходишь пустым.
function drawLog() {
  const лог = lsGet(LS_LOG, []);
  const сейчас = Date.now(), неделя = 7 * 864e5, месяц = 30 * 864e5;
  const сумм = список => список.reduce((s, x) => { s.n++; s.bid += +x.bid || 0; s.sold += +x.sold || 0; return s; }, { n: 0, bid: 0, sold: 0 });
  const плитка = (имя, с) => '<div class="box"><b class="bk-h">' + esc(имя) + '</b><div style="font-size:20px;font-weight:700;margin-top:4px;color:' +
    (с.sold - с.bid >= 0 ? 'var(--acc,#4ade80)' : '#f87171') + '">' + (с.sold - с.bid >= 0 ? '+' : '') + kfmt(с.sold - с.bid) + '</div>' +
    '<div class="hint" style="margin:2px 0 0">лотов ' + с.n + ' · потрачено ' + kfmt(с.bid) + ' · выручка ' + kfmt(с.sold) + '</div></div>';
  const поЗалу = {}, поУсл = {};
  лог.forEach(x => { (поЗалу[x.venue] = поЗалу[x.venue] || []).push(x); (поУсл[x.rule] = поУсл[x.rule] || []).push(x); });
  const залРу = id => ((BD.venues || []).filter(v => v.id === id)[0] || {}).ru || id || '—';
  const услРу = id => ((BD.ruleTypes || {})[id] || {}).ru || id || '—';
  const сред = с => с.n ? kfmt((с.sold - с.bid) / с.n) : '—';
  let h = '<div class="cap"><b>Записать лот</b><span></span><em>после торгов</em></div>' +
    '<div class="box"><div class="fgrp" style="flex-wrap:wrap;gap:8px;align-items:center">' +
      '<select id="lgV">' + (BD.venues || []).map(v => '<option value="' + esc(v.id) + '"' + (v.id === ui.venue ? ' selected' : '') + '>' + esc(v.ru) + '</option>').join('') + '</select>' +
      '<select id="lgR">' + Object.keys(BD.ruleTypes || {}).map(k => '<option value="' + esc(k) + '"' + (k === ui.rule ? ' selected' : '') + '>' + esc(BD.ruleTypes[k].ru) + '</option>').join('') + '</select>' +
      '<input id="lgB" type="number" min="0" placeholder="ставка" style="width:110px">' +
      '<input id="lgS" type="number" min="0" placeholder="выручка" style="width:110px">' +
      '<input id="lgN" placeholder="заметка" style="width:160px">' +
      '<button class="fb on" id="lgAdd">записать</button>' +
    '</div><div class="hint" style="margin:6px 0 0">Не выиграл — оставь ставку и выручку пустыми: лот попадёт в счёт как пустой.</div></div>';
  if (лог.length) {
    h += '<div class="cap"><b>Итог</b><span></span></div><div class="bld">' +
      плитка('За неделю', сумм(лог.filter(x => сейчас - x.t < неделя))) +
      плитка('За месяц', сумм(лог.filter(x => сейчас - x.t < месяц))) +
      плитка('За всё время', сумм(лог)) + '</div>';
    h += '<div class="cap"><b>По залам</b><span></span><em>средняя прибыль за лот</em></div><div class="mtab bk-t"><table class="tbl" style="margin:0"><thead><tr><th>зал</th><th class="num">лотов</th><th class="num">выиграно</th><th class="num">средняя</th><th class="num">всего</th></tr></thead><tbody>' +
      Object.keys(поЗалу).map(k => { const с = сумм(поЗалу[k]); const выигр = поЗалу[k].filter(x => +x.bid > 0).length;
        return '<tr><td><b>' + esc(залРу(k)) + '</b></td><td class="num">' + с.n + '</td><td class="num">' + выигр + '</td><td class="num">' + сред(с) + '</td><td class="num">' + kfmt(с.sold - с.bid) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    h += '<div class="cap"><b>По условиям площадки</b><span></span></div><div class="mtab bk-t"><table class="tbl" style="margin:0"><thead><tr><th>условие</th><th class="num">лотов</th><th class="num">средняя</th></tr></thead><tbody>' +
      Object.keys(поУсл).map(k => { const с = сумм(поУсл[k]); return '<tr><td>' + esc(услРу(k)) + '</td><td class="num">' + с.n + '</td><td class="num">' + сред(с) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    h += '<div class="cap"><b>Последние</b><span></span><em>' + лог.length + '</em></div><div class="mtab bk-t"><table class="tbl" style="margin:0"><thead><tr><th>когда</th><th>зал</th><th>условие</th><th class="num">ставка</th><th class="num">выручка</th><th class="num">итог</th><th></th></tr></thead><tbody>' +
      лог.slice().reverse().slice(0, 40).map(x => '<tr><td>' + esc(new Date(x.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</td>' +
        '<td>' + esc(залРу(x.venue)) + '</td><td>' + esc(услРу(x.rule)) + (x.note ? ' · <i>' + esc(x.note) + '</i>' : '') + '</td>' +
        '<td class="num">' + kfmt(+x.bid || 0) + '</td><td class="num">' + kfmt(+x.sold || 0) + '</td>' +
        '<td class="num" style="color:' + ((+x.sold || 0) - (+x.bid || 0) >= 0 ? 'inherit' : '#f87171') + '">' + kfmt((+x.sold || 0) - (+x.bid || 0)) + '</td>' +
        '<td><button class="fb" data-lgdel="' + x.t + '" title="удалить запись">✕</button></td></tr>').join('') +
      '</tbody></table></div>';
  } else h += '<div class="hint">Записей пока нет. После каждого лота — пара цифр, и здесь появится, сколько приносит неделя и какой зал выгоднее.</div>';
  $('body').innerHTML = h;
  $('lgAdd').onclick = () => {
    const з = lsGet(LS_LOG, []);
    з.push({ t: Date.now(), venue: $('lgV').value, rule: $('lgR').value, bid: +$('lgB').value || 0, sold: +$('lgS').value || 0, note: $('lgN').value.trim().slice(0, 60) });
    ui.venue = $('lgV').value; ui.rule = $('lgR').value; saveUi();
    lsSet(LS_LOG, з.slice(-2000));
    if (typeof scheduleSync === 'function') scheduleSync();
    drawLog();
  };
  $('body').querySelectorAll('[data-lgdel]').forEach(b => b.onclick = () => {
    if (!confirm('Удалить эту запись?')) return;
    lsSet(LS_LOG, lsGet(LS_LOG, []).filter(x => String(x.t) !== b.dataset.lgdel));
    drawLog();
  });
}

window.NTEBID = { draw: draw, load: load };
})();
