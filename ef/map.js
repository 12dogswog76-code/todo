// Интерактивная карта Endfield.
//
// Данные — из выгрузки endfieldtools.dev (с разрешения автора): 8 с лишним
// тысяч точек по двум картам (Долина IV и Улин), у каждой точки мировые
// координаты x/z, тип и зона. Подложка — тайлы из файлов игры: у каждой зоны
// своя сетка ячеек по 100 единиц мира, одна ячейка = одна картинка 600×600.
// Ось z в игре смотрит на север, поэтому на экране она переворачивается.
//
// Всё рисуется на одном canvas: и тайлы, и точки. Три тысячи точек DOM-ом
// роняют браузер (проверено на карте NTE), canvas рисует их мгновенно.
// Масштаб — через размер отрисовки, а не transform: иначе мыло.
//
// Тайлов на диске может быть не все: их докачивают отдельным скриптом
// (ef\Исходники\eft-tiles.js в консоли браузера). Где тайла нет — рисуется контур ячейки.

(function () {
'use strict';
const { $, эк } = EF;
const ЯЧЕЙКА = 100;          // единиц мира в одной ячейке
const ТАЙЛ = 600;            // пикселей в картинке ячейки
const СОБИРАЕМОЕ = ['chest', 'collect', 'story', 'poi'];

let МИР = null;
let К = 0;                   // индекс карты
let вид = null;              // { x, y, z } — центр в координатах карты и пикселей на единицу
let холст = null, ctx = null, W = 0, H = 0, DPR = 1;
let попап = null;
const картинки = {};
// По умолчанию враги, растения, записи и прочее скрыты: всё сразу — это
// восемь тысяч точек и каша. Включаются одним кликом по группе.
const ПОУМОЛЧАНИЮ = { 'g:enemy': 1, 'g:plant': 1, 'g:story': 1, 'g:other': 1 };
const выкл = () => EF.взять('ef-map-off', null) || Object.assign({}, ПОУМОЛЧАНИЮ);
const собрано = () => EF.взять('ef-map-found', {});
let скрыватьСобранное = EF.взять('ef-map-hidefound', false);
let поиск = '';

function карта() { return МИР.карты[К]; }
function ключТочки(т) { return карта().id + ':' + т[4]; }

// ── геометрия ───────────────────────────────────────────────────────────────
// Координаты «карты»: mx = x мира, my = −z мира (север вверх).
function наЭкран(mx, my) { return [(mx - вид.x) * вид.z + W / 2, (my - вид.y) * вид.z + H / 2]; }
function сЭкрана(sx, sy) { return [(sx - W / 2) / вид.z + вид.x, (sy - H / 2) / вид.z + вид.y]; }
function рамка() {
  const у = карта().уровни;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  у.forEach(л => {
    x0 = Math.min(x0, л.x0 * ЯЧЕЙКА); x1 = Math.max(x1, (л.x0 + л.w) * ЯЧЕЙКА);
    y0 = Math.min(y0, -(л.y0 + л.h) * ЯЧЕЙКА); y1 = Math.max(y1, -л.y0 * ЯЧЕЙКА);
  });
  return { x0, x1, y0, y1 };
}
function вписать(р, запас) {
  запас = запас || 1.06;
  const z = Math.min(W / ((р.x1 - р.x0) * запас), H / ((р.y1 - р.y0) * запас));
  вид = { x: (р.x0 + р.x1) / 2, y: (р.y0 + р.y1) / 2, z: Math.max(0.05, Math.min(z, 12)) };
}
function уровеньРамка(л) {
  return { x0: л.x0 * ЯЧЕЙКА, x1: (л.x0 + л.w) * ЯЧЕЙКА, y0: -(л.y0 + л.h) * ЯЧЕЙКА, y1: -л.y0 * ЯЧЕЙКА };
}

// ── картинки ────────────────────────────────────────────────────────────────
let скороРисовать = 0;
function картинка(src) {
  let im = картинки[src];
  if (!im) {
    im = картинки[src] = new Image();
    im.onload = () => { im.готова = true; перерисоватьСкоро(); };
    im.onerror = () => { im.битая = true; };
    im.src = src;
  }
  return im;
}
function перерисоватьСкоро() {
  if (скороРисовать) return;
  скороРисовать = requestAnimationFrame(() => { скороРисовать = 0; рисовать(); });
}

// ── отрисовка ───────────────────────────────────────────────────────────────
function рисовать() {
  if (!ctx || !вид) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#07080a';
  ctx.fillRect(0, 0, W, H);
  const к = карта();
  const пкс = вид.z * ЯЧЕЙКА;                     // сторона ячейки на экране
  ctx.imageSmoothingQuality = 'high';
  // подложка: сначала контуры ячеек, потом тайлы поверх
  к.уровни.forEach(л => {
    const есть = new Set(л.есть);
    л.тайлы.forEach(t => {
      const [i, j] = t.split('_').map(Number);
      const mx = (л.x0 + i - 1) * ЯЧЕЙКА;
      const my = -(л.y0 + j) * ЯЧЕЙКА;
      const [sx, sy] = наЭкран(mx, my);
      if (sx > W || sy > H || sx + пкс < 0 || sy + пкс < 0) return;
      if (есть.has(t)) {
        const im = картинка('map/' + л.id + '/' + t + '.webp');
        if (im.готова) ctx.drawImage(im, sx, sy, пкс + 0.6, пкс + 0.6);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.018)';
        ctx.fillRect(sx, sy, пкс, пкс);
        ctx.strokeStyle = 'rgba(255,255,255,.05)';
        ctx.strokeRect(sx + .5, sy + .5, пкс - 1, пкс - 1);
      }
    });
  });
  // подписи зон
  if (вид.z < 0.9) {
    ctx.font = '800 13px "EF Sans", system-ui';
    ctx.textAlign = 'center';
    к.уровни.forEach(л => {
      const р = уровеньРамка(л);
      const [sx, sy] = наЭкран((р.x0 + р.x1) / 2, (р.y0 + р.y1) / 2);
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      const w = ctx.measureText(л.имя.toUpperCase()).width + 16;
      ctx.fillRect(sx - w / 2, sy - 12, w, 22);
      ctx.fillStyle = '#fdfd1f';
      ctx.fillText(л.имя.toUpperCase(), sx, sy + 4);
    });
  }
  // точки
  const off = выкл(), f = собрано();
  const r = Math.max(7, Math.min(13, 6 + вид.z * 3));
  const видно = [];
  к.точки.forEach(т => {
    const тип = МИР.типы[т[2]];
    if (off['g:' + тип.г] || off['t:' + т[2]]) return;
    const взят = !!f[ключТочки(т)];
    if (взят && скрыватьСобранное) return;
    const [sx, sy] = наЭкран(т[0], -т[1]);
    if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) return;
    видно.push([sx, sy, т, взят]);
  });
  видно.forEach(([sx, sy, т, взят]) => {
    const тип = МИР.типы[т[2]];
    const гр = МИР.группы.find(g => g.id === тип.г);
    ctx.globalAlpha = взят ? 0.28 : 1;
    if (тип.з) {
      const im = картинка(тип.з);
      ctx.fillStyle = 'rgba(8,9,6,.82)';
      ctx.beginPath(); ctx.arc(sx, sy, r + 2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#' + (гр ? гр.цвет : 'ffffff');
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (im.готова) ctx.drawImage(im, sx - r, sy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#' + (гр ? гр.цвет : 'ffffff');
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(4, r * 0.55), 0, 7); ctx.fill(); ctx.stroke();
    }
    if (взят) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#46e08c';
      ctx.font = '900 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('✓', sx, sy + 4);
    }
  });
  ctx.globalAlpha = 1;
  холст.видно = видно;
  const сч = $('mapcnt');
  if (сч) сч.textContent = видно.length + ' на экране';
}

// ── попап точки ─────────────────────────────────────────────────────────────
function закрытьПопап() { if (попап) { попап.remove(); попап = null; } }
function показатьПопап(т, sx, sy) {
  закрытьПопап();
  const тип = МИР.типы[т[2]];
  const гр = МИР.группы.find(g => g.id === тип.г);
  const л = карта().уровни[т[3]];
  const можно = СОБИРАЕМОЕ.indexOf(тип.г) >= 0;
  const взят = !!собрано()[ключТочки(т)];
  const всего = карта().точки.filter(x => x[2] === т[2]).length;
  const f = собрано();
  const взято = карта().точки.filter(x => x[2] === т[2] && f[ключТочки(x)]).length;
  попап = document.createElement('div');
  попап.className = 'mappop';
  попап.innerHTML = '<div style="display:flex;gap:10px;align-items:center">' +
    (тип.з ? '<img src="' + эк(тип.з) + '" alt="" style="width:34px;height:34px;object-fit:contain">' : '') +
    '<div><b>' + эк(тип.н) + '</b><i>' + эк(гр ? гр.имя : '') + ' · ' + эк(л ? л.имя : '') + '</i></div></div>' +
    '<div class="kv" style="font-size:11.5px;margin-bottom:8px"><span>координаты</span><b>' + Math.round(т[0]) + ', ' + Math.round(т[1]) + '</b>' +
    '<span>таких на карте</span><b>' + всего + (можно ? ' · собрано ' + взято : '') + '</b></div>' +
    (можно ? '<button class="btn sm' + (взят ? ' gh' : '') + '" data-mfound="' + эк(ключТочки(т)) + '">' + (взят ? 'снять отметку' : '✓ собрано') + '</button>' : '');
  const box = $('mapbox');
  box.appendChild(попап);
  const w = попап.offsetWidth, h = попап.offsetHeight;
  попап.style.left = Math.max(6, Math.min(W - w - 6, sx + 14)) + 'px';
  попап.style.top = Math.max(6, Math.min(H - h - 6, sy - h / 2)) + 'px';
}
function попадание(sx, sy) {
  const в = холст.видно || [];
  let лучш = null, д = 14 * 14;
  for (let i = в.length - 1; i >= 0; i--) {
    const [x, y, т] = в[i];
    const dd = (x - sx) * (x - sx) + (y - sy) * (y - sy);
    if (dd < д) { д = dd; лучш = [т, x, y]; }
  }
  return лучш;
}

// ── управление ──────────────────────────────────────────────────────────────
// getBoundingClientRect даёт размеры с учётом масштаба страницы, а
// clientWidth — в разметочных пикселях. При зуме 125 % без поправки промах
// курсора доходил до 150 пикселей (грабли карты NTE).
function позиция(e) {
  const r = холст.getBoundingClientRect();
  const kx = r.width / (холст.clientWidth || 1), ky = r.height / (холст.clientHeight || 1);
  return [(e.clientX - r.left) / kx, (e.clientY - r.top) / ky];
}
function зум(множ, sx, sy) {
  const [mx, my] = сЭкрана(sx, sy);
  const z = Math.max(0.03, Math.min(10, вид.z * множ));
  вид.z = z;
  вид.x = mx - (sx - W / 2) / z;
  вид.y = my - (sy - H / 2) / z;
  рисовать();
}
function подключить() {
  холст = $('mapcv');
  ctx = холст.getContext('2d');
  const box = $('mapbox');
  const размер = () => {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = box.clientWidth; H = box.clientHeight;
    холст.width = Math.round(W * DPR); холст.height = Math.round(H * DPR);
    if (!вид) вписать(рамка());
    рисовать();
  };
  const ro = new ResizeObserver(размер);
  ro.observe(box);
  EF.уйти = () => { ro.disconnect(); закрытьПопап(); холст = null; ctx = null; };
  размер();

  const указатели = new Map();
  let старт = null, тянул = false, щипок = 0;
  холст.addEventListener('pointerdown', e => {
    холст.setPointerCapture(e.pointerId);
    указатели.set(e.pointerId, позиция(e));
    старт = { p: позиция(e), x: вид.x, y: вид.y };
    тянул = false;
    if (указатели.size === 2) {
      const [a, b] = [...указатели.values()];
      щипок = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  });
  холст.addEventListener('pointermove', e => {
    const p = позиция(e);
    const [mx, my] = вид ? сЭкрана(p[0], p[1]) : [0, 0];
    const к = $('mapxy'); if (к) к.textContent = Math.round(mx) + ', ' + Math.round(-my);
    if (!указатели.has(e.pointerId)) return;
    указатели.set(e.pointerId, p);
    if (указатели.size === 2) {
      const [a, b] = [...указатели.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (щипок) зум(d / щипок, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      щипок = d; тянул = true;
      return;
    }
    if (!старт) return;
    const dx = p[0] - старт.p[0], dy = p[1] - старт.p[1];
    if (!тянул && Math.hypot(dx, dy) < 4) return;
    тянул = true;
    box.classList.add('drag');
    закрытьПопап();
    вид.x = старт.x - dx / вид.z;
    вид.y = старт.y - dy / вид.z;
    рисовать();
  });
  const отпустить = e => {
    указатели.delete(e.pointerId);
    box.classList.remove('drag');
    if (указатели.size === 0) {
      if (!тянул && старт) {
        const p = позиция(e);
        const х = попадание(p[0], p[1]);
        if (х) показатьПопап(х[0], х[1], х[2]); else закрытьПопап();
      }
      старт = null; щипок = 0;
    }
  };
  холст.addEventListener('pointerup', отпустить);
  холст.addEventListener('pointercancel', отпустить);
  // Колесо над картой принадлежит карте: страница не прокручивается.
  холст.addEventListener('wheel', e => {
    e.preventDefault();
    закрытьПопап();
    const p = позиция(e);
    зум(Math.pow(1.0018, -e.deltaY), p[0], p[1]);
  }, { passive: false });
}

// ── боковая колонка ─────────────────────────────────────────────────────────
function колонка() {
  const к = карта();
  const off = выкл(), f = собрано();
  const по = {};
  к.точки.forEach(т => {
    const о = по[т[2]] || (по[т[2]] = { n: 0, взято: 0 });
    о.n++;
    if (f[ключТочки(т)]) о.взято++;
  });
  const q = поиск.trim().toLowerCase();
  let h = '<div class="seg" style="width:100%;margin-bottom:10px">' + МИР.карты.map((m, i) =>
    '<button class="' + (i === К ? 'on' : '') + '" data-mmap="' + i + '" style="flex:1">' + эк(m.имя) + '</button>').join('') + '</div>' +
    '<select class="srch" id="mzone" style="width:100%;margin-bottom:8px"><option value="">— перейти к зоне —</option>' +
    к.уровни.map((л, i) => '<option value="' + i + '">' + эк(л.имя) + ' · тайлов ' + л.есть.length + '/' + л.тайлы.length + '</option>').join('') + '</select>' +
    '<input class="srch" id="mq" placeholder="поиск: сундук, феррий, рогач…" value="' + эк(поиск) + '" style="width:100%;min-width:0;margin-bottom:8px">' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
      '<button class="btn sm ' + (скрыватьСобранное ? '' : 'gh') + '" data-mhide="1">' + (скрыватьСобранное ? 'собранное скрыто' : 'скрыть собранное') + '</button>' +
      '<button class="btn sm gh" data-mall="1">всё</button><button class="btn sm gh" data-mnone="1">ничего</button></div>';
  МИР.группы.forEach(g => {
    const типы = МИР.типы.map((t, i) => [t, i]).filter(([t, i]) => t.г === g.id && по[i] &&
      (!q || t.н.toLowerCase().includes(q)));
    if (!типы.length) return;
    const n = типы.reduce((s, [, i]) => s + по[i].n, 0);
    типы.sort((a, b) => по[b[1]].n - по[a[1]].n);
    h += '<div class="mgrp"><button class="mg' + (off['g:' + g.id] ? ' off' : '') + '" data-mg="' + g.id + '"><i style="background:#' + g.цвет + '"></i>' +
      эк(g.имя) + '<em>' + n + '</em></button><div class="mtypes">' + типы.map(([t, i]) => {
        const о = по[i];
        const можно = СОБИРАЕМОЕ.indexOf(t.г) >= 0;
        return '<button class="mt' + (off['t:' + i] ? ' off' : '') + '" data-mt="' + i + '">' +
          (t.з ? '<img src="' + эк(t.з) + '" alt="" loading="lazy">' : '<span class="dot" style="background:#' + g.цвет + '"></span>') +
          эк(t.н) + '<em' + (можно && о.взято === о.n ? ' class="ok"' : '') + '>' + (можно && о.взято ? о.взято + '/' : '') + о.n + '</em></button>';
      }).join('') + '</div></div>';
  });
  return h;
}
function обновитьКолонку() { const с = $('mapside'); if (с) с.innerHTML = колонка(); }

EF.раздел('map', {
  имя: 'Карта', значок: 'img/mark/boss.webp', новое: true,
  async рисовать() {
    $('body').innerHTML = '<div class="empty">загрузка карты…</div>';
    if (!МИР) МИР = await EF.грузить('ef-map.json');
    const к = карта();
    const тайлов = к.уровни.reduce((s, л) => s + л.есть.length, 0);
    const всего = к.уровни.reduce((s, л) => s + л.тайлы.length, 0);
    EF.шапка('world.map · ' + к.id, к.имя, к.точки.length, 'точек');
    $('body').innerHTML = '<div class="mapw"><div class="mapside" id="mapside">' + колонка() + '</div>' +
      '<div class="mapbox" id="mapbox"><canvas id="mapcv"></canvas>' +
        '<div class="ovl"><span class="pill" id="mapcnt"></span>' +
          (тайлов < всего ? '<span class="pill" style="color:var(--warn)">подложка ' + тайлов + ' из ' + всего + ' тайлов</span>' : '') + '</div>' +
        '<div class="zm"><button data-mz="1.5">+</button><button data-mz="0.667">−</button><button data-mz="0" title="вся карта">⤢</button></div>' +
        '<div class="coords" id="mapxy">—</div></div></div>';
    вид = null;
    подключить();
    EF.подвал('Точки и зоны — данные игры из открытой базы endfieldtools.dev, тайлы — файлы игры. Тянуть мышью, колесо — масштаб к курсору, ' +
      'клик по точке — что это и отметка «собрано». Отметки уходят в облако вместе с остальным.' +
      (тайлов < всего ? ' Недостающие тайлы докачиваются скриптом <span class="hl">ef\\Исходники\\eft-tiles.js</span> в консоли браузера на endfieldtools.dev.' : ''));
  },
});

document.addEventListener('click', e => {
  const т = e.target.closest('[data-mmap],[data-mg],[data-mt],[data-mz],[data-mfound],[data-mhide],[data-mall],[data-mnone]');
  if (!т || !МИР) return;
  const д = т.dataset;
  if (д.mmap != null) { К = +д.mmap; вид = null; EF.перерисовать(); return; }
  if (д.mz != null) {
    if (+д.mz === 0) вписать(рамка()); else зум(+д.mz, W / 2, H / 2);
    рисовать(); return;
  }
  if (д.mfound) {
    const f = собрано();
    if (f[д.mfound]) delete f[д.mfound]; else f[д.mfound] = 1;
    EF.положить('ef-map-found', f);
    закрытьПопап(); рисовать(); обновитьКолонку(); return;
  }
  if (д.mhide) { скрыватьСобранное = !скрыватьСобранное; EF.положить('ef-map-hidefound', скрыватьСобранное); обновитьКолонку(); рисовать(); return; }
  const off = выкл();
  if (д.mall) { EF.положить('ef-map-off', {}); }
  else if (д.mnone) { const o = {}; МИР.группы.forEach(g => { o['g:' + g.id] = 1; }); EF.положить('ef-map-off', o); }
  else if (д.mg) { const k = 'g:' + д.mg; if (off[k]) delete off[k]; else off[k] = 1; EF.положить('ef-map-off', off); }
  else if (д.mt) {
    const k = 't:' + д.mt;
    // Клик по типу при выключенной группе — включить группу и оставить только его.
    const г = 'g:' + МИР.типы[+д.mt].г;
    if (off[г]) {
      delete off[г];
      МИР.типы.forEach((t, i) => { if ('g:' + t.г === г && i !== +д.mt) off['t:' + i] = 1; });
      delete off[k];
    } else if (off[k]) delete off[k]; else off[k] = 1;
    EF.положить('ef-map-off', off);
  }
  закрытьПопап(); обновитьКолонку(); рисовать();
});
document.addEventListener('input', e => {
  if (e.target.id === 'mq') {
    поиск = e.target.value;
    const с = $('mapside');
    const поз = e.target.selectionStart;
    с.innerHTML = колонка();
    const q = $('mq'); q.focus(); q.setSelectionRange(поз, поз);
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'mzone' && e.target.value !== '') {
    вписать(уровеньРамка(карта().уровни[+e.target.value]), 1.02);
    закрытьПопап(); рисовать();
  }
});
})();
