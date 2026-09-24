// Справочник Arknights: Endfield — ядро.
//
// Устройство. Слева — панель разделов, как у endfieldtools.dev: база
// (операторы, тир-лист, команды, оружие, снаряжение), мир (карта), фабрика,
// инструменты (планировщик, дейлики, достижения, крутки) и личное (профиль,
// хроника). Каждый раздел — функция рисования, зарегистрированная через
// EF.раздел(). Карта, инструменты и фабрика живут в своих файлах (map.js,
// tools.js, factory.js) и подключаются после этого.
//
// Все файлы — обычные скрипты, у них общая глобальная область. Поэтому код
// каждого файла завёрнут в функцию: одинаковое имя константы в двух файлах
// иначе роняет второй файл целиком («already been declared»).
//
// В разметке нет ни одного onclick: политика безопасности запрещает
// inline-скрипты, события ловятся делегированием на документе.

(function () {
'use strict';

const APP_VER = 'v6';
const ВОРКЕР = 'https://alextask-push.12dogswog76.workers.dev';
const API = ['https://api.alextask.ru', ВОРКЕР];
const РАЗБОР = 'https://www.prydwen.gg/arknights-endfield/characters/';
const ЕФТ = 'https://endfieldtools.dev';
const LS_UID = 'ef-uid';
const LS_PROF = 'ef-prof';

const $ = id => document.getElementById(id);
const эк = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Текст из игры: экранируем, потом маркеры ⟦…⟧ превращаем в подсветку.
const богат = s => эк(s).replace(/⟦/g, '<b>').replace(/⟧/g, '</b>');
const чис = (n, зн) => {
  if (n == null || n === '' || isNaN(n)) return '—';
  const v = +n;
  return v.toLocaleString('ru', { maximumFractionDigits: зн == null ? 1 : зн });
};
const проц = v => (v == null ? '—' : (Math.round(v * 1000) / 10).toLocaleString('ru') + '%');
function взять(к, запас) {
  try { const v = localStorage.getItem(к); return v == null ? запас : JSON.parse(v); }
  catch (e) { return запас; }
}
function положить(к, v) {
  try { localStorage.setItem(к, JSON.stringify(v)); } catch (e) {}
  if (EF.облакоСкоро) EF.облакоСкоро();
}

const EF = window.EF = {
  APP_VER, ВОРКЕР, API, ЕФТ, $, эк, богат, чис, проц, взять, положить,
  БАЗА: null, ПРОФ: null, разделы: {}, после: null,
};

// ── загрузка данных ─────────────────────────────────────────────────────────
const кэш = {};
EF.грузить = function (файл) {
  if (!кэш[файл]) {
    кэш[файл] = fetch('data/' + файл + '?v=' + APP_VER, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(файл + ': ' + r.status); return r.json(); })
      .catch(e => { delete кэш[файл]; throw e; });
  }
  return кэш[файл];
};
EF.подробно = id => EF.грузить('ch/' + id + '.json');

// ── справочные помощники ────────────────────────────────────────────────────
EF.оп = id => (EF.БАЗА.персонажи.find(c => c.id === id) || null);
EF.ствол = id => (EF.БАЗА.оружие.find(w => w.id === id) || null);
EF.пр = id => (EF.БАЗА.предметы[id] || { н: id, р: 1, з: '' });
EF.мой = id => (EF.ПРОФ && EF.ПРОФ.оп[id]) || null;

// Предмет «фишкой»: значок с полоской редкости и количеством.
EF.фишка = function (id, кол, мал) {
  const п = EF.пр(id);
  return '<span class="chipi r' + (п.р || 1) + (мал ? ' sm' : '') + '" title="' + эк(п.н) +
    (кол != null ? ' ×' + чис(кол, 0) : '') + '">' +
    (п.з ? '<img src="' + эк(п.з) + '" alt="" loading="lazy" data-nf="hide">' : '') +
    (кол != null ? '<span class="q">' + сокр(кол) + '</span>' : '') + '</span>';
};
function сокр(n) {
  n = +n;
  if (n >= 1e6) return (Math.round(n / 1e5) / 10) + 'M';
  if (n >= 1e4) return Math.round(n / 1000) + 'K';
  return String(n);
}
EF.сокр = сокр;
// Список материалов строками: значок + имя + количество.
EF.материалы = function (список, есть) {
  if (!список || !список.length) return '<div class="hint">ничего не нужно</div>';
  return '<div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">' +
    список.map(([id, кол]) => {
      const п = EF.пр(id);
      const у = есть ? (+есть[id] || 0) : null;
      const нехв = у != null ? Math.max(0, кол - у) : 0;
      return '<div class="it">' + EF.фишка(id, null, true) +
        '<span><b class="r' + п.р + ' rt">' + эк(п.н) + '</b>' +
        (у != null ? '<i>есть ' + чис(у, 0) + (нехв ? ' · <span class="warn">не хватает ' + чис(нехв, 0) + '</span>'
                                                   : ' · <span class="ok">хватает</span>') + '</i>' : '') +
        '</span><span class="rt2">' + чис(кол, 0) + '</span></div>';
    }).join('') + '</div>';
};
EF.звёзды = n => '<span class="stars">' + '★'.repeat(n || 0) + '</span>';

// Шапка раздела в стиле endfieldtools: метка «// РАЗДЕЛ», заголовок, счётчик.
EF.шапка = function (метка, заголовок, число, подпись, кнопки) {
  $('head').innerHTML = '<div class="hd"><div class="ttl"><span class="eyebrow">// ' + эк(метка) + '</span>' +
    '<h1>' + эк(заголовок) + '</h1></div>' +
    (кнопки ? '<div class="acts">' + кнопки + '</div>' : '') +
    (число != null ? '<div class="cnt"><b id="hdcnt">' + эк(число) + '</b><i>' + эк(подпись || '') + '</i></div>' : '') +
    '</div>';
};
EF.блок = (имя, справа) => '<div class="sh"><b>' + эк(имя) + '</b><i></i>' +
  (справа ? '<em>' + справа + '</em>' : '') + '</div>';
EF.подвал = t => { $('src').innerHTML = t || ''; };

// Панель поверх страницы.
EF.открыть = function (html) {
  $('sheet-in').innerHTML = '<button class="x" data-close="1">✕ закрыть</button>' + html;
  $('sheet').classList.add('on');
  $('sheet').scrollTop = 0;
};
EF.закрыть = function () {
  $('sheet').classList.remove('on');
  ОТКРЫТ = null;
  if (EF.приЗакрытии) { const f = EF.приЗакрытии; EF.приЗакрытии = null; f(); }
};

// ── разделы ─────────────────────────────────────────────────────────────────
// С v6 навигация по общему стандарту сайта (как NTE и ZZZ): основные разделы —
// вкладками в шапке, остальное — в выпадающем меню «☰ Инструменты» справа.
// Пункт меню — крупное название прописными и пояснение строкой ниже.
const ВКЛАДКИ = ['ops', 'tier', 'team', 'wpn', 'gear', 'map', 'fac'];
const ВМЕНЮ = [
  ['plan', 'Сколько фармить до цели'],
  ['daily', 'Ежедневные и еженедельные'],
  ['ach', 'Прогресс по достижениям'],
  ['gacha', 'Гарант, история, симулятор'],
  ['prof', 'Витрина аккаунта по UID'],
  ['chr', 'Боевая хроника skport'],
];
const ИНСТРПОД = {
  cloud: 'Синхронизация между устройствами',
  backup: 'Скачать и восстановить отметки',
  fresh: 'Когда собрана база',
  src: 'Откуда взяты данные',
};
EF.раздел = function (id, опц) { EF.разделы[id] = опц; };
let ВКЛ = 'ops';

function пунктМеню(атр, имя, под, вкл) {
  return '<button class="tmi' + (вкл ? ' on' : '') + '" ' + атр + '>' + эк(имя) + '<i>' + эк(под) + '</i></button>';
}
function рисоватьМеню() {
  $('nav').innerHTML = ВКЛАДКИ.filter(id => EF.разделы[id]).map(id => {
    const р = EF.разделы[id];
    return '<button class="tab' + (id === ВКЛ ? ' on' : '') + '" data-tab="' + id + '">' + эк(р.имя) +
      (р.новое ? '<em>new</em>' : '') + '</button>';
  }).join('');
  const изМеню = ВМЕНЮ.some(([id]) => id === ВКЛ);
  $('toolsBtn').classList.toggle('on', изМеню);
  $('toolsBtn').innerHTML = '☰ ' + (изМеню ? эк(EF.разделы[ВКЛ].имя) : 'Инструменты');
  $('toolsDrop').innerHTML =
    ВМЕНЮ.filter(([id]) => EF.разделы[id]).map(([id, под]) => пунктМеню('data-tab="' + id + '"', EF.разделы[id].имя, под, id === ВКЛ)).join('') +
    '<hr>' + ИНСТР.map(([k, и]) => пунктМеню('data-tl="' + k + '"', и, ИНСТРПОД[k] || '', false)).join('');
}
function меню(откр) {
  $('toolsBox').classList.toggle('open', откр == null ? !$('toolsBox').classList.contains('open') : откр);
}

EF.перейти = function (id, тихо) {
  if (!EF.разделы[id]) id = 'ops';
  if (EF.уйти) { const f = EF.уйти; EF.уйти = null; try { f(); } catch (e) {} }
  ВКЛ = id;
  if (!тихо && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  меню(false);
  if ($('sheet').classList.contains('on')) EF.закрыть();
  рисовать();
  window.scrollTo(0, 0);
};

function рисовать() {
  рисоватьМеню();
  $('fbar').innerHTML = '';
  $('src').innerHTML = '';
  const р = EF.разделы[ВКЛ];
  try {
    const итог = р.рисовать();
    if (итог && итог.then) итог.catch(e => ошибка(e));
  } catch (e) { ошибка(e); }
}
EF.перерисовать = рисовать;
function ошибка(e) {
  console.error(e);
  $('body').innerHTML = '<div class="box"><b>раздел не нарисовался</b>' + эк(e && e.message || e) + '</div>';
}

// ── старт ───────────────────────────────────────────────────────────────────
async function старт() {
  EF.ПРОФ = взять(LS_PROF, null);
  const х = (location.hash || '').slice(1);
  if (EF.разделы[х]) ВКЛ = х;
  рисоватьМеню();
  версияВоркера();
  try {
    EF.БАЗА = await EF.грузить('ef-db.json');
  } catch (e) {
    $('body').innerHTML = '<div class="empty">база не загрузилась: ' + эк(e.message) + '</div>';
    return;
  }
  рисовать();
  const uid = localStorage.getItem(LS_UID);
  if (uid) синхра(uid, true);
  if (EF.облакоТихо) EF.облакоТихо();
}

async function версияВоркера() {
  try {
    const j = await (await fetch(ВОРКЕР + '/api/ef/ping', { cache: 'no-store' })).json();
    $('ver').innerHTML = APP_VER + ' <b>· воркер ' + эк(j.v) + '</b>';
  } catch (e) { $('ver').innerHTML = APP_VER + ' <b>· воркер не отвечает</b>'; }
}

// Сколько дней базе. Сборщик пишет дату «дд.мм.гггг».
EF.возрастБазы = function () {
  const с = String((EF.БАЗА && EF.БАЗА.собрано) || '').split('.');
  if (с.length !== 3) return null;
  const д = new Date(+с[2], +с[1] - 1, +с[0]);
  return Math.floor((Date.now() - д.getTime()) / 86400000);
};
function свежесть() {
  const д = EF.возрастБазы();
  if (д == null || д <= 14) return '';
  return '<div class="verdict" style="margin-bottom:14px;border-color:rgba(245,158,11,.5)"><b style="color:var(--warn)">данные ' +
    д + ' дн.</b>База собрана ' + эк(EF.БАЗА.собрано) + '. Если вышел патч — свежая выгрузка endfieldtools ' +
    'и <span class="hl">python build-ef-eft.py</span> в папке ef (PowerShell).</div>';
}

// ── профиль enka ────────────────────────────────────────────────────────────
// Строковый id оператора достаём из идентификатора навыка: в этой части
// витрины enka отдаёт числовые шаблоны, а в навыках — имена вида
// chr_0016_laevat_UltimateSkill.
function ктоЭто(ч) {
  const с = ((ч.skillInfo || {}).levelInfo || [])[0];
  const м = с && /^(chr_\d+_[a-z]+)/i.exec(с.skillId || '');
  return м ? м[1] : '';
}
function разобрать(д) {
  const и = д.playerInfo || {}, к = и.businessCard || {}, ст = и.statistic || {};
  const оп = {};
  (и.charList || []).forEach(c => { if (c.templateId) оп[c.templateId] = { ур: c.level, пот: c.potentialLevel || 0 }; });
  (д.charData || []).forEach(ч => {
    const id = ктоЭто(ч);
    if (!id) return;
    оп[id] = Object.assign(оп[id] || {}, {
      ур: ч.level, пот: ч.potentialLevel || 0,
      навыки: ((ч.skillInfo || {}).levelInfo || []).map(н => ({ id: н.skillId, ур: н.skillLevel, макс: н.skillMaxLevel })),
      оружие: ч.weapon || null,
      слоты: (ч.equip || []).map(e => ({ слот: e.key, шаблон: (e.value || {}).templateid,
        прокачки: ((e.value || {}).enhance || []).length })),
      таланты: (ч.talent || {}).attrNodes || [],
      пассивки: (ч.talent || {}).latestPassiveSkillNodes || [],
      завод: (ч.talent || {}).latestFactorySkillNodes || [],
      прорыв: (ч.talent || {}).latestBreakNode || '',
      витрина: true,
    });
  });
  const дост = (к.achievement || {}).display || [];
  return {
    uid: д.uid, имя: к.name || '', ур: к.adventureLevel, мир: к.worldLevel,
    подпись: к.signature || '', домены: ((к.domainDev || {}).domains || []),
    достижения: дост.reduce((s, x) => s + (x.value || 0), 0),
    оп, всего: ст.charNum, оружий: ст.weaponNum, записей: ст.docNum, когда: Date.now(),
  };
}
async function синхра(uid, тихо) {
  try {
    const r = await fetch(ВОРКЕР + '/api/ef/uid/' + uid, { cache: 'no-store' });
    if (!r.ok) throw new Error('ответ ' + r.status);
    EF.ПРОФ = разобрать(await r.json());
    try { localStorage.setItem(LS_PROF, JSON.stringify(EF.ПРОФ)); } catch (e) {}
    localStorage.setItem(LS_UID, uid);
    if (['ops', 'prof', 'team', 'tier'].indexOf(ВКЛ) >= 0) рисовать();
    if (ОТКРЫТ) открытьОп(ОТКРЫТ);
  } catch (e) {
    if (!тихо) alert('Витрина не загрузилась: ' + e.message);
  }
}

// ── операторы ───────────────────────────────────────────────────────────────
const Ф = { стихия: '', класс: '', оружие: '', редкость: 0, тир: '', поиск: '', свои: false, порядок: 'ранг' };
const ТИРКЛ = { 'T0': 't0', 'T0.5': 't05', 'T1': 't1', 'T1.5': 't15', 'T2': 't2' };
const ТИРЫ = ['T0', 'T0.5', 'T1', 'T1.5', 'T2'];
EF.ТИРКЛ = ТИРКЛ;

function кнопкаФ(тип, знач, текст, значок) {
  return '<button class="fb' + (Ф[тип] === знач ? ' on' : '') + '" data-f="' + тип + '" data-v="' + эк(знач) + '">' +
    (значок ? '<img src="' + эк(значок) + '" alt="">' : '') + эк(текст) + '</button>';
}
function фильтрыОператоров() {
  const Б = EF.БАЗА.персонажи;
  const уник = (поле) => [...new Map(Б.map(c => [c[поле], c])).values()];
  return '<div class="fgrp"><i>стихия</i>' + уник('стихия').map(c => кнопкаФ('стихия', c.стихия, c.стихияРу, c.стихияЗн)).join('') + '</div>' +
    '<div class="fgrp"><i>класс</i>' + уник('класс').map(c => кнопкаФ('класс', c.класс, c.классРу, c.классЗн)).join('') + '</div>' +
    '<div class="fgrp"><i>оружие</i>' + уник('оружие').map(c => кнопкаФ('оружие', c.оружие, c.оружиеРу)).join('') + '</div>' +
    '<div class="fgrp"><i>ранг</i>' + [6, 5, 4].map(r => '<button class="fb' + (Ф.редкость === r ? ' on' : '') +
      '" data-f="редкость" data-v="' + r + '"><span class="r' + r + ' rt">★</span>' + r + '</button>').join('') + '</div>' +
    '<div class="fgrp"><i>тир</i>' + ТИРЫ.map(t => кнопкаФ('тир', t, t)).join('') + '</div>' +
    (EF.ПРОФ ? '<button class="fb' + (Ф.свои ? ' on' : '') + '" data-f="свои" data-v="1">только мои</button>' : '') +
    '<select class="srch" id="sort" style="min-width:0"><option value="ранг">по рангу</option><option value="тир"' +
      (Ф.порядок === 'тир' ? ' selected' : '') + '>по тиру</option><option value="имя"' +
      (Ф.порядок === 'имя' ? ' selected' : '') + '>по имени</option></select>' +
    '<input class="srch" id="q" placeholder="поиск по имени" value="' + эк(Ф.поиск) + '">';
}
function отбор() {
  const q = Ф.поиск.trim().toLowerCase();
  const сп = EF.БАЗА.персонажи.filter(c =>
    (!Ф.стихия || c.стихия === Ф.стихия) && (!Ф.класс || c.класс === Ф.класс) &&
    (!Ф.оружие || c.оружие === Ф.оружие) && (!Ф.редкость || c.редкость === Ф.редкость) &&
    (!Ф.тир || c.тир === Ф.тир) && (!Ф.свои || EF.мой(c.id)) &&
    (!q || (c.имя + ' ' + c.имяРу).toLowerCase().includes(q)));
  const т = c => { const i = ТИРЫ.indexOf(c.тир); return i < 0 ? 9 : i; };
  if (Ф.порядок === 'тир') сп.sort((a, b) => т(a) - т(b) || b.редкость - a.редкость);
  else if (Ф.порядок === 'имя') сп.sort((a, b) => a.имяРу.localeCompare(b.имяРу, 'ru'));
  else сп.sort((a, b) => b.редкость - a.редкость || т(a) - т(b) || a.имяРу.localeCompare(b.имяРу, 'ru'));
  return сп;
}
EF.плитка = function (c) {
  const м = EF.мой(c.id);
  return '<button class="tile r' + c.редкость + '" data-op="' + эк(c.id) + '">' +
    (c.карта || c.арт ? '<img class="a" src="' + эк(c.карта || c.арт) + '" alt="" loading="lazy" data-nf="hide">' : '') +
    '<span class="sh2"></span><span class="rb"></span>' +
    '<span class="top">' + (c.стихияЗн ? '<img src="' + эк(c.стихияЗн) + '" alt="" title="' + эк(c.стихияРу) + '">' : '') +
      (c.классЗн ? '<img src="' + эк(c.классЗн) + '" alt="" title="' + эк(c.классРу) + '">' : '') +
      (c.тир ? '<span class="tr ' + (ТИРКЛ[c.тир] || '') + '">' + эк(c.тир) + '</span>' : '') + '</span>' +
    (м ? '<span class="me">' + эк(м.ур) + (м.пот ? ' · P' + эк(м.пот) : '') + '</span>' : '') +
    '<span class="info"><span class="nm">' + эк(c.имяРу) + '</span>' +
      '<span class="sub">' + EF.звёзды(c.редкость) + ' ' + эк(c.классРу) + ' · ' + эк(c.оружиеРу) + '</span></span></button>';
};
function витрина() {
  const люди = отбор();
  const c = $('hdcnt'); if (c) c.textContent = люди.length;
  if (!люди.length) return '<div class="empty">никто не подошёл под фильтры</div>';
  return свежесть() + '<div class="ops">' + люди.map(EF.плитка).join('') + '</div>';
}
EF.раздел('ops', {
  имя: 'Операторы', буква: '◆',
  рисовать() {
    EF.шапка('operator.database', 'Операторы', EF.БАЗА.персонажи.length, 'в индексе');
    $('fbar').innerHTML = фильтрыОператоров();
    $('body').innerHTML = витрина();
    EF.подвал('Данные: открытая база <a class="lnk" href="' + ЕФТ + '" target="_blank" rel="noopener">endfieldtools.dev</a> ' +
      '(с разрешения автора), тиры и составы — разборы prydwen.gg. База собрана ' + эк(EF.БАЗА.собрано) + '.');
  },
});

// ── тир-лист ────────────────────────────────────────────────────────────────
EF.раздел('tier', {
  имя: 'Тир-лист', буква: 'T',
  рисовать() {
    const есть = ТИРЫ.filter(t => EF.БАЗА.персонажи.some(c => c.тир === t));
    EF.шапка('tier.list', 'Тир-лист', есть.length, 'уровней');
    $('body').innerHTML = '<div class="tiergrid">' + есть.map(t => {
      const кто = EF.БАЗА.персонажи.filter(c => c.тир === t)
        .sort((a, b) => b.редкость - a.редкость || a.имяРу.localeCompare(b.имяРу, 'ru'));
      return '<div class="tierrow"><div class="tierlab ' + (ТИРКЛ[t] || '') + '">' + эк(t) + '</div>' +
        '<div class="ops">' + кто.map(EF.плитка).join('') + '</div></div>';
    }).join('') + '</div>';
    EF.подвал('Оценка prydwen.gg, режим Umbral Monument. T0 — сильнейшие; пустые уровни не показываются.');
  },
});

// ── команды ─────────────────────────────────────────────────────────────────
function найтиИмя(и) {
  и = String(и || '').trim();
  return EF.БАЗА.персонажи.find(x => x.имя === и || x.имяРу === и) || null;
}
function доляМоих(строка) {
  if (!EF.ПРОФ) return 0;
  const имена = строка.split(',').map(s => s.trim());
  return имена.filter(и => { const c = найтиИмя(и); return c && EF.мой(c.id); }).length / (имена.length || 1);
}
EF.команда = function (строка) {
  return '<div class="team">' + строка.split(',').map(и => {
    const c = найтиИмя(и);
    return '<span class="mem' + (c && EF.мой(c.id) ? ' me' : '') + '"' + (c ? ' data-op="' + эк(c.id) + '"' : '') + '>' +
      (c && c.значок ? '<img src="' + эк(c.значок) + '" alt="" loading="lazy">' : '<img alt="">') +
      '<span class="who">' + эк(c ? c.имяРу : и) + '</span></span>';
  }).join('') + '</div>';
};
EF.раздел('team', {
  имя: 'Команды', буква: '⊞',
  рисовать() {
    const видел = new Set(), все = [];
    EF.БАЗА.персонажи.forEach(c => (c.команды || []).forEach(k => {
      const ключ = k.split(',').map(s => s.trim()).sort().join('|');
      if (!видел.has(ключ)) { видел.add(ключ); все.push(k); }
    }));
    const мои = все.filter(k => доляМоих(k) === 1);
    const почти = все.filter(k => доляМоих(k) >= 0.75 && доляМоих(k) < 1);
    const прочие = все.filter(k => доляМоих(k) < 0.75);
    EF.шапка('team.builder', 'Команды', все.length, 'составов');
    const блок = (сп, имя, п) => !сп.length ? '' : EF.блок(имя, п) + '<div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">' + сп.map(EF.команда).join('') + '</div>';
    $('body').innerHTML = (EF.ПРОФ ? '' : '<div class="hint" style="margin:0 0 10px">Подключи профиль — составы разойдутся на «собираются» и «не хватает».</div>') +
      блок(мои, 'Собираются полностью', мои.length + ' из ' + все.length) +
      блок(почти, 'Не хватает одного', почти.length + '') +
      блок(прочие, EF.ПРОФ ? 'Остальные' : 'Все составы', прочие.length + '');
    EF.подвал('Составы — из разборов prydwen.gg. Зелёная рамка — оператор есть в витрине профиля.');
  },
});

// ── карточка оператора ──────────────────────────────────────────────────────
let ОТКРЫТ = null;
let ВКЛК = 'обзор';
let УР = 90;         // уровень для характеристик в карточке
let УРН = 12;        // уровень навыков
const ВКЛКАРТЫ = [['обзор', 'Обзор'], ['навыки', 'Навыки'], ['таланты', 'Таланты'], ['сборка', 'Сборка'],
  ['команды', 'Команды'], ['прокачка', 'Прокачка'], ['досье', 'Досье'], ['моё', 'Моё']];

async function открытьОп(id) {
  const c = EF.оп(id);
  if (!c) return;
  ОТКРЫТ = id;
  const м = EF.мой(id);
  if (м && ВКЛК === 'обзор') УР = м.ур || 90;
  let д = null;
  try { д = await EF.подробно(id); } catch (e) { д = null; }
  if (ОТКРЫТ !== id) return;
  EF.открыть(
    '<div class="card r' + c.редкость + '" style="--el:#' + эк(c.цвет) + '">' +
      '<div class="card-l">' +
        '<div class="art">' + (c.арт ? '<img src="' + эк(c.арт) + '" alt="" data-nf="hide">' : '') + '<span class="rb"></span></div>' +
        '<div class="cname">' + эк(c.имяРу) + '<small>' + эк(c.имя) + ' · ' + эк(c.отдел || '') + '</small></div>' +
        '<div class="pills">' +
          '<span class="pill el">' + (c.стихияЗн ? '<img src="' + эк(c.стихияЗн) + '" alt="">' : '') + эк(c.стихияРу) + '</span>' +
          '<span class="pill">' + (c.классЗн ? '<img src="' + эк(c.классЗн) + '" alt="">' : '') + эк(c.классРу) + '</span>' +
          '<span class="pill">' + эк(c.оружиеРу) + '</span>' +
          '<span class="pill">' + EF.звёзды(c.редкость) + '</span>' +
          (c.тир ? '<span class="pill ' + (ТИРКЛ[c.тир] || '') + '">' + эк(c.тир) + '</span>' : '') +
          (м ? '<span class="pill ok">у меня: ур. ' + эк(м.ур) + (м.пот ? ', P' + эк(м.пот) : '') + '</span>' : '') +
        '</div>' +
        '<p class="hint">' + (c.слагПр ? '<a class="lnk" href="' + эк(РАЗБОР + c.слагПр) + '" target="_blank" rel="noopener">разбор на prydwen' +
          (c.разборОт ? ' · ' + эк(c.разборОт) : '') + '</a> · ' : '') +
          (c.слаг ? '<a class="lnk" href="' + эк(ЕФТ + '/characters/' + c.слаг + '/') + '" target="_blank" rel="noopener">на endfieldtools</a>' : '') + '</p>' +
      '</div>' +
      '<div style="min-width:0">' +
        '<div class="seg ctabs">' + ВКЛКАРТЫ.map(([k, и]) => '<button class="' + (k === ВКЛК ? 'on' : '') + '" data-ct="' + k + '">' + эк(и) + '</button>').join('') + '</div>' +
        '<div id="cbody">' + нутро(c, д, м) + '</div>' +
      '</div>' +
    '</div>');
}
EF.открытьОп = (id, вкладка) => { ВКЛК = вкладка || 'обзор'; открытьОп(id); };

function нутро(c, д, м) {
  if (!д && ВКЛК !== 'сборка' && ВКЛК !== 'команды' && ВКЛК !== 'моё') {
    return '<div class="box"><b>нет подробностей</b>Файл data/ch/' + эк(c.id) + '.json не загрузился — перезапусти сборщик.</div>';
  }
  switch (ВКЛК) {
    case 'навыки': return вклНавыки(c, д, м);
    case 'таланты': return вклТаланты(c, д);
    case 'сборка': return вклСборка(c);
    case 'команды': return вклКоманды(c);
    case 'прокачка': return вклПрокачка(c, д);
    case 'досье': return вклДосье(c, д);
    case 'моё': return вклМоё(c, д, м);
    default: return вклОбзор(c, д, м);
  }
}

function статыНа(д, ур) {
  const с = д.статы || {};
  if (с[ур]) return с[ур];
  const ключи = Object.keys(с).map(Number).sort((a, b) => a - b);
  let лучш = ключи[0];
  ключи.forEach(k => { if (k <= ур) лучш = k; });
  return с[лучш] || {};
}
function вклОбзор(c, д, м) {
  const s = статыНа(д, УР);
  const оруж1 = (c.лучшееОружие || [])[0];
  const наб1 = (c.лучшиеНаборы || [])[0];
  let h = '';
  if (оруж1 || наб1 || c.тир) {
    h += '<div class="verdict brk" style="margin-bottom:16px"><b>коротко</b>' +
      (c.тир ? 'Оценка <span class="g">' + эк(c.тир) + '</span>. ' : '') +
      (оруж1 ? 'Лучшее оружие — <span class="g">' + эк(имяОружия(оруж1.split('|')[0])) + '</span> (' + эк(оруж1.split('|')[1] || 'P0') + '). ' : '') +
      (наб1 ? 'Набор — <span class="g">' + эк(имяНабора(наб1)) + '</span>. ' : '') +
      (м ? 'У тебя ур. <span class="g">' + эк(м.ур) + '</span>' + (м.пот ? ', потенциал ' + эк(м.пот) : '') + '.' : '') + '</div>';
  }
  h += '<div class="cols">';
  h += '<div class="sec full"><h4>характеристики на ур. <span class="hl" id="urv">' + УР + '</span>' +
    '<em>основной — ' + эк(EF.БАЗА.справочники.атрибуты[c.осн] || '') + ', второй — ' + эк(EF.БАЗА.справочники.атрибуты[c.доп] || '') + '</em></h4>' +
    '<input type="range" min="1" max="90" value="' + УР + '" id="urr" style="width:100%;accent-color:var(--acid);margin:0 0 10px">' +
    '<div class="stats" id="urs">' + плиткиСтатов(s, c) + '</div></div>';
  h += '<div class="sec"><h4>навыки</h4>' + (д.навыки || []).map(н =>
    '<div class="it">' + (н.значок ? '<img src="' + эк(н.значок) + '" alt="" style="width:34px;height:34px;object-fit:contain">' : '') +
    '<span><b>' + эк(н.имя) + '</b><i>' + эк(н.типРу) + '</i></span></div>').join('<div style="height:6px"></div>') + '</div>';
  const ор = (c.лучшееОружие || []).slice(0, 4);
  if (ор.length) {
    h += '<div class="sec"><h4>оружие по приоритету<em>prydwen</em></h4>' + ор.map((o, i) => строкаОружия(o, i)).join('<div style="height:6px"></div>') + '</div>';
  }
  const к = (c.команды || []).slice(0, 2);
  if (к.length) h += '<div class="sec full"><h4>с кем играть</h4><div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">' + к.map(EF.команда).join('') + '</div></div>';
  return h + '</div>';
}
function плиткиСтатов(s, c) {
  return [['hp', 'ОЗ'], ['atk', 'АТК'], ['def', 'Защита'], ['str', 'Сила'], ['agi', 'Ловкость'], ['wisd', 'Интеллект'], ['will', 'Воля'], ['cr', 'Крит. шанс']]
    .filter(([k]) => s[k] != null)
    .map(([k, и]) => '<div class="st' + (k === c.осн ? ' ok' : '') + '"><u>' + и + (k === c.осн ? ' · осн.' : k === c.доп ? ' · втор.' : '') + '</u><b>' +
      (k === 'cr' ? проц(s[k]) : чис(s[k], 0)) + '</b></div>').join('');
}
function имяОружия(en) {
  const w = EF.БАЗА.оружие.find(x => x.имя === en);
  return w ? (w.имяРу || w.имя) : en;
}
function простоИмя(s) { return String(s || '').toLowerCase().replace(/æ/g, 'ae').replace(/[^a-zа-яё0-9]+/g, ''); }
function найтиНабор(имя) {
  const п = простоИмя(имя);
  return EF.БАЗА.наборы.find(n => простоИмя(n.имя) === п || простоИмя(n.имяРу) === п) ||
    EF.БАЗА.наборы.find(n => п.length > 3 && простоИмя(n.имя).startsWith(п)) || null;
}
EF.найтиНабор = найтиНабор;
function имяНабора(en) { const n = найтиНабор(en); return n ? n.имяРу : en; }
function строкаОружия(o, i) {
  const [имя, p] = o.split('|');
  const w = EF.БАЗА.оружие.find(x => x.имя === имя);
  return '<div class="it' + (w ? ' go" data-wpn="' + эк(w.id) : '') + '">' +
    '<span class="tag' + (i ? ' gh' : '') + '">' + (i + 1) + '</span>' +
    (w ? EF.фишка(w.id, null, true) : '') +
    '<span><b class="r' + (w ? w.редкость : 1) + ' rt">' + эк(w ? (w.имяРу || w.имя) : имя) + '</b>' +
    '<i>' + (w ? эк(w.типРу) + ' · ' + w.редкость + '★' : '') + '</i></span><span class="rt2">' + эк(p || '') + '</span></div>';
}

function вклНавыки(c, д, м) {
  const мои = (м && м.навыки) || [];
  let h = '<div class="fld"><span class="eyebrow">уровень навыков</span>' +
    '<input type="range" min="1" max="12" value="' + УРН + '" id="urn" style="flex:1;accent-color:var(--acid)">' +
    '<b class="hl" id="urnv" style="font:800 16px var(--head);min-width:30px">' + УРН + '</b></div>' +
    '<div class="hint" style="margin:0 0 12px">1–9 — обычные уровни, 10–12 — специализация. Описание — на максимальном уровне.</div>';
  h += '<div class="cols">' + (д.навыки || []).map(н => {
    const мой = мои.find(x => x.id && x.id.indexOf(н.id.split('_').pop()) >= 0);
    const ур = Math.min(УРН, н.уровней || 12);
    return '<div class="skill">' + (н.значок ? '<img src="' + эк(н.значок) + '" alt="">' : '<span></span>') +
      '<div><h5><small>' + эк(н.типРу) + (н.стоимость ? ' · ' + н.стоимость + ' энергии' : '') + '</small>' + эк(н.имя) + '</h5>' +
      (мой ? '<span class="tag ok" style="margin-top:6px">у тебя ' + мой.ур + ' / ' + мой.макс + '</span>' : '') +
      '<p>' + богат(н.описание) + '</p></div>' +
      (н.строки && н.строки.length ? '<div class="tblw"><table class="tbl">' +
        н.строки.map(r => '<tr><td>' + эк(r[0]) + '</td><td class="n">' + эк(r[ур] || r[r.length - 1] || '') + '</td>' +
          '<td class="n" style="color:var(--tx3)">' + (ур < 12 && r[12] ? 'макс ' + эк(r[12]) : '') + '</td></tr>').join('') +
        '</table></div>' : '') +
      '</div>';
  }).join('') + '</div>';
  return h;
}

function вклТаланты(c, д) {
  let h = '<div class="cols">';
  const ветки = {};
  (д.пассивки || []).forEach(п => (ветки[п.ветка] = ветки[п.ветка] || []).push(п));
  h += '<div class="sec"><h4>пассивные таланты</h4>' + Object.values(ветки).map(в => в.map(п =>
    '<div class="node">' + (п.значок ? '<img src="' + эк(п.значок) + '" alt="">' : '') +
    '<div style="flex:1;min-width:0"><b>' + эк(п.имя) + '</b><p>' + богат(п.описание) + '</p></div>' +
    '<span class="lvl">' + ['', 'I', 'II', 'III'][п.ур] + ' · пр. ' + п.этап + '</span></div>').join('')).join('') + '</div>';
  h += '<div class="sec"><h4>потенциалы<em>дубли P1–P5</em></h4>' + (д.потенциалы || []).map(п =>
    '<div class="node"><div style="flex:1;min-width:0"><b>' + эк(п.имя) + '</b><p>' + богат(п.описание) + '</p></div>' +
    '<span class="lvl">P' + п.ур + '</span></div>').join('') + '</div>';
  const атр = д.атрибуты || [];
  if (атр.length) {
    h += '<div class="sec"><h4>узлы характеристик</h4><table class="tbl"><tr><th>узел</th><th>прорыв</th><th>доверие</th><th class="n">прибавка</th></tr>' +
      атр.map(а => '<tr><td>' + эк(а.имя) + '</td><td>' + а.этап + '</td><td>' + (а.доверие || '—') + '</td><td class="n">+' + чис(а.знач) + ' ' + эк(а.атрРу) + '</td></tr>').join('') +
      '</table><p class="hint">Сумма: +' + чис(атр.reduce((s, а) => s + (а.знач || 0), 0)) + ' ' + эк(атр[0].атрРу) + '.</p></div>';
  }
  if ((д.завод || []).length) {
    h += '<div class="sec"><h4>навыки на базе</h4>' + д.завод.map(ф =>
      '<div class="node"><div style="flex:1;min-width:0"><b>' + эк(ф.имя) + ' ' + эк(ф.суфф) + '</b><p>' + богат(ф.описание) + '</p></div>' +
      '<span class="lvl">ур. ' + ф.ур + '</span></div>').join('') + '</div>';
  }
  return h + '</div>';
}

function вклСборка(c) {
  let h = '<div class="cols">';
  const ор = c.лучшееОружие || [];
  h += '<div class="sec"><h4>оружие по приоритету<em>prydwen</em></h4>' +
    (ор.length ? ор.map((o, i) => строкаОружия(o, i)).join('<div style="height:6px"></div>') : '<div class="box">разбора нет</div>') +
    '<p class="hint">P0 — без дублей, P5 — с пятью. Клик — карточка оружия.</p></div>';
  const наб = c.лучшиеНаборы || [];
  h += '<div class="sec"><h4>наборы снаряжения</h4>' + (наб.length ? наб.map((n, i) => {
    const наш = найтиНабор(n);
    return '<div class="it' + (наш ? ' go" data-set="' + эк(наш.id) : '') + '"><span class="tag' + (i ? ' gh' : '') + '">' + (i + 1) + '</span>' +
      (наш && наш.значок ? '<img src="' + эк(наш.значок) + '" alt="" style="width:36px;height:36px;object-fit:contain">' : '') +
      '<span><b>' + эк(наш ? наш.имяРу : n) + '</b><i>' + (наш ? эк(наш.имя) + ' · T' + наш.ранг : '') + '</i></span></div>';
  }).join('<div style="height:6px"></div>') : '<div class="box"><b>нет рекомендаций</b>У этого оператора на prydwen нет разобранной сборки.</div>') + '</div>';
  const наши = наб.map(найтиНабор).filter(Boolean);
  if (наши.length) {
    h += '<div class="sec full"><h4>что дают эти наборы</h4><div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">' +
      наши.map(n => '<div class="box"><b>' + эк(n.имяРу) + '</b><div class="rich" style="font-size:13px;line-height:1.55;white-space:pre-line">' +
        (n.эффекты || []).map(э => богат(э.текст)).join('\n\n') + '</div></div>').join('') + '</div></div>';
  }
  return h + '</div>';
}
function вклКоманды(c) {
  const к = c.команды || [];
  if (!к.length) return '<div class="box">составов для этого оператора нет</div>';
  return '<div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">' + к.map(EF.команда).join('') + '</div>' +
    '<p class="hint">Зелёная рамка — оператор есть у тебя.</p>';
}
function сложить(куда, список, раз) {
  (список || []).forEach(([id, n]) => { куда[id] = (куда[id] || 0) + n * (раз || 1); });
  return куда;
}
EF.сложить = сложить;
EF.вСписок = о => Object.entries(о).sort((a, b) => (a[0] === 'item_gold') - (b[0] === 'item_gold') || b[1] - a[1]);
function вклПрокачка(c, д) {
  const пр = (д.прорывы || []).filter(x => x.тип === 'ур');
  const сн = (д.прорывы || []).filter(x => x.тип !== 'ур');
  const все = {};
  пр.concat(сн).forEach(x => сложить(все, x.цена));
  const навыки = {};
  Object.values(д.цены || {}).forEach(v => v.forEach(x => { сложить(навыки, x.п); навыки.item_gold = (навыки.item_gold || 0) + x.з; }));
  const тал = {};
  (д.пассивки || []).concat(д.атрибуты || []).concat(д.заводУзлы || []).forEach(x => сложить(тал, x.цена));
  let h = '<div class="verdict" style="margin-bottom:16px"><b>всё до максимума</b>' +
    'Посчитать под себя — с текущими уровнями и складом — можно в <a class="lnk" href="#plan" data-plan="' + эк(c.id) + '">планировщике</a>.</div>';
  h += '<div class="cols">';
  h += '<div class="sec full"><h4>повышения (прорывы)</h4><div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">' +
    пр.map(x => '<div class="box"><b>' + эк(x.имя) + '</b><div class="hint" style="margin:0 0 8px">' + эк(x.описание) + '</div>' +
      '<div class="mats">' + x.цена.map(([id, n]) => EF.фишка(id, n)).join('') + '</div></div>').join('') + '</div></div>';
  h += '<div class="sec"><h4>доступ к снаряжению</h4>' + сн.map(x => '<div class="it"><span><b>' + эк(x.имя) + '</b><i>' + эк(x.описание) + '</i></span>' +
    '<span class="mats">' + x.цена.map(([id, n]) => EF.фишка(id, n, true)).join('') + '</span></div>').join('<div style="height:6px"></div>') + '</div>';
  h += '<div class="sec"><h4>все навыки 1 → 12</h4>' + EF.материалы(EF.вСписок(навыки)) + '</div>';
  h += '<div class="sec"><h4>все таланты и узлы</h4>' + EF.материалы(EF.вСписок(тал)) + '</div>';
  h += '<div class="sec"><h4>повышения + снаряжение</h4>' + EF.материалы(EF.вСписок(все)) + '</div>';
  return h + '</div>';
}
function вклДосье(c, д) {
  const г = д.голос || {};
  let h = '<div class="cols">';
  h += '<div class="sec"><h4>голос</h4><div class="kv">' +
    (г.jp ? '<span>Японский</span><b>' + эк(г.jp) + '</b>' : '') + (г.en ? '<span>Английский</span><b>' + эк(г.en) + '</b>' : '') +
    (г.cn ? '<span>Китайский</span><b>' + эк(г.cn) + '</b>' : '') + (г.kr ? '<span>Корейский</span><b>' + эк(г.kr) + '</b>' : '') + '</div></div>';
  if ((д.подарки || []).length) {
    h += '<div class="sec"><h4>любимые подарки</h4><div class="mats">' + д.подарки.map(x => EF.фишка(x.id, null)).join('') + '</div>' +
      '<p class="hint">' + д.подарки.map(x => эк(EF.пр(x.id).н)).join(', ') + '</p></div>';
  }
  h += '<div class="sec full"><h4>личное дело</h4>' + (д.досье || []).map(r =>
    '<details class="dd" style="margin-bottom:8px"><summary><span class="nm2"><b>' + эк(r.заг) + '</b></span></summary>' +
    '<div class="dd-in lore">' + богат(r.т) + '</div></details>').join('') + '</div>';
  return h + '</div>';
}
function вклМоё(c, д, м) {
  if (!EF.ПРОФ) return '<div class="box"><b>профиль не подключён</b>Раздел «Профиль» — введи UID, и сюда подтянутся уровни, навыки и снаряжение.</div>';
  if (!м) return '<div class="box"><b>нет в профиле</b>Витрина игры отдаёт подробности только по выставленным в профиле операторам.</div>';
  let h = '<div class="stats" style="margin-bottom:16px">' +
    '<div class="st ok"><u>уровень</u><b>' + эк(м.ур) + '<small> / 90</small></b></div>' +
    '<div class="st"><u>потенциал</u><b>' + эк(м.пот || 0) + '</b></div>' +
    (м.оружие ? '<div class="st"><u>оружие ур.</u><b>' + эк(м.оружие.weaponLv) + '</b></div><div class="st"><u>прорыв оружия</u><b>' + эк(м.оружие.breakthroughLv || 0) + '</b></div>' : '') +
    (м.навыки ? '<div class="st"><u>навыков на максимуме</u><b>' + м.навыки.filter(н => н.ур >= н.макс).length + '<small> / ' + м.навыки.length + '</small></b></div>' : '') +
    (м.слоты ? '<div class="st"><u>слотов надето</u><b>' + м.слоты.length + '<small> / 4</small></b></div>' : '') + '</div>';
  if (м.навыки && м.навыки.length && д) {
    h += '<div class="sec"><h4>уровни навыков</h4><table class="tbl">' + м.навыки.map(н => {
      const наш = (д.навыки || []).find(x => н.id && x.id && н.id.indexOf(x.id.replace(/^chr_\d+_[a-z]+_/i, '')) >= 0);
      return '<tr' + (н.ур >= н.макс ? ' class="top"' : '') + '><td>' + эк(наш ? наш.имя : н.id) + '</td><td class="n">' + н.ур + ' / ' + н.макс + '</td></tr>';
    }).join('') + '</table></div>';
  }
  h += '<p class="hint">Оружие и снаряжение витрина enka отдаёт номерами шаблонов — таблицы с этими номерами в открытых данных нет.</p>';
  return h;
}

// ── оружие ──────────────────────────────────────────────────────────────────
const ФО = { редкость: 0, тип: '', поиск: '' };
function кому(w) {
  return EF.БАЗА.персонажи.filter(c => (c.лучшееОружие || []).some(o => o.split('|')[0] === w.имя));
}
function карточкаОружия(w) {
  const к = кому(w);
  const тч = Object.entries(w.атк || {});
  const прорыв = {};
  (w.прорыв || []).forEach(x => { сложить(прорыв, x.п); прорыв.item_gold = (прорыв.item_gold || 0) + x.з; });
  return '<div class="cols">' +
    '<div class="sec"><h4>базовая АТК по уровням</h4><table class="tbl"><tr>' + тч.map(([у]) => '<th class="n">' + у + '</th>').join('') + '</tr><tr>' +
      тч.map(([, v]) => '<td class="n">' + v + '</td>').join('') + '</tr></table></div>' +
    '<div class="sec"><h4>характеристики<em>на макс. ранге</em></h4><div class="kv">' + (w.статы || []).map(s => '<span>' + эк(s.имя) + '</span><b>' +
      (s.проц ? проц(s.знач) : '+' + чис(s.знач)) + '</b>').join('') + '</div></div>' +
    (w.пассивка ? '<div class="sec full"><h4>' + эк(w.пассивка.имя) + '<em>ранг 1 → ' + w.пассивка.рангов + '</em></h4>' +
      '<div class="cols"><div class="box"><b>ранг 1</b><div class="rich" style="font-size:13px;line-height:1.55;white-space:pre-line">' + богат(w.пассивка.на1) + '</div></div>' +
      '<div class="box"><b>ранг ' + w.пассивка.рангов + '</b><div class="rich" style="font-size:13px;line-height:1.55;white-space:pre-line">' + богат(w.пассивка.наМакс) + '</div></div></div></div>' : '') +
    (w.прорыв && w.прорыв.length ? '<div class="sec"><h4>прорывы до 90</h4><div class="mats">' + EF.вСписок(прорыв).map(([id, n]) => EF.фишка(id, n)).join('') + '</div></div>' : '') +
    (к.length ? '<div class="sec"><h4>кому советуют<em>prydwen</em></h4><div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">' + к.map(c =>
      '<div class="it go" data-op="' + эк(c.id) + '"><img src="' + эк(c.значок) + '" alt="" style="width:36px;height:36px;border-radius:8px"><span><b>' + эк(c.имяРу) + '</b><i>' +
      эк(c.классРу) + '</i></span></div>').join('') + '</div></div>' : '') +
    '</div>';
}
EF.открытьОружие = function (id) {
  const w = EF.ствол(id);
  if (!w) return;
  EF.открыть('<div class="hd" style="margin-top:0"><div style="display:flex;gap:14px;align-items:center">' + EF.фишка(w.id) +
    '<div class="ttl"><span class="eyebrow">// ' + эк(w.типРу) + ' · ' + w.редкость + '★</span><h1 class="r' + w.редкость + ' rt">' + эк(w.имяРу || w.имя) + '</h1></div></div></div>' +
    карточкаОружия(w) +
    (w.слаг ? '<p class="hint"><a class="lnk" href="' + эк(ЕФТ + '/weapons/' + w.слаг + '/') + '" target="_blank" rel="noopener">на endfieldtools</a></p>' : ''));
};
EF.раздел('wpn', {
  имя: 'Оружие', буква: '⚔',
  рисовать() {
    const Б = EF.БАЗА.оружие;
    const типы = [...new Map(Б.map(w => [w.тип, w])).values()];
    EF.шапка('arsenal.index', 'Оружие', Б.length, 'единиц');
    const фб = () => '<div class="fgrp"><i>ранг</i>' + [6, 5, 4, 3].map(r => '<button class="fb' + (ФО.редкость === r ? ' on' : '') +
      '" data-fo="редкость" data-v="' + r + '"><span class="r' + r + ' rt">★</span>' + r + '</button>').join('') + '</div>' +
      '<div class="fgrp"><i>тип</i>' + типы.map(w => '<button class="fb' + (ФО.тип === w.тип ? ' on' : '') + '" data-fo="тип" data-v="' + эк(w.тип) + '">' + эк(w.типРу) + '</button>').join('') + '</div>' +
      '<input class="srch" id="qw" placeholder="поиск" value="' + эк(ФО.поиск) + '">';
    const тело = () => {
      const q = ФО.поиск.trim().toLowerCase();
      const сп = Б.filter(w => (!ФО.редкость || w.редкость === ФО.редкость) && (!ФО.тип || w.тип === ФО.тип) &&
        (!q || (w.имя + ' ' + w.имяРу).toLowerCase().includes(q)));
      const c = $('hdcnt'); if (c) c.textContent = сп.length;
      if (!сп.length) return '<div class="empty">ничего не нашлось</div>';
      return '<div class="list">' + сп.map(w => {
        const к = кому(w);
        return '<details class="dd"><summary>' + EF.фишка(w.id) + '<span class="nm2"><b class="r' + w.редкость + ' rt">' + эк(w.имяРу || w.имя) + '</b>' +
          '<i>' + эк(w.типРу) + ' · АТК ' + эк((w.атк || {})['90'] || '—') + ' · ' + эк((w.статы || []).map(s => s.имя).join(', ')) + '</i></span>' +
          (к.length ? '<span class="rt2">советуют ' + к.length + '</span>' : '') + '</summary><div class="dd-in" data-wbody="' + эк(w.id) + '"></div></details>';
      }).join('') + '</div>';
    };
    EF.ФО = { фб, тело };
    $('fbar').innerHTML = фб();
    $('body').innerHTML = тело();
    EF.подвал('Характеристики и пассивки — из данных игры через endfieldtools.dev. «Советуют» — разборы prydwen.');
  },
});
// Содержимое раскрытого оружия рисуем по требованию: так список из 79 штук
// открывается мгновенно.
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!d.open) return;
  const w = d.querySelector('[data-wbody]');
  if (w && !w.innerHTML) w.innerHTML = карточкаОружия(EF.ствол(w.dataset.wbody));
  const s = d.querySelector('[data-sbody]');
  if (s && !s.innerHTML) s.innerHTML = нутроНабора(EF.БАЗА.наборы.find(n => n.id === s.dataset.sbody));
}, true);

// ── снаряжение ──────────────────────────────────────────────────────────────
const ФС = { ранг: 0 };
function статСтрокой(s) {
  if (!s) return '';
  const v = s.проц ? проц(s.знач) : '+' + чис(s.знач);
  const м = s.макс != null ? ' → ' + (s.проц ? проц(s.макс) : чис(s.макс)) : '';
  return '<span>' + эк(s.имя) + '</span><b>' + v + м + '</b>';
}
function нутроНабора(n) {
  if (!n) return '';
  const вещи = EF.БАЗА.снаряжение.filter(v => v.набор === n.id);
  const кто = EF.БАЗА.персонажи.filter(c => (c.лучшиеНаборы || []).some(x => найтиНабор(x) === n));
  return '<div class="cols">' +
    '<div class="sec full"><h4>эффект комплекта</h4>' + (n.эффекты || []).map(э =>
      '<div class="box brk"><b>' + э.нужно + ' предмета</b><div class="rich" style="font-size:13.5px;line-height:1.6;white-space:pre-line">' + богат(э.текст) + '</div></div>').join('') + '</div>' +
    (кто.length ? '<div class="sec full"><h4>кому советуют<em>prydwen</em></h4><div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">' + кто.map(c =>
      '<div class="it go" data-op="' + эк(c.id) + '"><img src="' + эк(c.значок) + '" alt="" style="width:36px;height:36px;border-radius:8px"><span><b>' + эк(c.имяРу) + '</b><i>' +
      эк(c.стихияРу) + ' · ' + эк(c.классРу) + '</i></span></div>').join('') + '</div></div>' : '') +
    '<div class="sec full"><h4>предметы набора<em>значение → максимум после доработки</em></h4><div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">' +
      вещи.map(v => '<div class="box"><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">' + EF.фишка(v.id) +
        '<span><b style="font:800 13.5px/1.25 var(--head);color:var(--tx);letter-spacing:0;text-transform:none;margin:0">' + эк(v.имяРу || v.имя) + '</b>' +
        '<span class="hint" style="display:block;margin:3px 0 0">' + эк(v.частьРу) + ' · с ур. ' + эк(v.сУровня) + '</span></span></div>' +
        '<div class="kv" style="font-size:12.5px">' + статСтрокой(v.основной) + (v.статы || []).map(статСтрокой).join('') + '</div></div>').join('') +
    '</div></div></div>';
}
EF.раздел('gear', {
  имя: 'Снаряжение', буква: '⛨',
  рисовать() {
    const Н = EF.БАЗА.наборы;
    EF.шапка('gear.sets', 'Снаряжение', Н.length, 'наборов');
    $('fbar').innerHTML = '<div class="fgrp"><i>ранг</i>' + [4, 3, 2, 1].map(r => '<button class="fb' + (ФС.ранг === r ? ' on' : '') +
      '" data-fs="' + r + '">T' + r + '</button>').join('') + '</div>';
    const сп = Н.filter(n => !ФС.ранг || n.ранг === ФС.ранг);
    const c = $('hdcnt'); if (c) c.textContent = сп.length;
    $('body').innerHTML = '<div class="list">' + сп.map(n => {
      const кто = EF.БАЗА.персонажи.filter(c => (c.лучшиеНаборы || []).some(x => найтиНабор(x) === n)).length;
      return '<details class="dd"><summary>' + (n.значок ? '<img src="' + эк(n.значок) + '" alt="" style="width:46px;height:46px;object-fit:contain" loading="lazy">' : '') +
        '<span class="nm2"><b>' + эк(n.имяРу) + '</b><i>' + эк(n.имя) + ' · T' + n.ранг + ' · предметов ' + n.вещей + '</i></span>' +
        (кто ? '<span class="rt2">советуют ' + кто + '</span>' : '') + '</summary><div class="dd-in" data-sbody="' + эк(n.id) + '"></div></details>';
    }).join('') + '</div>';
    const есть = EF.БАЗА.снаряжение.some(v => (v.статы || []).some(s => /^тип /.test(s.имя)));
    EF.подвал('Наборы, эффекты и предметы — данные игры через endfieldtools.dev.' +
      (есть ? ' Часть доп. характеристик подписана «тип N»: в открытых данных у этих номеров нет имени, гадать не стали.' : ''));
  },
});

// ── профиль ─────────────────────────────────────────────────────────────────
function плитка2(имя, знач) {
  return '<div class="st"><u>' + эк(имя) + '</u><b>' + эк(знач == null ? '—' : знач) + '</b></div>';
}
EF.раздел('prof', {
  имя: 'Профиль', буква: '◉',
  рисовать() {
    const uid = localStorage.getItem(LS_UID) || '';
    const П = EF.ПРОФ;
    EF.шапка('profile.sync', П ? (П.имя || 'Профиль') : 'Профиль', П ? П.ур : null, П ? 'уровень' : '');
    let h = '<div class="box brk" style="max-width:680px"><b>UID из игры</b>' +
      '<div class="fld"><input class="inp" id="uid" inputmode="numeric" placeholder="например 6432642365" value="' + эк(uid) + '">' +
      '<button class="btn" data-act="load">Обновить</button>' + (uid ? '<button class="btn gh" data-act="forget">Забыть</button>' : '') + '</div>' +
      '<div class="say">UID запоминается, витрина тянется при каждом заходе. Данные идут с enka.network через свой воркер.</div></div>';
    if (П) {
      h += EF.блок('Сводка', 'UID ' + эк(П.uid)) + '<div class="stats">' +
        плитка2('Уровень', П.ур) + плитка2('Уровень мира', П.мир) + плитка2('Операторов', П.всего) +
        плитка2('Оружия', П.оружий) + плитка2('Записей', П.записей) + плитка2('Достижений', П.достижения) + '</div>' +
        EF.блок('На витрине', 'клик — карточка') +
        '<div class="ops">' + Object.keys(П.оп).map(id => { const c = EF.оп(id); return c ? EF.плитка(c) : ''; }).join('') + '</div>' +
        '<p class="hint">Подробности витрина отдаёт только по выставленным в профиле игры (обычно четверо), остальных — только уровнем.</p>';
    }
    $('body').innerHTML = h;
  },
});

// ── аккаунт SKPORT («Хроника») ──────────────────────────────────────────────
// С v6: ключи skport к нам больше не копируются. Человек запускает скрипт
// (sk-export.js, функция skЭкспорт) в консоли на www.skport.com — там
// запросы к их API разрешены, — скрипт сам берёт вход из cookie, обновляет
// токен и кладёт в буфер одни игровые данные. Сюда вставляется результат.
// Прежний путь (ключи сюда + запросы отсюда) не работал: zonai.skport.com не
// отдаёт CORS чужим сайтам, а cred вообще лежит в cookie, не в localStorage.
const LS_CHR = 'ef-chr';
let ХРОНИКА = null;
const КОМАНДА = () => '(' + String(window.skЭкспорт) + ')()';
try { localStorage.removeItem('ef-sk-keys'); } catch (e) {}   // старые ключи не храним

// Операторы из карточки: любые объекты, где есть id вида chr_0000_имя.
function операторыSk(о, out) {
  out = out || {};
  if (!о || typeof о !== 'object') return out;
  if (Array.isArray(о)) { о.forEach(x => операторыSk(x, out)); return out; }
  // id ищем в самом объекте, а если нет — во вложенном на уровень ниже
  // ({charData:{id:'chr_…'}, level:80} — уровень снаружи, id внутри).
  const найти = x => {
    for (const v of Object.values(x)) {
      if (typeof v === 'string') { const м = /^(chr_\d{4}_[a-z0-9]+)/i.exec(v); if (м) return м[1].toLowerCase(); }
    }
    return '';
  };
  let id = найти(о);
  if (!id && (о.level || о.potentialLevel)) {
    for (const v of Object.values(о)) if (v && typeof v === 'object' && !Array.isArray(v)) { id = найти(v); if (id) break; }
  }
  if (id && EF.оп(id)) {
    const ур = +(о.level || о.lv || о.charLevel || 0);
    const пот = +(о.potentialLevel || о.potential || о.potentialRank || 0);
    const был = out[id] || {};
    out[id] = { ур: Math.max(был.ур || 0, ур), пот: Math.max(был.пот || 0, пот) };
  }
  Object.values(о).forEach(v => { if (v && typeof v === 'object') операторыSk(v, out); });
  return out;
}
// Переносим найденное в профиль: отметки «есть у меня» и уровни работают
// так же, как от витрины enka. Витринные подробности не затираются.
function вПрофиль(х) {
  const оп = операторыSk(х.data && х.data.card);
  const n = Object.keys(оп).length;
  if (!n) return 0;
  const П = EF.ПРОФ || { uid: (х.role || {}).roleId || '', имя: (х.role || {}).nick || '', ур: (х.role || {}).level, оп: {}, когда: Date.now() };
  Object.entries(оп).forEach(([id, v]) => { П.оп[id] = Object.assign({}, v, П.оп[id] || {}, { skport: true }); });
  П.skport = х.at;
  EF.ПРОФ = П;
  try { localStorage.setItem(LS_PROF, JSON.stringify(П)); } catch (e) {}
  return n;
}
function принятьХронику(текст) {
  let х;
  try { х = JSON.parse(текст); } catch (e) { return 'это не то: вставь текст целиком, как его положил скрипт'; }
  if (!х || х.mark !== 'alextask-skport') return 'это не выгрузка skport — запусти скрипт ещё раз';
  if (/"(cred|token|sign)"\s*:/.test(текст)) return 'в тексте есть ключи — такое не сохраняю';
  ХРОНИКА = х;
  try { localStorage.setItem(LS_CHR, JSON.stringify(х)); } catch (e) {}
  const n = вПрофиль(х);
  return 'принято: ' + (х.data.card ? 'карточка аккаунта' : 'без карточки') + (n ? ', операторов — ' + n : '');
}
function рисоватьХронику() {
  if (!ХРОНИКА) return '';
  const р = ХРОНИКА.data || {}, ro = ХРОНИКА.role || {};
  const оп = операторыSk(р.card);
  let h = EF.блок('Аккаунт', ХРОНИКА.at ? эк(new Date(ХРОНИКА.at).toLocaleString('ru')) : '') +
    '<div class="stats">' +
      '<div class="st"><u>ник</u><b style="font-size:17px">' + эк(ro.nick || '—') + '</b></div>' +
      '<div class="st"><u>roleId</u><b style="font-size:15px">' + эк(ro.roleId || '—') + '</b></div>' +
      '<div class="st"><u>сервер</u><b>' + эк(ro.serverId || '—') + '</b></div>' +
      '<div class="st' + (р.card ? ' ok' : '') + '"><u>карточка</u><b>' + (р.card ? 'есть' : 'нет') + '</b></div>' +
      '<div class="st"><u>операторов</u><b>' + Object.keys(оп).length + '</b></div>' +
    '</div>';
  if (Object.keys(оп).length) {
    h += EF.блок('Операторы из SKPORT', Object.keys(оп).length + '') + '<div class="team">' +
      Object.entries(оп).map(([id, v]) => {
        const c = EF.оп(id) || {};
        return '<span class="mem me" data-op="' + эк(id) + '"><img src="' + эк(c.значок || '') + '" alt="" data-nf="hide">' +
          '<span class="who">' + эк(c.имяРу || c.имя || id) + (v.ур ? '<br>ур. ' + v.ур : '') + '</span></span>';
      }).join('') + '</div>';
  }
  if (ХРОНИКА.log && ХРОНИКА.log.length) h += '<p class="hint">Что не ответило: ' + эк(ХРОНИКА.log.join(' · ')) + '</p>';
  const ключи = Object.keys(р);
  h += EF.блок('Что пришло', ключи.length + ' разд.') + '<div class="list">' + ключи.map(k =>
    '<details class="dd"><summary><span class="nm2"><b>' + эк(k) + '</b><i>' + эк(k === 'card' ? (ХРОНИКА.cardPath || '') : '') + '</i></span></summary>' +
    '<div class="dd-in">' + дерево(р[k], 0) + '</div></details>').join('') + '</div>';
  return h;
}
function дерево(о, гл) {
  if (о == null) return '<div class="hint">пусто</div>';
  if (typeof о !== 'object') return '<div>' + эк(String(о)) + '</div>';
  if (Array.isArray(о)) {
    if (!о.length) return '<div class="hint">пустой список</div>';
    return о.slice(0, 40).map((x, i) => x && typeof x === 'object'
      ? '<details class="dd" style="margin:6px 0"><summary><span class="nm2"><b>запись ' + (i + 1) + '</b><i>' + эк(Object.keys(x).slice(0, 4).join(', ')) + '</i></span></summary><div class="dd-in">' + дерево(x, гл + 1) + '</div></details>'
      : '<div>' + (i + 1) + '. ' + эк(String(x)) + '</div>').join('');
  }
  const пары = Object.entries(о);
  const простые = пары.filter(([, v]) => v == null || typeof v !== 'object');
  const сложные = пары.filter(([, v]) => v && typeof v === 'object');
  let h = простые.length ? '<div class="kv">' + простые.map(([k, v]) => '<span>' + эк(k) + '</span><b>' + эк(String(v)).slice(0, 80) + '</b>').join('') + '</div>' : '';
  if (сложные.length && гл < 4) {
    h += сложные.map(([k, v]) => '<details class="dd" style="margin:6px 0"><summary><span class="nm2"><b>' + эк(k) + '</b><i>' +
      (Array.isArray(v) ? v.length + ' записей' : 'объект') + '</i></span></summary><div class="dd-in">' + дерево(v, гл + 1) + '</div></details>').join('');
  }
  return h || '<div class="hint">нет полей</div>';
}
EF.раздел('chr', {
  имя: 'Хроника', буква: '✎',
  рисовать() {
    ХРОНИКА = ХРОНИКА || взять(LS_CHR, null);
    EF.шапка('skport.account', 'Хроника SKPORT', null);
    $('body').innerHTML = '<div class="box brk" style="max-width:980px"><b>' + (ХРОНИКА ? 'обновить данные' : 'подключить за три шага') + '</b>' +
      '<div class="node"><span class="tag">1</span><div style="flex:1">Открой <a class="lnk" href="https://www.skport.com/" target="_blank" rel="noopener">www.skport.com</a> и войди в аккаунт.</div></div>' +
      '<div class="node"><span class="tag">2</span><div style="flex:1">Там же: F12 → Console, вставь скрипт и нажми Enter. Если Chrome просит — сначала напиши <span class="hl">allow pasting</span> и Enter. ' +
        'Скрипт сам возьмёт вход, обновит токен и положит в буфер <b>только игровые данные</b> — ключи skport со страницы не уходят.</div></div>' +
      '<div class="fld"><button class="btn sec" data-act="copy-cmd">Скопировать скрипт</button><span class="say">' + Math.round(КОМАНДА().length / 1024 * 10) / 10 + ' КБ, текст ниже</span></div>' +
      '<textarea class="inp" id="cmd" readonly spellcheck="false" style="width:100%;height:84px;resize:vertical;font-size:11px">' + эк(КОМАНДА()) + '</textarea>' +
      '<div class="node" style="margin-top:10px"><span class="tag gh">3</span><div style="flex:1">Вставь сюда то, что скопировал скрипт, и нажми «Загрузить».</div></div>' +
      '<div class="fld"><input class="inp" id="skjson" placeholder="вставь выгрузку ({&quot;mark&quot;:&quot;alextask-skport&quot;…})" spellcheck="false">' +
        '<button class="btn" data-act="sk-paste">Загрузить</button>' + (ХРОНИКА ? '<button class="btn gh" data-act="sk-forget">Забыть</button>' : '') + '</div>' +
      '<div class="say" id="skstatus"></div></div>' +
      '<div id="skbody">' + рисоватьХронику() + '</div>';
  },
});

// ── инструменты: облако, бэкап, откуда данные ───────────────────────────────
// Меню одинаковое во всех разделах сайта: колонка пунктов слева, содержимое
// справа, колонка не пропадает при выборе.
const ИНСТР = [['cloud', 'Облако'], ['backup', 'Бэкап файлом'], ['fresh', 'Свежесть данных'], ['src', 'Откуда данные']];
let ИНСТРВКЛ = 'cloud';
function инструменты() {
  меню(false);
  const имя = (ИНСТР.find(([k]) => k === ИНСТРВКЛ) || ИНСТР[0])[1];
  EF.открыть('<div class="wh"><h2>' + эк(имя) + '</h2><i>' + эк(ИНСТРПОД[ИНСТРВКЛ] || '') + '</i></div>' +
    '<div class="toolsg">' +
      '<div class="tcol">' +
        ИНСТР.map(([k, и]) => пунктМеню('data-tl="' + k + '"', и, ИНСТРПОД[k] || '', k === ИНСТРВКЛ)).join('') +
        '<hr>' + ВМЕНЮ.filter(([id]) => EF.разделы[id]).map(([id, под]) => пунктМеню('data-tab="' + id + '"', EF.разделы[id].имя, под, false)).join('') +
      '</div>' +
      '<div id="tlbody">' + нутроИнстр() + '</div></div>');
}
function нутроИнстр() {
  if (ИНСТРВКЛ === 'backup') {
    return '<div class="box brk"><b>файл со всеми отметками</b>Уровни в планировщике, карта, дейлики, достижения, крутки, UID. ' +
      'Адрес облака в файл не кладётся — это ключ доступа.<div class="fld" style="margin-top:12px">' +
      '<button class="btn" data-act="bk-save">Скачать всё</button><label class="btn sec" style="cursor:pointer">Восстановить из файла' +
      '<input type="file" id="bkfile" accept=".json,application/json" style="display:none"></label></div><div class="say" id="bksay"></div></div>';
  }
  if (ИНСТРВКЛ === 'fresh') {
    const д = EF.возрастБазы();
    return '<div class="stats"><div class="st' + (д != null && д <= 14 ? ' ok' : '') + '"><u>база собрана</u><b>' + эк(EF.БАЗА.собрано || '—') + '</b></div>' +
      '<div class="st"><u>дней назад</u><b>' + (д == null ? '—' : д) + '</b></div></div>' +
      '<p class="hint">Обновление: свежая выгрузка endfieldtools в <span class="hl">ef\\Исходники\\endfieldtools</span>, затем в PowerShell ' +
      '<span class="hl">cd "F:\\Claude cowork\\сайт\\ef"; python build-ef-eft.py</span>. Разборы prydwen — отдельно, через консоль браузера.</p>';
  }
  if (ИНСТРВКЛ === 'src') {
    return '<table class="tbl">' +
      '<tr><td>Операторы, навыки, таланты, прокачка, оружие, снаряжение, наборы</td><td>данные игры из открытой базы endfieldtools.dev, с разрешения автора (22.09.2026)</td></tr>' +
      '<tr><td>Точки карты, рецепты фабрики, достижения, дейлики, баннеры</td><td>там же</td></tr>' +
      '<tr><td>Значки, портреты, тайлы карты</td><td>файлы игры, выгрузка endfieldtools; © Hypergryph / GRYPHLINE</td></tr>' +
      '<tr><td>Тиры, приоритет оружия, наборы, составы</td><td>разборы prydwen.gg (только структура, тексты не копируются)</td></tr>' +
      '<tr><td>Витрина профиля</td><td>enka.network через свой воркер</td></tr>' +
      '<tr><td>Боевая хроника</td><td>skport, запросы прямо из браузера</td></tr>' +
      '<tr><td>Оформление</td><td>по мотивам endfieldtools.dev, шрифт Google Sans (OFL 1.1)</td></tr>' +
      '</table>';
  }
  return EF.облакоHtml ? EF.облакоHtml() : '';
}

// Бэкап: всё с префиксом ef-, кроме служебного и ключей доступа.
const БЕЗ = ['ef-sync', 'ef-sk-keys', 'ef-prof', 'ef-chr'];  // ef-sk-keys — от старой версии, на всякий случай
function собрать() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.indexOf('ef-') !== 0 || БЕЗ.indexOf(k) >= 0) continue;
    try { out[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { out[k] = localStorage.getItem(k); }
  }
  return out;
}
EF.собрать = собрать;
function скачатьБэкап() {
  const blob = new Blob([JSON.stringify({ mark: 'alextask-ef', ver: APP_VER, at: new Date().toISOString(), data: собрать() }, null, 1)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'endfield-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function восстановить(файл) {
  const say = t => { const s = $('bksay'); if (s) s.textContent = t; };
  try {
    const j = JSON.parse(await файл.text());
    if (j.mark !== 'alextask-ef' || !j.data) throw new Error('это не бэкап справочника Endfield');
    let n = 0;
    Object.entries(j.data).forEach(([k, v]) => { if (k.indexOf('ef-') === 0 && БЕЗ.indexOf(k) < 0) { localStorage.setItem(k, JSON.stringify(v)); n++; } });
    say('восстановлено ключей: ' + n + ' (снимок от ' + new Date(j.at).toLocaleString('ru') + ')');
  } catch (e) { say('не вышло: ' + e.message); }
}

// ── облако (npoint через свой воркер) ───────────────────────────────────────
// Та же схема, что у справочника NTE: адрес хранилища — ключ доступа, его не
// показывают без нажатия и не кладут в бэкап. Отметки (карта, достижения)
// складываются, остальное берётся по свежести.
const СКЛАДЫВАТЬ = ['ef-map-found', 'ef-ach'];
function облако() { return взять('ef-sync', {}); }
function облакоСохр(v) { try { localStorage.setItem('ef-sync', JSON.stringify(v)); } catch (e) {} }
function адреса(id, запись) {
  const via = API.map(b => b + '/api/cloud/' + id);
  return запись ? via : ['https://api.npoint.io/' + id].concat(via);
}
async function спросить(id, опц) {
  let посл = null;
  for (const u of адреса(id, !!(опц && опц.method === 'POST'))) {
    try {
      const r = await fetch(u, Object.assign({ cache: 'no-store' }, опц || {}));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) { посл = e; }
  }
  throw посл || new Error('нет связи');
}
function облакоИд(raw) {
  const t = String(raw || '').trim();
  const m = t.match(/npoint\.io\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{8,40}$/.test(t) ? t : '';
}
function применить(data, at) {
  const мои = собрать();
  Object.keys(data || {}).forEach(k => {
    if (k.indexOf('ef-') !== 0 || БЕЗ.indexOf(k) >= 0) return;
    let v = data[k];
    if (СКЛАДЫВАТЬ.indexOf(k) >= 0 && мои[k] && typeof мои[k] === 'object' && typeof v === 'object') {
      v = слить(v, мои[k]);
    } else if (at < (облако().at || 0)) return;
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  });
}
function слить(a, b) {
  const out = Object.assign({}, a);
  Object.keys(b).forEach(k => {
    if (b[k] && typeof b[k] === 'object' && out[k] && typeof out[k] === 'object') out[k] = слить(out[k], b[k]);
    else if (typeof b[k] === 'number' && typeof out[k] === 'number') out[k] = Math.max(out[k], b[k]);
    else out[k] = b[k];
  });
  return out;
}
let идёт = false;
async function сверить(say) {
  const cfg = облако();
  if (!cfg.np) { say && say('Сначала подключи хранилище'); return; }
  if (идёт) return;
  идёт = true;
  say && say('сверяю…');
  try {
    let cloud = null;
    try { cloud = await (await спросить(cfg.np)).json(); } catch (e) { cloud = null; }
    if (cloud && cloud.data) применить(cloud.data, +cloud.at || 0);
    await спросить(cfg.np, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: 1, at: Date.now(), data: собрать() }) });
    cfg.at = Date.now();
    облакоСохр(cfg);
    say && say('готово: сведено ' + new Date(cfg.at).toLocaleString('ru'));
  } catch (e) {
    say && say('не вышло: ' + (e && e.message || e) + '. Мешать может VPN или блокировщик.');
  } finally { идёт = false; }
}
let таймер = null;
EF.облакоСкоро = function () {
  if (!облако().np) return;
  clearTimeout(таймер);
  таймер = setTimeout(() => сверить(null), 4000);
};
EF.облакоТихо = function () { if (облако().np) сверить(null).then(() => { if (ВКЛ !== 'map') рисовать(); }); };
EF.облакоHtml = function () {
  const cfg = облако();
  return '<div class="box brk"><b>облако npoint</b>' +
    (cfg.np ? '<div class="verdict" style="margin-bottom:10px">Подключено · последняя сверка: ' + (cfg.at ? new Date(cfg.at).toLocaleString('ru') : 'ещё не было') + '</div>'
      : '<div class="hint" style="margin:0 0 10px">Зайди на <a class="lnk" href="https://www.npoint.io/" target="_blank" rel="noopener">npoint.io</a>, «Create JSON bin», сохрани и ' +
        'скопируй ссылку вида <span class="hl">api.npoint.io/xxxxxxxx</span>. Хранилище нужно отдельное: NTE и трекер ZZZ перезаписывают своё целиком.</div>') +
    '<div class="fld"><input class="inp" id="npkey" type="password" autocomplete="off" placeholder="api.npoint.io/…">' +
      '<button class="btn" data-act="np-save">Подключить</button>' +
      (cfg.np ? '<button class="btn sec" data-act="np-sync">Сверить сейчас</button><button class="btn gh" data-act="np-show">Показать адрес</button>' +
        '<button class="btn bad" data-act="np-off">Отключить</button>' : '') + '</div>' +
    '<div class="say" id="npsay"></div></div>';
};

// ── события ─────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const т = e.target.closest('[data-tab],[data-f],[data-fo],[data-fs],[data-act],[data-op],[data-wpn],[data-set],[data-close],[data-ct],[data-tools],[data-tl],[data-plan]');
  if (!т) { if (e.target.id === 'sheet') EF.закрыть(); return; }
  const д = т.dataset;
  if (д.close) { EF.закрыть(); return; }
  if (д.tab) { EF.перейти(д.tab); return; }
  if (д.tools) { инструменты(); return; }
  if (д.tl) { ИНСТРВКЛ = д.tl; инструменты(); return; }
  if (д.plan) { e.preventDefault(); EF.закрыть(); EF.вПлан && EF.вПлан(д.plan); return; }
  if (д.ct) { ВКЛК = д.ct; if (ОТКРЫТ) открытьОп(ОТКРЫТ); return; }
  if (д.op) { ВКЛК = 'обзор'; открытьОп(д.op); return; }
  if (д.wpn) { EF.открытьОружие(д.wpn); return; }
  if (д.set) {
    const n = EF.БАЗА.наборы.find(x => x.id === д.set);
    if (n) EF.открыть('<div class="hd" style="margin-top:0"><div class="ttl"><span class="eyebrow">// gear.set · T' + n.ранг + '</span><h1>' + эк(n.имяРу) + '</h1></div></div>' + нутроНабора(n));
    return;
  }
  if (д.f) {
    const п = д.f;
    if (п === 'свои') Ф.свои = !Ф.свои;
    else { const v = п === 'редкость' ? +д.v : д.v; Ф[п] = Ф[п] === v ? (п === 'редкость' ? 0 : '') : v; }
    $('fbar').innerHTML = фильтрыОператоров();
    $('body').innerHTML = витрина();
    return;
  }
  if (д.fo) {
    const v = д.fo === 'редкость' ? +д.v : д.v;
    ФО[д.fo] = ФО[д.fo] === v ? (д.fo === 'редкость' ? 0 : '') : v;
    $('fbar').innerHTML = EF.ФО.фб(); $('body').innerHTML = EF.ФО.тело();
    return;
  }
  if (д.fs) { ФС.ранг = ФС.ранг === +д.fs ? 0 : +д.fs; рисовать(); return; }
  switch (д.act) {
    case 'load': {
      const uid = ($('uid').value || '').replace(/\D+/g, '');
      if (uid.length < 6) { alert('UID — это число из профиля в игре'); return; }
      синхра(uid, false);
      return;
    }
    case 'forget':
      localStorage.removeItem(LS_UID); localStorage.removeItem(LS_PROF); EF.ПРОФ = null; рисовать(); return;
    case 'copy-cmd': {
      const п = $('cmd'); п.select();
      navigator.clipboard.writeText(п.value).then(() => { т.textContent = 'скопировано'; }, () => { т.textContent = 'выдели и скопируй сам'; });
      return;
    }
    case 'sk-paste': {
      const итог = принятьХронику(($('skjson').value || '').trim());
      $('skstatus').textContent = итог;
      if (/^принято/.test(итог)) { $('skbody').innerHTML = рисоватьХронику(); $('skjson').value = ''; }
      return;
    }
    case 'sk-forget':
      localStorage.removeItem(LS_CHR); ХРОНИКА = null; рисовать(); return;
    case 'bk-save': скачатьБэкап(); return;
    case 'np-save': {
      const id = облакоИд($('npkey').value);
      const say = t => { $('npsay').textContent = t; };
      if (!id) { say('Не разобрал адрес. Нужна ссылка вида api.npoint.io/xxxxxxxx'); return; }
      облакоСохр({ np: id, at: 0 });
      сверить(say).then(() => { const b = $('tlbody'); if (b) b.innerHTML = нутроИнстр(); });
      return;
    }
    case 'np-sync': сверить(t => { $('npsay').textContent = t; }); return;
    case 'np-show': $('npkey').type = 'text'; $('npkey').value = 'https://api.npoint.io/' + облако().np; return;
    case 'np-off': if (confirm('Отключить облако на этом устройстве? Данные в хранилище останутся.')) { localStorage.removeItem('ef-sync'); инструменты(); } return;
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'bkfile' && e.target.files[0]) восстановить(e.target.files[0]);
  if (e.target.id === 'sort') { Ф.порядок = e.target.value; $('body').innerHTML = витрина(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { Ф.поиск = t.value; $('body').innerHTML = витрина(); }
  else if (t.id === 'qw') { ФО.поиск = t.value; $('body').innerHTML = EF.ФО.тело(); }
  else if (t.id === 'urr') {
    УР = +t.value;
    $('urv').textContent = УР;
    const c = EF.оп(ОТКРЫТ);
    EF.подробно(ОТКРЫТ).then(д => { $('urs').innerHTML = плиткиСтатов(статыНа(д, УР), c); });
  } else if (t.id === 'urn') {
    УРН = +t.value;
    if (ОТКРЫТ) EF.подробно(ОТКРЫТ).then(д => { $('cbody').innerHTML = вклНавыки(EF.оп(ОТКРЫТ), д, EF.мой(ОТКРЫТ)); });
  }
});
// Битые картинки прячем. Событие error не всплывает — слушаем на перехвате.
document.addEventListener('error', e => {
  const э = e.target;
  if (э && э.tagName === 'IMG' && э.dataset.nf === 'hide') э.style.visibility = 'hidden';
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('sheet').classList.contains('on')) EF.закрыть(); });
window.addEventListener('hashchange', () => {
  const х = (location.hash || '').slice(1);
  if (EF.разделы[х] && х !== ВКЛ && EF.БАЗА) { EF.закрыть(); EF.перейти(х, true); }
});
$('logo').addEventListener('click', () => EF.перейти('ops'));
$('ver').addEventListener('click', () => { ИНСТРВКЛ = 'src'; инструменты(); });
// Меню «☰ Инструменты»: открыть/закрыть, закрыть кликом мимо и по Escape.
$('toolsBtn').addEventListener('click', e => { e.stopPropagation(); меню(); });
document.addEventListener('click', e => { if (!e.target.closest('#toolsBox')) меню(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') меню(false); });

// Старт — после того как подгрузятся map.js, tools.js и factory.js: они
// регистрируют свои разделы через EF.раздел().
document.addEventListener('DOMContentLoaded', старт);
})();
