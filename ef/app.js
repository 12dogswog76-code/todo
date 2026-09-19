// Справочник Arknights: Endfield.
//
// Устройство повторяет трекер ZZZ: главная — витрина плиток с артами, клик
// открывает карточку в панели поверх страницы, внутри карточки свои вкладки.
// Профиль с витрины enka подтягивается сам при каждом заходе и накладывается
// на плитки и карточки.
//
// В разметке нет ни одного onclick: политика безопасности запрещает
// inline-скрипты, поэтому события ловятся делегированием на документе.

'use strict';

const APP_VER = 'v4';
const ЗНАЧКИ = 'https://enka.network/ui/ef';
const АРТЫ = 'https://cdn.prydwen.gg/images/arknights-endfield/characters/';
const ВОРКЕР = 'https://alextask-push.12dogswog76.workers.dev';
const РАЗБОР = 'https://www.prydwen.gg/arknights-endfield/characters/';
const LS_UID = 'ef-uid';
const LS_PROF = 'ef-prof';

const $ = id => document.getElementById(id);
const эк = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const чис = n => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('ru'));

let БАЗА = null;
let ВКЛ = 'ops';
let ПРОФ = null;
let ОТКРЫТ = null;                 // id оператора в панели
let ВКЛК = 'обзор';                // вкладка внутри карточки
const Ф = { стихия: '', класс: '', редкость: 0, тир: '', поиск: '', свои: false };

const ВКЛАДКИ = [
  { id: 'ops',  имя: 'Операторы' },
  { id: 'tier', имя: 'Тир-лист' },
  { id: 'team', имя: 'Команды' },
  { id: 'gear', имя: 'Снаряжение' },
  { id: 'wpn',  имя: 'Оружие' },
  { id: 'prof', имя: 'Профиль' },
  { id: 'chr',  имя: 'Хроника' },
];
const ВКЛКАРТЫ = [
  { id: 'обзор',   имя: 'Обзор' },
  { id: 'сборка',  имя: 'Сборка' },
  { id: 'команды', имя: 'Команды' },
  { id: 'рост',    имя: 'Рост' },
  { id: 'моё',     имя: 'Моё' },
];

// Классы для цвета тира: T0 — красный, дальше холоднее.
const ТИРКЛ = { 'T0': 't0', 'T0.5': 't05', 'T1': 't1', 'T1.5': 't15', 'T2': 't2' };

// ── старт ───────────────────────────────────────────────────────────────────
async function старт() {
  рисоватьВкладки();
  версияВоркера();
  ПРОФ = взятьСохранённый();
  обновитьКнопку();
  try {
    const r = await fetch('ef-db.json?v=' + APP_VER, { cache: 'no-cache' });
    if (!r.ok) throw new Error('ef-db.json: ' + r.status);
    БАЗА = await r.json();
  } catch (e) {
    $('body').innerHTML = '<div class="empty">база не загрузилась: ' + эк(e.message) + '</div>';
    return;
  }
  $('src').textContent = 'Данные: таблицы игры (дамп 22.06.2026), разборы и арты — prydwen.gg, ' +
    'значки — enka.network. Операторов ' + БАЗА.персонажи.length +
    ', оружия ' + БАЗА.оружие.length + ', снаряжения ' + БАЗА.снаряжение.length +
    ', наборов ' + БАЗА.наборы.length + '.';
  рисовать();
  const uid = localStorage.getItem(LS_UID);
  if (uid) синхра(uid, true);
}

async function версияВоркера() {
  try {
    const j = await (await fetch(ВОРКЕР + '/api/ef/ping', { cache: 'no-store' })).json();
    $('ver').innerHTML = APP_VER + ' <b>· воркер ' + эк(j.v) + '</b>';
  } catch (e) { $('ver').innerHTML = APP_VER + ' <b>· воркер не отвечает</b>'; }
}

function рисоватьВкладки() {
  $('tabs').innerHTML = ВКЛАДКИ.map(в =>
    '<button class="tab' + (в.id === ВКЛ ? ' on' : '') + '" data-tab="' + в.id + '">' +
    эк(в.имя) + '</button>').join('');
}

function рисовать() {
  рисоватьВкладки();
  const тело = $('body'), фб = $('fbar');
  if (ВКЛ === 'ops') { фб.innerHTML = фильтрыОператоров(); тело.innerHTML = витрина(); }
  else if (ВКЛ === 'tier') { фб.innerHTML = ''; тело.innerHTML = тирЛист(); }
  else if (ВКЛ === 'team') { фб.innerHTML = ''; тело.innerHTML = всеКоманды(); }
  else if (ВКЛ === 'gear') { фб.innerHTML = фильтрНаборов(); тело.innerHTML = спискомНаборов(); }
  else if (ВКЛ === 'wpn') { фб.innerHTML = фильтрОружия(); тело.innerHTML = спискомОружия(); }
  else if (ВКЛ === 'chr') { фб.innerHTML = ''; тело.innerHTML = хроникаHtml(); }
  else { фб.innerHTML = ''; тело.innerHTML = профильHtml(); }
}

// ── профиль ─────────────────────────────────────────────────────────────────
// Строковый id оператора достаём из идентификатора навыка: в этой части
// витрины enka отдаёт числовые шаблоны, а в навыках — нормальные имена вида
// chr_0016_laevat_UltimateSkill.
function ктоЭто(ч) {
  const с = ((ч.skillInfo || {}).levelInfo || [])[0];
  const м = с && /^(chr_\d+_[a-z]+)/i.exec(с.skillId || '');
  return м ? м[1] : '';
}

function разобрать(д) {
  const и = д.playerInfo || {}, к = и.businessCard || {}, ст = и.statistic || {};
  const оп = {};
  (и.charList || []).forEach(c => {
    if (c.templateId) оп[c.templateId] = { ур: c.level, пот: c.potentialLevel || 0 };
  });
  (д.charData || []).forEach(ч => {
    const id = ктоЭто(ч);
    if (!id) return;
    оп[id] = Object.assign(оп[id] || {}, {
      ур: ч.level, пот: ч.potentialLevel || 0,
      навыки: ((ч.skillInfo || {}).levelInfo || []).map(н => ({
        имя: имяНавыка(н.skillId), ур: н.skillLevel, макс: н.skillMaxLevel })),
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
    миссия: к.mainMissionId || '', подпись: к.signature || '',
    создан: к.createTime || 0, домены: ((к.domainDev || {}).domains || []),
    достижения: дост.reduce((s, x) => s + (x.value || 0), 0),
    оп, всего: ст.charNum, оружий: ст.weaponNum, записей: ст.docNum,
    ttl: д.ttl || 60, когда: Date.now(),
  };
}

function взятьСохранённый() {
  try { return JSON.parse(localStorage.getItem(LS_PROF)) || null; } catch (e) { return null; }
}

async function синхра(uid, тихо) {
  const кн = $('sync');
  кн.className = 'sync'; кн.textContent = 'обновляю…';
  try {
    const r = await fetch(ВОРКЕР + '/api/ef/uid/' + uid, { cache: 'no-store' });
    if (!r.ok) throw new Error('ответ ' + r.status);
    ПРОФ = разобрать(await r.json());
    try { localStorage.setItem(LS_PROF, JSON.stringify(ПРОФ)); } catch (e) {}
    localStorage.setItem(LS_UID, uid);
    обновитьКнопку();
    рисовать();
    if (ОТКРЫТ) открытьОп(ОТКРЫТ);
  } catch (e) {
    кн.className = 'sync err';
    кн.textContent = 'профиль: ' + e.message;
    if (!тихо) alert('Витрина не загрузилась: ' + e.message);
  }
}

function обновитьКнопку() {
  const кн = $('sync');
  if (!ПРОФ) { кн.className = 'sync'; кн.textContent = 'подключить профиль'; return; }
  const мин = Math.round((Date.now() - ПРОФ.когда) / 60000);
  кн.className = 'sync ok';
  кн.textContent = (ПРОФ.имя || 'профиль') + ' · ' +
    (мин < 1 ? 'только что' : мин < 60 ? мин + ' мин назад' : Math.round(мин / 60) + ' ч назад');
}

const мой = id => (ПРОФ && ПРОФ.оп[id]) || null;

// Имена наборов в разборах пишут сокращённо и без спецзнаков: «Aethertech»
// против «Æthertech» в таблицах игры. Поэтому сверяем по упрощённому виду.
function просто(s) {
  return String(s || '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '');
}
function найтиНабор(имя) {
  const п = просто(имя);
  return БАЗА.наборы.find(n => просто(n.имя) === п) ||
         БАЗА.наборы.find(n => просто(n.имя).startsWith(п) && п.length > 3) || null;
}

// ── витрина ─────────────────────────────────────────────────────────────────
function фильтрыОператоров() {
  const чип = (тип, знач, текст, цвет) =>
    '<button class="fb' + (Ф[тип] === знач ? ' on' : '') + '" data-f="' + тип +
    '" data-v="' + эк(знач) + '"' + (цвет ? ' style="color:#' + цвет + '"' : '') + '>' +
    эк(текст) + '</button>';
  const уник = поле => [...new Set(БАЗА.персонажи.map(c => c[поле]))].filter(Boolean);
  return '' +
    '<div class="fgrp"><i>стихия</i>' + уник('стихия').map(s => {
      const о = БАЗА.персонажи.find(c => c.стихия === s);
      return чип('стихия', s, о.стихияРу, Ф.стихия === s ? '' : о.цвет);
    }).join('') + '</div>' +
    '<div class="fgrp"><i>класс</i>' + уник('класс').map(k =>
      чип('класс', k, БАЗА.персонажи.find(c => c.класс === k).классРу)).join('') + '</div>' +
    '<div class="fgrp"><i>тир</i>' + ['T0', 'T0.5', 'T1', 'T1.5', 'T2'].map(t =>
      чип('тир', t, t)).join('') + '</div>' +
    '<div class="fgrp"><i>ранг</i>' + [6, 5, 4].map(r =>
      '<button class="fb' + (Ф.редкость === r ? ' on' : '') +
      '" data-f="редкость" data-v="' + r + '">' + r + '✦</button>').join('') + '</div>' +
    (ПРОФ ? '<button class="fb' + (Ф.свои ? ' on' : '') + '" data-f="свои" data-v="1">' +
            'только мои</button>' : '') +
    '<input class="srch" id="q" placeholder="поиск" value="' + эк(Ф.поиск) + '">' +
    '<span class="fcnt" id="cnt"></span>';
}

function отбор() {
  const q = Ф.поиск.trim().toLowerCase();
  return БАЗА.персонажи.filter(c =>
    (!Ф.стихия || c.стихия === Ф.стихия) &&
    (!Ф.класс || c.класс === Ф.класс) &&
    (!Ф.редкость || c.редкость === Ф.редкость) &&
    (!Ф.тир || c.тир === Ф.тир) &&
    (!Ф.свои || мой(c.id)) &&
    (!q || (c.имя + ' ' + (c.имяРу || '')).toLowerCase().includes(q)));
}

function витрина() {
  const люди = отбор();
  setTimeout(() => {
    const c = $('cnt');
    if (c) c.textContent = люди.length + ' из ' + БАЗА.персонажи.length;
  }, 0);
  if (!люди.length) return '<div class="empty">никто не подошёл под фильтры</div>';
  return '<div class="ops">' + люди.map(плитка).join('') + '</div>';
}

function плитка(c) {
  const м = мой(c.id);
  return '<button class="tile" style="--el:#' + эк(c.цвет) + '" data-op="' + эк(c.id) + '">' +
    '<img src="' + эк(АРТЫ + c.арт) + '" alt="" loading="lazy" data-nf="hide">' +
    '<span class="sh"></span><span class="el"></span>' +
    '<span class="rk">' + c.редкость + '✦</span>' +
    (c.тир ? '<span class="tr ' + (ТИРКЛ[c.тир] || '') + '">' + эк(c.тир) + '</span>' : '') +
    (м ? '<span class="lv">' + эк(м.ур) + '</span>' +
         (м.пот ? '<span class="pot">P' + эк(м.пот) + '</span>' : '')
       : '<span class="lv no">нет</span>') +
    '<span class="info">' +
      '<span class="nm">' + эк(c.имяРу || c.имя) + '</span>' +
      '<span class="sub">' + эк(c.стихияРу) + ' · ' + эк(c.классРу) + '</span>' +
    '</span></button>';
}

// ── тир-лист ────────────────────────────────────────────────────────────────
function тирЛист() {
  const порядок = ['T0', 'T0.5', 'T1', 'T1.5', 'T2'];
  const есть = порядок.filter(t => БАЗА.персонажи.some(c => c.тир === t));
  return '<div class="cap">Тир-лист<i></i><em>оценка prydwen, режим Umbral Monument</em></div>' +
    '<div class="tiergrid">' + есть.map(t => {
      const кто = БАЗА.персонажи.filter(c => c.тир === t)
        .sort((a, b) => b.редкость - a.редкость || a.имя.localeCompare(b.имя));
      return '<div class="tierrow">' +
        '<div class="tierlab ' + (ТИРКЛ[t] || '') + '">' + эк(t) + '</div>' +
        '<div class="ops">' + кто.map(плитка).join('') + '</div></div>';
    }).join('') + '</div>' +
    '<p class="hint">T0 — сильнейшие. Пустой уровень не показывается.</p>';
}

// ── все команды ─────────────────────────────────────────────────────────────
function всеКоманды() {
  const видел = new Set(), строки = [];
  БАЗА.персонажи.forEach(c => (c.команды || []).forEach(k => {
    const ключ = k.split(',').map(s => s.trim()).sort().join('|');
    if (видел.has(ключ)) return;
    видел.add(ключ);
    строки.push(k);
  }));
  const мои = строки.filter(k => доляМоих(k) === 1);
  const блок = (список, имя, подпись) => !список.length ? '' :
    '<div class="cap">' + имя + '<i></i><em>' + подпись + '</em></div>' +
    '<div class="wide">' + список.map(команда).join('') + '</div>';
  return блок(мои, 'Собираются полностью', мои.length + ' из ' + строки.length) +
    блок(строки.filter(k => доляМоих(k) < 1), 'Остальные составы', 'не хватает операторов');
}

function доляМоих(строка) {
  if (!ПРОФ) return 0;
  const имена = строка.split(',').map(s => s.trim());
  const есть = имена.filter(и => {
    const c = БАЗА.персонажи.find(x => (x.имяРу || x.имя) === и || x.имя === и);
    return c && мой(c.id);
  });
  return имена.length ? есть.length / имена.length : 0;
}

function команда(строка) {
  const имена = строка.split(',').map(s => s.trim());
  return '<div class="team">' + имена.map(и => {
    const c = БАЗА.персонажи.find(x => x.имя === и || (x.имяРу || '') === и);
    const есть = c && мой(c.id);
    return '<span class="mem' + (есть ? ' me' : '') + '"' +
      (c ? ' data-op="' + эк(c.id) + '"' : '') + '>' +
      (c ? '<img src="' + эк(АРТЫ + c.арт) + '" alt="" data-nf="hide" loading="lazy">'
         : '<img alt="">') +
      '<span class="who">' + эк(c ? (c.имяРу || c.имя) : и) + '</span></span>';
  }).join('') + '</div>';
}

// ── карточка оператора ──────────────────────────────────────────────────────
function открытьОп(id) {
  const c = БАЗА.персонажи.find(x => x.id === id);
  if (!c) return;
  ОТКРЫТ = id;
  const м = мой(id);
  $('sheet-in').innerHTML =
    '<button class="x" data-close="1">закрыть</button>' +
    '<div class="card" style="--el:#' + эк(c.цвет) + '">' +
      '<div>' +
        '<div class="art"><img src="' + эк(АРТЫ + (c.артБольшой || c.арт)) +
          '" alt="" data-nf="hide"><span class="el"></span></div>' +
        '<div class="tname" style="margin-top:11px">' + эк(c.имяРу || c.имя) +
          '<em>' + эк(c.имя) + '</em></div>' +
        '<div class="chips">' +
          '<span class="chip el">' + эк(c.стихияРу) + '</span>' +
          '<span class="chip">' + эк(c.классРу) + '</span>' +
          '<span class="chip">' + эк(c.оружиеРу) + '</span>' +
          '<span class="chip" style="color:var(--gold)">' + c.редкость + '✦</span>' +
          (c.тир ? '<span class="chip ' + (ТИРКЛ[c.тир] || '') + '">' + эк(c.тир) + '</span>' : '') +
          (м ? '<span class="chip" style="color:var(--acc)">у меня: ур. ' + эк(м.ур) +
               (м.пот ? ', P' + эк(м.пот) : '') + '</span>' : '') +
        '</div>' +
        (c.слаг ? '<p class="hint"><a class="lnk" href="' + эк(РАЗБОР + c.слаг) +
          '" target="_blank" rel="noopener">полный разбор на prydwen' +
          (c.разборОт ? ' · ' + эк(c.разборОт) : '') + '</a></p>' : '') +
      '</div>' +
      '<div>' +
        '<div class="ctabs">' + ВКЛКАРТЫ.map(в =>
          '<button class="ctab' + (в.id === ВКЛК ? ' on' : '') + '" data-ct="' + в.id + '">' +
          эк(в.имя) + '</button>').join('') + '</div>' +
        '<div id="cbody">' + нутроКарточки(c, м) + '</div>' +
      '</div>' +
    '</div>';
  $('sheet').classList.add('on');
}

function нутроКарточки(c, м) {
  if (ВКЛК === 'обзор') return обзор(c, м);
  if (ВКЛК === 'сборка') return сборка(c, м);
  if (ВКЛК === 'команды') return командыОп(c);
  if (ВКЛК === 'рост') return рост(c, м);
  return моё(c, м);
}

function обзор(c, м) {
  const ур = м ? м.ур : 90;
  const s = c.статы[ур] || c.статы[90] || c.макс || {};
  const макс = c.статы[99] || c.макс || {};
  let h = '';

  // Вывод сверху: что надеть и с кем играть — то, ради чего карточку и открывают.
  const оруж1 = (c.лучшееОружие || [])[0];
  const наб1 = (c.лучшиеНаборы || [])[0];
  if (оруж1 || наб1 || c.тир) {
    h += '<div class="verdict" style="margin-bottom:16px"><b>коротко</b>' +
      (c.тир ? 'Оценка <span class="g">' + эк(c.тир) + '</span> в режиме Umbral Monument. ' : '') +
      (оруж1 ? 'Лучшее оружие — <span class="g">' + эк(оруж1.split('|')[0]) + '</span>' +
        ' (' + эк(оруж1.split('|')[1] || 'P0') + '). ' : '') +
      (наб1 ? 'Набор — <span class="g">' + эк(наб1) + '</span>. ' : '') +
      (м ? 'У тебя ур. <span class="g">' + эк(м.ур) + '</span>' +
           (м.пот ? ', потенциал ' + эк(м.пот) : '') + '.' : 'В профиле его нет.') +
      '</div>';
  }

  h += '<div class="card-in">';

  if (!c.безСтатов) {
    h += '<div class="sec full"><h4>характеристики' + (м ? ' на твоём ур. ' + эк(ур) : ' на 90 ур.') +
      '</h4><div class="stats">' +
      [['hp', 'Здоровье'], ['atk', 'Атака'], ['def', 'Защита'], ['cr', 'Крит шанс'],
       ['str', 'Сила'], ['agi', 'Ловкость'], ['wisd', 'Разум'], ['will', 'Воля']]
        .filter(([k]) => s[k] != null)
        .map(([k, имя]) => {
          const рост = макс[k] != null && s[k] != null && макс[k] > s[k]
            ? ' <small>→ ' + чис(макс[k]) + '</small>' : '';
          return '<div class="st"><u>' + имя + '</u><b>' + чис(s[k]) + рост + '</b></div>';
        }).join('') + '</div>' +
      (макс.hp && s.hp !== макс.hp ? '<p class="hint">Серым — значение на 99 уровне.</p>' : '') +
      '</div>';
  } else {
    h += '<div class="sec full"><h4>характеристики</h4><div class="box"><b>нет в дампе</b>' +
      'Оператор вышел после снятия таблиц игры — кривая характеристик появится ' +
      'с обновлением дампа.</div></div>';
  }

  h += '<div class="sec"><h4>кто это</h4><div class="kv">' +
    '<span>Имя в игре</span><b>' + эк(c.имя) + '</b>' +
    '<span>Стихия</span><b style="color:#' + эк(c.цвет) + '">' + эк(c.стихияРу) + '</b>' +
    '<span>Класс</span><b>' + эк(c.классРу) + '</b>' +
    '<span>Оружие</span><b>' + эк(c.оружиеРу) + '</b>' +
    '<span>Ранг</span><b>' + c.редкость + '✦</b>' +
    (c.тир ? '<span>Тир</span><b>' + эк(c.тир) + '</b>' : '') +
    (c.отдел ? '<span>Отдел</span><b>' + эк(c.отдел) + '</b>' : '') +
    (c.разборОт ? '<span>Разбор обновлён</span><b>' + эк(c.разборОт) + '</b>' : '') +
    '</div></div>';

  if ((c.навыки || []).length) {
    h += '<div class="sec"><h4>навыки</h4><div class="rows">' +
      c.навыки.map((н, i) => '<div class="row"><span class="n' + (i === 0 ? ' first' : '') + '">' +
        (i + 1) + '</span>' + эк(н) +
        (м && м.навыки && м.навыки[i] ? '<b>' + м.навыки[i].ур + ' / ' + м.навыки[i].макс + '</b>' : '') +
        '</div>').join('') + '</div></div>';
  }

  const ор = (c.лучшееОружие || []).slice(0, 4);
  if (ор.length) {
    h += '<div class="sec"><h4>оружие по приоритету</h4><div class="rows">' +
      ор.map((o, i) => {
        const [имя, p] = o.split('|');
        const w = БАЗА.оружие.find(x => x.имя === имя);
        return '<div class="row"><span class="n' + (i === 0 ? ' first' : '') + '">' + (i + 1) + '</span>' +
          (w ? '<img src="' + эк(ЗНАЧКИ + '/itemicon/' + w.значок) + '" alt="" data-nf="hide">' : '') +
          эк(имя) + '<b>' + эк(p || '') + '</b></div>';
      }).join('') + '</div></div>';
  }

  const к = (c.команды || []).slice(0, 2);
  if (к.length) {
    h += '<div class="sec full"><h4>с кем играть</h4><div class="wide">' +
      к.map(команда).join('') + '</div></div>';
  }
  return h + '</div>';
}

function сборка(c, м) {
  let h = '<div class="card-in">';
  const ор = c.лучшееОружие || [];
  h += '<div class="sec"><h4>оружие по приоритету</h4>' +
    (ор.length ? '<div class="rows">' + ор.map((o, i) => {
      const [имя, p] = o.split('|');
      const w = БАЗА.оружие.find(x => x.имя === имя);
      return '<div class="row"><span class="n' + (i === 0 ? ' first' : '') + '">' + (i + 1) + '</span>' +
        (w ? '<img src="' + эк(ЗНАЧКИ + '/itemicon/' + w.значок) +
             '" alt="" data-nf="hide" style="width:26px;height:26px;object-fit:contain">' : '') +
        эк(имя) + '<b>' + эк(p || '') + '</b></div>';
    }).join('') + '</div>' : '<div class="box">разбор не нашёлся</div>') +
    '<p class="hint">P0 — без дублей, P5 — с пятью. Порядок из расчётов prydwen.</p></div>';

  const наб = c.лучшиеНаборы || [];
  h += '<div class="sec"><h4>наборы снаряжения</h4>' +
    (наб.length ? '<div class="rows">' + наб.map((n, i) => {
      const наш = найтиНабор(n);
      return '<div class="row"><span class="n' + (i === 0 ? ' first' : '') + '">' + (i + 1) + '</span>' +
        (наш ? '<img src="' + эк(ЗНАЧКИ + '/equipmentlogobigwhite/' + наш.значок) +
               '" alt="" data-nf="hide" style="width:26px;height:26px;object-fit:contain">' : '') +
        эк(n) + (наш ? '<b>T' + (наш.ранг || '?') + '</b>' : '') + '</div>';
    }).join('') + '</div>'
    : '<div class="box"><b>нет рекомендаций</b>У этого оператора на prydwen нет ' +
      'разобранной сборки снаряжения — смотри наборы по стихии и роли.</div>') + '</div>';

  const наши = наб.map(найтиНабор).filter(Boolean);
  if (наши.length) {
    h += '<div class="sec full"><h4>что дают эти наборы</h4><div class="wide">' +
      наши.map(n => '<div class="box"><b>' + эк(n.имя) + '</b>' +
        эк((n.эффектРу || n.эффект || '').slice(0, 240)) + '</div>').join('') + '</div></div>';
  }
  if (c.своёОружие) {
    const w = БАЗА.оружие.find(x => x.id === c.своёОружие);
    if (w) h += '<div class="sec"><h4>стартовое оружие</h4>' + строкаПредмета(w) + '</div>';
  }
  return h + '</div>';
}

function командыОп(c) {
  const к = c.команды || [];
  if (!к.length) return '<div class="box">составов для этого оператора нет</div>';
  return '<div class="rows">' + к.map(k => команда(k)).join('') + '</div>' +
    '<p class="hint">Зелёной рамкой обведены те, кто уже есть у тебя.</p>';
}

function рост(c, м) {
  if (c.безСтатов) return '<div class="box"><b>нет данных</b>Кривая характеристик появится ' +
    'с обновлением дампа таблиц.</div>';
  const ур = м ? м.ур : 90;
  const точки = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99].filter(у => c.статы[у]);
  return '<table class="tbl">' +
    '<tr><th>ур.</th><th>HP</th><th>ATK</th><th>STR</th><th>AGI</th><th>WISD</th><th>WILL</th></tr>' +
    точки.map(у => {
      const t = c.статы[у];
      return '<tr' + (у === ур ? ' class="top"' : '') + '><td>' + у + '</td>' +
        ['hp', 'atk', 'str', 'agi', 'wisd', 'will']
          .map(k => '<td class="n">' + чис(t[k]) + '</td>').join('') + '</tr>';
    }).join('') + '</table>' +
    (м ? '<p class="hint">Подсвечен твой уровень.</p>' : '');
}

function моё(c, м) {
  if (!ПРОФ) return '<div class="box"><b>профиль не подключён</b>Вкладка «Профиль» — ' +
    'введи UID, и сюда подтянутся твои уровни, навыки и снаряжение.</div>';
  if (!м) return '<div class="box"><b>нет в профиле</b>Этого оператора нет среди тех, ' +
    'кого отдаёт витрина. Витрина показывает только выставленных в профиле игры.</div>';
  let h = '';
  const дотянуть = 90 - (м.ур || 0);
  h += '<div class="stats" style="margin-bottom:16px">' +
    '<div class="st acc"><u>уровень</u><b>' + эк(м.ур) +
      (дотянуть > 0 ? '<small> / 90</small>' : '') + '</b></div>' +
    '<div class="st"><u>потенциал</u><b>' + эк(м.пот || 0) + '</b></div>' +
    (м.оружие ? '<div class="st"><u>оружие ур.</u><b>' + эк(м.оружие.weaponLv) + '</b></div>' : '') +
    (м.оружие ? '<div class="st"><u>прорыв оружия</u><b>' + эк(м.оружие.breakthroughLv || 0) + '</b></div>' : '') +
    (м.навыки ? '<div class="st"><u>навыков прокачано</u><b>' +
      м.навыки.filter(н => н.ур >= н.макс).length + '<small> / ' + м.навыки.length + '</small></b></div>' : '') +
    (м.таланты ? '<div class="st"><u>узлов талантов</u><b>' + м.таланты.length + '</b></div>' : '') +
    (м.завод ? '<div class="st"><u>заводских</u><b>' + м.завод.length + '</b></div>' : '') +
    (м.слоты ? '<div class="st"><u>слотов надето</u><b>' + м.слоты.length + '<small> / 4</small></b></div>' : '') +
    '</div>';
  h += '<div class="card-in">';
  h += '<div class="sec"><h4>прокачка</h4><div class="kv">' +
    (м.прорыв ? '<span>Узел прорыва</span><b>' + эк(м.прорыв) + '</b>' : '') +
    (м.пассивки && м.пассивки.length ? '<span>Пассивных веток</span><b>' +
      м.пассивки.length + '</b>' : '') +
    '<span>До 90 уровня</span><b>' + (дотянуть > 0 ? дотянуть : 'готов') + '</b>' +
    '</div></div>';
  if (м.навыки && м.навыки.length) {
    h += '<div class="sec"><h4>уровни навыков</h4><table class="tbl">' +
      м.навыки.map(н => '<tr' + (н.ур >= н.макс ? ' class="top"' : '') + '><td>' + эк(н.имя) +
        '</td><td class="n">' + н.ур + ' / ' + н.макс + '</td></tr>').join('') + '</table></div>';
  }
  if (м.оружие) {
    h += '<div class="sec"><h4>оружие</h4><div class="kv">' +
      '<span>Уровень</span><b>' + эк(м.оружие.weaponLv) + '</b>' +
      '<span>Прорыв</span><b>' + эк(м.оружие.breakthroughLv || 0) + '</b>' +
      '<span>Шаблон</span><b>#' + эк(м.оружие.templateId) + '</b>' +
      '</div><p class="hint">Название витрина не отдаёт — только номер шаблона.</p></div>';
  }
  if (м.слоты && м.слоты.length) {
    h += '<div class="sec"><h4>снаряжение</h4><div class="rows">' +
      м.слоты.map(с => '<div class="row"><span class="n">' + (с.слот + 1) + '</span>' +
        'шаблон #' + эк(с.шаблон) + '<b>' + с.прокачки + ' прокачек</b></div>').join('') +
      '</div></div>';
  }
  return h + '</div>';
}

// ── снаряжение и оружие ─────────────────────────────────────────────────────
function фильтрНаборов() {
  return '<div class="fgrp"><i>ранг набора</i>' + [4, 3, 1].map(r =>
    '<button class="fb' + (Ф.редкость === r ? ' on' : '') +
    '" data-f="редкость" data-v="' + r + '">T' + r + '</button>').join('') + '</div>' +
    '<span class="fcnt">' + БАЗА.наборы.length + ' наборов</span>';
}

function спискомНаборов() {
  const наб = БАЗА.наборы.filter(n => !Ф.редкость || n.ранг === Ф.редкость);
  if (!наб.length) return '<div class="empty">ничего не нашлось</div>';
  return '<div class="list">' + наб.map(n => {
    const вещи = БАЗА.снаряжение.filter(v => v.набор === n.id);
    const кому = БАЗА.персонажи.filter(c => (c.лучшиеНаборы || []).some(x => найтиНабор(x) === n));
    return '<details class="op" style="--el:#ffd046">' +
      '<summary>' +
        '<img class="ava" src="' + эк(ЗНАЧКИ + '/equipmentlogobigwhite/' + (n.значок || '')) +
          '" alt="" data-nf="hide" loading="lazy">' +
        '<span class="nm2">' + эк(n.имяРу || n.имя) +
          '<i>T' + (n.ранг || '?') + ' · предметов: ' + вещи.length +
          (кому.length ? ' · советуют ' + кому.length : '') + '</i></span>' +
      '</summary>' +
      '<div class="op-in"><div class="card-in">' +
        '<div class="sec full"><h4>эффект комплекта</h4><div class="box"><b>' +
          (n.нужно || 3) + ' предмета</b>' + эк(n.эффектРу || n.эффект || '—') + '</div></div>' +
        (кому.length ? '<div class="sec full"><h4>кому советуют</h4><div class="wide">' +
          кому.map(c => '<div class="it" data-op="' + эк(c.id) + '" style="cursor:pointer">' +
            '<img src="' + эк(ЗНАЧКИ + '/charremoteicon/' + c.значок) + '" alt="" data-nf="hide">' +
            '<span><b>' + эк(c.имяРу || c.имя) + '</b><i>' + эк(c.стихияРу) + ' · ' +
            эк(c.классРу) + '</i></span></div>').join('') + '</div></div>' : '') +
        '<div class="sec full"><h4>предметы набора</h4><div class="wide">' +
          вещи.map(строкаВещи).join('') + '</div></div>' +
      '</div></div></details>';
  }).join('') + '</div>';
}

function строкаВещи(v) {
  const осн = v.основной ? (v.основной.тип + ' ' + чис(v.основной.значение)) : '';
  return '<div class="it">' +
    '<img src="' + эк(ЗНАЧКИ + '/itemicon/' + v.значок) + '" alt="" data-nf="hide" loading="lazy">' +
    '<span><b>' + эк(v.имяРу || v.имя) + '</b><i>' + эк(v.частьРу) +
    (v.сУровня ? ' · с ур. ' + v.сУровня : '') +
    (осн ? ' · <span class="num">' + эк(осн) + '</span>' : '') + '</i></span></div>';
}

function фильтрОружия() {
  return '<div class="fgrp"><i>ранг</i>' + [6, 5, 4, 3].map(r =>
    '<button class="fb' + (Ф.редкость === r ? ' on' : '') +
    '" data-f="редкость" data-v="' + r + '">' + r + '✦</button>').join('') + '</div>' +
    '<input class="srch" id="q" placeholder="поиск" value="' + эк(Ф.поиск) + '">' +
    '<span class="fcnt" id="cnt"></span>';
}

function спискомОружия() {
  const q = Ф.поиск.trim().toLowerCase();
  const сп = БАЗА.оружие.filter(w =>
    (!Ф.редкость || w.редкость === Ф.редкость) && (!q || w.имя.toLowerCase().includes(q)));
  setTimeout(() => {
    const c = $('cnt'); if (c) c.textContent = сп.length + ' из ' + БАЗА.оружие.length;
  }, 0);
  if (!сп.length) return '<div class="empty">ничего не нашлось</div>';
  return '<div class="wide">' + сп.map(строкаПредмета).join('') + '</div>';
}

function строкаПредмета(w) {
  // Кому это оружие советуют: список собран из разборов prydwen.
  const кому = БАЗА.персонажи.filter(c => (c.лучшееОружие || []).some(o => o.split('|')[0] === w.имя));
  return '<div class="it">' +
    '<img src="' + эк(ЗНАЧКИ + '/itemicon/' + w.значок) + '" alt="" data-nf="hide" loading="lazy">' +
    '<span><b class="r' + w.редкость + '">' + эк(w.имяРу || w.имя) + '</b>' +
    '<i>' + w.редкость + '✦' + (кому.length ? ' · советуют ' + кому.length : '') + '</i></span></div>';
}

// ── профиль ─────────────────────────────────────────────────────────────────
function профильHtml() {
  const uid = localStorage.getItem(LS_UID) || '';
  let h = '<div class="cap">Синхронизация<i></i><em>enka.network</em></div>' +
    '<div class="box" style="max-width:640px"><b>UID из игры</b>' +
      '<div class="fld">' +
        '<input id="uid" inputmode="numeric" placeholder="например 6432642365" value="' + эк(uid) + '">' +
        '<button class="btn" data-act="load">Обновить</button>' +
        (uid ? '<button class="btn sec2" data-act="forget">Забыть</button>' : '') +
      '</div>' +
      '<div class="say">UID запоминается, витрина тянется сама при каждом заходе. ' +
      'Чтобы данные в игре обновились, выйди из аккаунта и вернись.</div></div>';

  if (ПРОФ) {
    const д = (ПРОФ.домены || []).map(x => x.domainId + ' ур.' + x.level).join(', ');
    h += '<div class="cap">' + эк(ПРОФ.имя || 'профиль') + '<i></i><em>UID ' + эк(ПРОФ.uid) + '</em></div>' +
      '<div class="wide">' +
        плитка2('Уровень', ПРОФ.ур) + плитка2('Уровень мира', ПРОФ.мир) +
        плитка2('Операторов', ПРОФ.всего) + плитка2('Оружия', ПРОФ.оружий) +
        плитка2('Записей', ПРОФ.записей) + плитка2('Достижений', ПРОФ.достижения) +
      '</div>' +
      (д ? '<div class="box" style="margin-top:9px"><b>развитие доменов</b>' + эк(д) + '</div>' : '') +
      '<div class="cap">Кто на витрине<i></i><em>клик открывает карточку</em></div>' +
      '<div class="ops">' + Object.keys(ПРОФ.оп).map(id => {
        const c = БАЗА.персонажи.find(x => x.id === id);
        return c ? плитка(c) : '';
      }).join('') + '</div>' +
      '<p class="hint">Витрина отдаёт подробности только по тем, кого ты выставил в профиле ' +
      'игры (обычно четверо). Остальные операторы известны только уровнем.</p>';
  }
  return h;
}

// ── боевая хроника skport ───────────────────────────────────────────────────
// Их API отвечает только на подписанные запросы: нужны два ключа, которые
// лежат в браузере на их сайте. Человек приносит их одной строкой, дальше
// страница ходит к skport напрямую — ни ключи, ни ответы через наш сервер не
// идут. Подпись считает sk-sign.js.
const КОМАНДА = "copy(localStorage.getItem('SK_OAUTH_CRED_KEY')+'|'+localStorage.getItem('SK_TOKEN_CACHE_KEY'))";
const LS_CHR = 'ef-chr';
let ХРОНИКА = null;

// У skport два набора адресов: /web/... для сайта и /api/... для приложения.
// Что именно живо на конкретном разделе — заранее неизвестно, поэтому у
// каждого пункта список кандидатов: берём первый, который ответил.
const РАЗДЕЛЫ = [
  { имя: 'аккаунт', пути: ['/web/v2/user', '/api/v2/user'] },
  // /web/v1/game/player/binding отдаёт 404: у раздела игроков живёт только
  // ветка /api/. Проверено запросом без входа: 404 против 401.
  { имя: 'мои персонажи', пути: ['/api/v1/game/player/binding',
                                 '/api/v1/game/player/info',
                                 '/api/v1/game/player/asset-show'] },
  { имя: 'хроника', роль: true, пути: ['/web/v1/game/endfield/card/detail',
                                       '/api/v1/game/endfield/card/detail'] },
  { имя: 'эхо войны', роль: true, пути: ['/web/v1/game/endfield/card/war-echoes',
                                         '/api/v1/game/endfield/card/war-echoes'] },
  { имя: 'контракт', роль: true, пути: ['/web/v1/game/endfield/card/crisis-contract',
                                        '/api/v1/game/endfield/card/crisis-contract'] },
  { имя: 'операторы', роль: true, пути: ['/web/v1/game/endfield/search-chars',
                                         '/api/v1/game/endfield/search-chars'] },
  { имя: 'оружие', роль: true, пути: ['/web/v1/game/endfield/search-weapons',
                                      '/api/v1/game/endfield/search-weapons'] },
];

function взятьХронику() {
  try { return JSON.parse(localStorage.getItem(LS_CHR)) || null; } catch (e) { return null; }
}

function хроникаHtml() {
  ХРОНИКА = ХРОНИКА || взятьХронику();
  const есть = !!skКлючи();
  let h = '<div class="cap">Боевая хроника<i></i><em>skport</em></div>';

  h += '<div class="box" style="max-width:860px"><b>' +
      (есть ? 'ключ подключён' : 'подключить за два шага') + '</b>' +
    '<div class="rows" style="margin-bottom:10px">' +
      '<div class="row"><span class="n first">1</span>На www.skport.com (залогиненным) ' +
        'открой F12 → Console, вставь строку ниже и нажми Enter — она скопирует ключ ' +
        'в буфер</div>' +
      '<div class="row"><span class="n">2</span>Вставь его сюда и нажми «Подключить»</div>' +
    '</div>' +
    '<div class="fld"><input readonly id="cmd" value="' + эк(КОМАНДА) + '">' +
      '<button class="btn sec2" data-act="copy-cmd">Скопировать команду</button></div>' +
    '<div class="fld"><input id="skkeys" type="password" placeholder="' +
      (есть ? 'ключ сохранён — вставь новый, чтобы заменить' : 'вставь скопированное') + '">' +
      '<button class="btn" data-act="sk-save">Подключить</button>' +
      (есть ? '<button class="btn sec2" data-act="sk-forget">Забыть</button>' : '') +
    '</div>' +
    '<div class="say" id="skstatus">Ключ хранится только в этом браузере. Запросы идут ' +
      'с твоей машины прямо на skport, мимо нашего сервера.</div></div>';

  if (есть) {
    h += '<div class="fbar" style="margin-top:12px">' +
      '<button class="fb" data-act="sk-load">Обновить хронику</button></div>';
  }
  h += '<div id="skbody">' + (ХРОНИКА ? рисоватьХронику() : '') + '</div>';
  return h;
}

// roleId может лежать где угодно в ответе, поэтому ищем по всему дереву.
function ролиИз(о, гл) {
  гл = гл || 0;
  if (!о || typeof о !== 'object' || гл > 6) return null;
  if (Array.isArray(о)) {
    for (const x of о) { const р = ролиИз(x, гл + 1); if (р) return р; }
    return null;
  }
  const id = о.roleId || о.role_id || о.uid || о.gameUid || о.game_uid;
  // Берём только похожее на игровой идентификатор: длинное число.
  if (id && /^\d{6,}$/.test(String(id))) {
    return { roleId: String(о.roleId || о.role_id || id), uid: String(о.uid || о.gameUid || id) };
  }
  for (const v of Object.values(о)) { const р = ролиИз(v, гл + 1); if (р) return р; }
  return null;
}

async function грузитьХронику() {
  const тело = $('skbody'), ст = $('skstatus');
  тело.innerHTML = '<div class="empty">спрашиваю skport…</div>';
  const собрано = {}; const лог = [];
  let роль = null;
  for (const р of РАЗДЕЛЫ) {
    if (р.роль && !роль) { лог.push('· ' + р.имя + ' — пропуск: не знаю roleId'); continue; }
    let ладно = false, последняя = '';
    for (const путь of р.пути) {
      try {
        const о = await skЗапрос(путь, роль ? { roleId: роль.roleId, uid: роль.uid } : undefined);
        if (о && о.code !== undefined && о.code !== 0) {
          последняя = 'отказ: ' + (о.message || о.code);
          continue;
        }
        собрано[путь] = о;
        if (!роль) { const н = ролиИз(о); if (н) { роль = н; лог.push('  нашёл игровой id'); } }
        лог.push('✓ ' + р.имя + ' <span style="color:#585c67">' + эк(путь) + '</span>');
        ладно = true;
        break;
      } catch (e) {
        последняя = e.message;
      }
    }
    if (!ладно) лог.push('· ' + р.имя + ' — ' + эк(последняя));
  }
  if (ст) ст.innerHTML = лог.join('<br>');
  if (!Object.keys(собрано).length) {
    тело.innerHTML = '<div class="box"><b>ничего не пришло</b>Скорее всего ключ устарел: ' +
      'зайди на skport заново и повтори команду.</div>';
    return;
  }
  ХРОНИКА = { снято: new Date().toISOString(), разделы: собрано };
  try { localStorage.setItem(LS_CHR, JSON.stringify(ХРОНИКА)); } catch (e) {}
  тело.innerHTML = рисоватьХронику();
}

// Ответы skport видим впервые, поэтому сначала показываем их разборчиво:
// числа и строки — таблицей, вложенное — раскрывающимися блоками. Как станет
// понятно, что внутри, соберём нормальные карточки.
function рисоватьХронику() {
  const р = (ХРОНИКА && ХРОНИКА.разделы) || {};
  const ключи = Object.keys(р);
  if (!ключи.length) return '';
  const когда = ХРОНИКА.снято ? new Date(ХРОНИКА.снято).toLocaleString('ru') : '';
  const имя = п => (РАЗДЕЛЫ.find(x => (x.пути || []).indexOf(п) >= 0) || {}).имя || п;
  return '<div class="cap">Что пришло<i></i><em>' + эк(когда) + '</em></div>' +
    '<div class="list">' + ключи.map(k =>
      '<details class="op" style="--el:#ffd046"><summary><span class="nm2">' +
      эк(имя(k)) + '<i>' + эк(k) + '</i></span></summary><div class="op-in">' +
      дерево(р[k] && р[k].data !== undefined ? р[k].data : р[k], 0) +
      '</div></details>').join('') + '</div>';
}

function дерево(о, гл) {
  if (о == null) return '<div class="row">пусто</div>';
  if (typeof о !== 'object') return '<div class="row">' + эк(String(о)) + '</div>';
  if (Array.isArray(о)) {
    if (!о.length) return '<div class="row">пустой список</div>';
    return '<div class="rows">' + о.slice(0, 40).map((x, i) =>
      (x && typeof x === 'object'
        ? '<details class="op"><summary><span class="nm2">запись ' + (i + 1) +
          '<i>' + эк(Object.keys(x).slice(0, 4).join(', ')) + '</i></span></summary>' +
          '<div class="op-in">' + дерево(x, гл + 1) + '</div></details>'
        : '<div class="row"><span class="n">' + (i + 1) + '</span>' + эк(String(x)) + '</div>')
    ).join('') + '</div>';
  }
  const пары = Object.entries(о);
  const простые = пары.filter(([, v]) => v == null || typeof v !== 'object');
  const сложные = пары.filter(([, v]) => v && typeof v === 'object');
  let h = '';
  if (простые.length) {
    h += '<div class="kv">' + простые.map(([k, v]) =>
      '<span>' + эк(k) + '</span><b>' + эк(String(v)).slice(0, 80) + '</b>').join('') + '</div>';
  }
  if (сложные.length && гл < 4) {
    h += '<div class="rows" style="margin-top:8px">' + сложные.map(([k, v]) =>
      '<details class="op"><summary><span class="nm2">' + эк(k) +
      '<i>' + (Array.isArray(v) ? v.length + ' записей' : 'объект') + '</i></span></summary>' +
      '<div class="op-in">' + дерево(v, гл + 1) + '</div></details>').join('') + '</div>';
  }
  return h || '<div class="row">нет полей</div>';
}

function плитка2(имя, знач) {
  return '<div class="box"><b>' + эк(имя) + '</b>' +
    '<span class="num" style="font-size:19px">' + эк(знач == null ? '—' : знач) + '</span></div>';
}

function имяНавыка(id) {
  const s = String(id || '');
  if (/NormalAttack/i.test(s)) return 'Обычная атака';
  if (/NormalSkill/i.test(s)) return 'Навык';
  if (/UltimateSkill/i.test(s)) return 'Ультимейт';
  if (/ComboSkill/i.test(s)) return 'Связка';
  if (/talent/i.test(s)) return 'Талант';
  return s.replace(/^chr_\d+_[a-z]+_/i, '');
}

// ── события ─────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  // Хроника: выбор раздела и выбор игрового аккаунта
  const ск = e.target.closest('[data-sk]');
  if (ск) { грузитьХронику(ск.dataset.sk); return; }
  const рл = e.target.closest('[data-role]');
  if (рл) {
    localStorage.setItem('ef-role', рл.dataset.role);
    грузитьХронику('detail');
    return;
  }
  const т = e.target.closest('[data-tab],[data-f],[data-act],[data-op],[data-close],[data-ct]');
  if (!т) { if (e.target.id === 'sheet') закрыть(); return; }
  if (т.dataset.close) { закрыть(); return; }
  if (т.dataset.ct) {
    ВКЛК = т.dataset.ct;
    if (ОТКРЫТ) открытьОп(ОТКРЫТ);
  } else if (т.dataset.op) {
    ВКЛК = 'обзор';
    открытьОп(т.dataset.op);
  } else if (т.dataset.tab) {
    ВКЛ = т.dataset.tab; Ф.редкость = 0; Ф.поиск = '';
    рисовать();
  } else if (т.dataset.f) {
    const п = т.dataset.f;
    if (п === 'свои') Ф.свои = !Ф.свои;
    else {
      const v = п === 'редкость' ? +т.dataset.v : т.dataset.v;
      Ф[п] = (Ф[п] === v) ? (п === 'редкость' ? 0 : '') : v;
    }
    рисовать();
  } else if (т.dataset.act === 'load') {
    const uid = ($('uid').value || '').replace(/\D+/g, '');
    if (uid.length < 6) { alert('UID — это число из профиля в игре'); return; }
    синхра(uid, false);
  } else if (т.dataset.act === 'forget') {
    localStorage.removeItem(LS_UID); localStorage.removeItem(LS_PROF);
    ПРОФ = null; обновитьКнопку(); рисовать();
  } else if (т.dataset.act === 'copy-cmd') {
    const п = $('cmd');
    п.select();
    navigator.clipboard.writeText(п.value).then(
      () => { т.textContent = 'скопировано'; },
      () => { т.textContent = 'выдели и скопируй сам'; });
  } else if (т.dataset.act === 'chr-forget') {
    localStorage.removeItem(LS_CHR); ХРОНИКА = null; рисовать();
  } else if (т.dataset.act === 'sk-save') {
    const v = ($('skkeys').value || '').trim().replace(/^"|"$/g, '');
    if (v.split('|').length !== 2 || v.length < 20) {
      alert('Нужна строка вида cred|токен — её даёт команда выше'); return;
    }
    localStorage.setItem(SK_КЛЮЧИ, v);
    $('skkeys').value = '';
    рисовать();
    грузитьХронику();
  } else if (т.dataset.act === 'sk-load') {
    грузитьХронику();
  } else if (т.dataset.act === 'sk-forget') {
    localStorage.removeItem(SK_КЛЮЧИ); localStorage.removeItem(LS_CHR);
    ХРОНИКА = null; рисовать();
  }
});

function закрыть() { $('sheet').classList.remove('on'); ОТКРЫТ = null; }

document.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  Ф.поиск = e.target.value;
  $('body').innerHTML = ВКЛ === 'ops' ? витрина() : спискомОружия();
});

// Битые картинки прячем. Событие error не всплывает, поэтому слушаем на
// перехвате — иначе обработчик на документе просто не сработает.
document.addEventListener('error', e => {
  const э = e.target;
  if (э && э.tagName === 'IMG' && э.dataset.nf === 'hide') э.style.visibility = 'hidden';
}, true);

document.addEventListener('keydown', e => { if (e.key === 'Escape') закрыть(); });

$('up').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('sync').addEventListener('click', () => {
  const uid = localStorage.getItem(LS_UID);
  if (uid) синхра(uid, false); else { ВКЛ = 'prof'; рисовать(); }
});
$('ver').addEventListener('click', () => {
  $('sheet-in').innerHTML = '<button class="x" data-close="1">закрыть</button>' +
    '<div class="cap">Откуда данные<i></i><em>' + APP_VER + '</em></div>' +
    '<table class="tbl">' +
      '<tr><td>Операторы, снаряжение, оружие</td><td>таблицы игры, дамп 22.06.2026</td></tr>' +
      '<tr><td>Тиры, приоритет оружия, наборы, команды</td><td>разборы prydwen.gg</td></tr>' +
      '<tr><td>Арты операторов</td><td>prydwen.gg</td></tr>' +
      '<tr><td>Значки предметов</td><td>enka.network</td></tr>' +
      '<tr><td>Витрина профиля</td><td>enka.network/api/ef через свой воркер</td></tr>' +
    '</table>' +
    '<p class="hint">Тексты обзоров не копируются: в карточке стоит ссылка на исходный ' +
    'разбор. Дамп таблиц отстаёт от игры — у новых операторов нет кривой характеристик. ' +
    'Оружие и снаряжение витрина отдаёт номерами шаблонов, таблицы с этими номерами ' +
    'в открытых источниках пока нет.</p>';
  $('sheet').classList.add('on');
});

старт();
