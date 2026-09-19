// Справочник Arknights: Endfield. Весь код страницы — здесь.
//
// Устройство такое же, как у трекера ZZZ: главная — витрина плиток с артами,
// клик по плитке открывает карточку в панели поверх страницы. Профиль с
// витрины enka подтягивается сам при каждом заходе и накладывается на плитки:
// уровень, потенциал, уровни навыков.
//
// В разметке нет ни одного onclick — политика безопасности запрещает
// inline-скрипты, поэтому события ловятся делегированием на документе.

'use strict';

const APP_VER = 'v2';
const ЗНАЧКИ = 'https://enka.network/ui/ef';
const АРТЫ = 'https://cdn.prydwen.gg/images/arknights-endfield/characters/';
const ВОРКЕР = 'https://alextask-push.12dogswog76.workers.dev';
const LS_UID = 'ef-uid';
const LS_PROF = 'ef-prof';        // последняя витрина: показываем сразу, до ответа сети

const $ = id => document.getElementById(id);
const эк = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const чис = n => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('ru'));

let БАЗА = null;
let ВКЛ = 'ops';
let ПРОФ = null;                  // разобранная витрина: {uid, имя, ур, мир, оп:{id:{…}}}
const Ф = { стихия: '', класс: '', редкость: 0, оружие: '', поиск: '', свои: false };

const ВКЛАДКИ = [
  { id: 'ops',  имя: 'Операторы' },
  { id: 'gear', имя: 'Снаряжение' },
  { id: 'wpn',  имя: 'Оружие' },
  { id: 'prof', имя: 'Профиль' },
];

// ── старт ───────────────────────────────────────────────────────────────────
async function старт() {
  рисоватьВкладки();
  версияВоркера();
  ПРОФ = взятьСохранённый();
  обновитьКнопку();

  try {
    const r = await fetch('ef-db.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('ef-db.json: ' + r.status);
    БАЗА = await r.json();
  } catch (e) {
    $('body').innerHTML = '<div class="empty">база не загрузилась: ' + эк(e.message) + '</div>';
    return;
  }
  $('src').textContent = 'Данные: ' + БАЗА.источник + '. Арты — prydwen.gg. ' +
    'Операторов ' + БАЗА.персонажи.length + ', оружия ' + БАЗА.оружие.length +
    ', снаряжения ' + БАЗА.снаряжение.length + ', наборов ' + БАЗА.наборы.length + '.';
  рисовать();

  // Синхронизация постоянная: UID сохранён — тянем свежую витрину сразу, без
  // кнопок. Показанное из памяти при этом уже на экране.
  const uid = localStorage.getItem(LS_UID);
  if (uid) синхра(uid, true);
}

async function версияВоркера() {
  try {
    const r = await fetch(ВОРКЕР + '/api/ef/ping', { cache: 'no-store' });
    const j = await r.json();
    $('ver').innerHTML = APP_VER + ' <b>· воркер ' + эк(j.v) + '</b>';
  } catch (e) {
    $('ver').innerHTML = APP_VER + ' <b>· воркер не отвечает</b>';
  }
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
  else if (ВКЛ === 'gear') { фб.innerHTML = фильтрНаборов(); тело.innerHTML = спискомНаборов(); }
  else if (ВКЛ === 'wpn') { фб.innerHTML = фильтрОружия(); тело.innerHTML = спискомОружия(); }
  else { фб.innerHTML = ''; тело.innerHTML = профильHtml(); }
}

// ── профиль: разбор и хранение ──────────────────────────────────────────────
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
  (д.charData || []).forEach(ч => {
    const id = ктоЭто(ч);
    if (!id) return;
    оп[id] = {
      ур: ч.level, пот: ч.potentialLevel || 0,
      навыки: ((ч.skillInfo || {}).levelInfo || []).map(н => ({
        имя: имяНавыка(н.skillId), ур: н.skillLevel, макс: н.skillMaxLevel })),
      оружие: ч.weapon || null,
      слоты: (ч.equip || []).length,
      таланты: (ч.talent || {}).attrNodes || [],
    };
  });
  // Список «есть у меня» шире витрины: в карточке профиля игра отдаёт четверых,
  // а в charList — тех, кого игрок вывел на витрину профиля.
  (и.charList || []).forEach(c => {
    const id = c.templateId;
    if (!id) return;
    оп[id] = Object.assign({ ур: c.level, пот: c.potentialLevel || 0 }, оп[id] || {});
  });
  return {
    uid: д.uid, имя: к.name || '', ур: к.adventureLevel, мир: к.worldLevel,
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
    if (ВКЛ === 'ops' || ВКЛ === 'prof') рисовать();
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

// ── витрина операторов ──────────────────────────────────────────────────────
function фильтрыОператоров() {
  const чип = (тип, знач, текст, цвет) =>
    '<button class="fb' + (Ф[тип] === знач ? ' on' : '') + '" data-f="' + тип +
    '" data-v="' + эк(знач) + '"' + (цвет ? ' style="color:#' + цвет + '"' : '') + '>' +
    эк(текст) + '</button>';
  const уник = поле => [...new Set(БАЗА.персонажи.map(c => c[поле]))];
  return '' +
    '<div class="fgrp"><i>стихия</i>' + уник('стихия').map(s => {
      const о = БАЗА.персонажи.find(c => c.стихия === s);
      return чип('стихия', s, о.стихияРу, Ф.стихия === s ? '' : о.цвет);
    }).join('') + '</div>' +
    '<div class="fgrp"><i>класс</i>' + уник('класс').map(k =>
      чип('класс', k, БАЗА.персонажи.find(c => c.класс === k).классРу)).join('') + '</div>' +
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
    (!Ф.свои || (ПРОФ && ПРОФ.оп[c.id])) &&
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
  const мой = ПРОФ && ПРОФ.оп[c.id];
  return '<button class="tile" style="--el:#' + эк(c.цвет) + '" data-op="' + эк(c.id) + '">' +
    '<img src="' + эк(АРТЫ + c.арт) + '" alt="" loading="lazy" data-nf="hide">' +
    '<span class="sh"></span><span class="el"></span>' +
    '<span class="rk">' + c.редкость + '✦</span>' +
    (мой ? '<span class="lv">' + эк(мой.ур) + '</span>' +
           (мой.пот ? '<span class="pot">P' + эк(мой.пот) + '</span>' : '')
         : '<span class="lv no">нет</span>') +
    '<span class="info">' +
      '<span class="nm">' + эк(c.имяРу || c.имя) + '</span>' +
      '<span class="sub">' + эк(c.стихияРу) + ' · ' + эк(c.классРу) + '</span>' +
    '</span>' +
  '</button>';
}

// ── карточка оператора в панели ─────────────────────────────────────────────
function открытьОп(id) {
  const c = БАЗА.персонажи.find(x => x.id === id);
  if (!c) return;
  const мой = ПРОФ && ПРОФ.оп[id];
  const ур = мой ? мой.ур : 90;
  const s = c.статы[ур] || c.статы[90] || c.макс || {};

  let прав = '';
  прав += '<div class="sec"><h4>кто это</h4><div class="kv">' +
    '<span>Имя в игре</span><b>' + эк(c.имя) + '</b>' +
    '<span>Стихия</span><b style="color:#' + эк(c.цвет) + '">' + эк(c.стихияРу) + '</b>' +
    '<span>Класс</span><b>' + эк(c.классРу) + '</b>' +
    '<span>Оружие</span><b>' + эк(c.оружиеРу) + '</b>' +
    (c.отдел ? '<span>Отдел</span><b>' + эк(c.отдел) + '</b>' : '') +
    (мой ? '<span>Мой уровень</span><b>' + эк(мой.ур) + '</b>' +
           (мой.пот ? '<span>Потенциал</span><b>' + эк(мой.пот) + '</b>' : '') : '') +
    '</div></div>';

  if (c.безСтатов) {
    прав += '<div class="sec"><h4>характеристики</h4><div class="box"><b>нет в дампе</b>' +
      'Оператор вышел после снятия таблиц игры: имя, класс и стихия известны, ' +
      'кривая характеристик появится с обновлением дампа.</div></div>';
  } else {
    прав += '<div class="sec"><h4>характеристики' +
      (мой ? ' на уровне ' + эк(ур) : ' на 90 уровне') + '</h4><div class="kv">' +
      [['hp', 'Здоровье'], ['atk', 'Атака'], ['def', 'Защита'],
       ['str', 'Сила'], ['agi', 'Ловкость'], ['wisd', 'Разум'], ['will', 'Воля']]
        .filter(([k]) => s[k] != null)
        .map(([k, имя]) => '<span>' + имя + '</span><b>' + чис(s[k]) + '</b>').join('') +
      '</div></div>';
  }

  if (мой && мой.навыки && мой.навыки.length) {
    прав += '<div class="sec"><h4>мои навыки</h4><table class="tbl">' +
      мой.навыки.map(н => '<tr' + (н.ур >= н.макс ? ' class="top"' : '') + '>' +
        '<td>' + эк(н.имя) + '</td><td class="n">' + н.ур + ' / ' + н.макс + '</td></tr>').join('') +
      '</table></div>';
    if (мой.оружие) {
      прав += '<div class="sec"><h4>моё оружие</h4><div class="box">' +
        '<b>номер ' + эк(мой.оружие.templateId) + '</b>' +
        'Уровень <span class="num">' + эк(мой.оружие.weaponLv) + '</span>, ' +
        'прорыв <span class="num">' + эк(мой.оружие.breakthroughLv || 0) + '</span>. ' +
        'Названия витрина не отдаёт — только номер шаблона.</div></div>';
    }
  }

  if (!c.безСтатов) {
    const точки = [1, 20, 40, 60, 80, 90, 99].filter(у => c.статы[у]);
    прав += '<div class="sec full"><h4>рост по уровням</h4><table class="tbl">' +
      '<tr><th>ур.</th><th>HP</th><th>ATK</th><th>STR</th><th>AGI</th><th>WISD</th><th>WILL</th></tr>' +
      точки.map(у => {
        const t = c.статы[у];
        return '<tr' + (у === ур ? ' class="top"' : '') + '><td>' + у + '</td>' +
          ['hp', 'atk', 'str', 'agi', 'wisd', 'will']
            .map(k => '<td class="n">' + чис(t[k]) + '</td>').join('') + '</tr>';
      }).join('') + '</table></div>';
  }

  if (c.своёОружие) {
    const w = БАЗА.оружие.find(x => x.id === c.своёОружие);
    if (w) прав += '<div class="sec"><h4>стартовое оружие</h4>' + строкаПредмета(w) + '</div>';
  }

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
          (мой ? '<span class="chip" style="color:var(--acc)">у меня: ' + эк(мой.ур) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card-in">' + прав + '</div>' +
    '</div>';
  $('sheet').classList.add('on');
}

// ── снаряжение ──────────────────────────────────────────────────────────────
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
    return '<details class="op" style="--el:#ffd046">' +
      '<summary>' +
        '<img class="ava" src="' + эк(ЗНАЧКИ + '/equipmentlogobigwhite/' + (n.значок || '')) +
          '" alt="" data-nf="hide" loading="lazy">' +
        '<span class="nm2">' + эк(n.имяРу || n.имя) +
          '<i>T' + (n.ранг || '?') + ' · предметов: ' + вещи.length + '</i></span>' +
      '</summary>' +
      '<div class="op-in"><div class="card-in">' +
        '<div class="sec full"><h4>эффект комплекта</h4><div class="box"><b>' +
          (n.нужно || 3) + ' предмета</b>' + эк(n.эффектРу || n.эффект || '—') + '</div></div>' +
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

// ── оружие ──────────────────────────────────────────────────────────────────
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
  return '<div class="it">' +
    '<img src="' + эк(ЗНАЧКИ + '/itemicon/' + w.значок) + '" alt="" data-nf="hide" loading="lazy">' +
    '<span><b class="r' + w.редкость + '">' + эк(w.имяРу || w.имя) + '</b>' +
    '<i>' + w.редкость + '✦</i></span></div>';
}

// ── вкладка профиля ─────────────────────────────────────────────────────────
function профильHtml() {
  const uid = localStorage.getItem(LS_UID) || '';
  let h = '<div class="cap">Синхронизация<i></i><em>enka.network</em></div>' +
    '<div class="box" style="max-width:640px"><b>UID из игры</b>' +
      '<div class="fld">' +
        '<input id="uid" inputmode="numeric" placeholder="например 6432642365" value="' + эк(uid) + '">' +
        '<button class="btn" data-act="load">Обновить</button>' +
        (uid ? '<button class="btn sec2" data-act="forget">Забыть</button>' : '') +
      '</div>' +
      '<div class="say">UID запоминается, и витрина подтягивается сама при каждом заходе. ' +
      'Чтобы в игре обновились данные, выйди из аккаунта и вернись.</div></div>';

  if (ПРОФ) {
    h += '<div class="cap">' + эк(ПРОФ.имя || 'профиль') + '<i></i><em>UID ' + эк(ПРОФ.uid) + '</em></div>' +
      '<div class="wide">' +
        плитка2('Уровень', ПРОФ.ур) + плитка2('Уровень мира', ПРОФ.мир) +
        плитка2('Операторов', ПРОФ.всего) + плитка2('Оружия', ПРОФ.оружий) +
        плитка2('Записей', ПРОФ.записей) +
        плитка2('На витрине', Object.keys(ПРОФ.оп).length) +
      '</div>' +
      '<div class="cap">Кто на витрине<i></i><em>клик открывает карточку</em></div>' +
      '<div class="ops">' + Object.keys(ПРОФ.оп).map(id => {
        const c = БАЗА.персонажи.find(x => x.id === id);
        return c ? плитка(c) : '';
      }).join('') + '</div>';
  }
  return h;
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
  const т = e.target.closest('[data-tab],[data-f],[data-act],[data-op],[data-close]');
  if (!т) {
    if (e.target.id === 'sheet') $('sheet').classList.remove('on');
    return;
  }
  if (т.dataset.close) { $('sheet').classList.remove('on'); return; }
  if (т.dataset.tab) {
    ВКЛ = т.dataset.tab; Ф.редкость = 0; Ф.поиск = '';
    рисовать();
  } else if (т.dataset.op) {
    открытьОп(т.dataset.op);
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
  }
});

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

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('sheet').classList.remove('on');
});

$('up').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('sync').addEventListener('click', () => {
  const uid = localStorage.getItem(LS_UID);
  if (uid) синхра(uid, false);
  else { ВКЛ = 'prof'; рисовать(); }
});
$('ver').addEventListener('click', () => {
  $('sheet-in').innerHTML = '<button class="x" data-close="1">закрыть</button>' +
    '<div class="cap">Откуда данные<i></i><em>' + APP_VER + '</em></div>' +
    '<table class="tbl">' +
      '<tr><td>Операторы, снаряжение, оружие</td><td>таблицы игры, дамп 22.06.2026</td></tr>' +
      '<tr><td>Наборы и их эффекты</td><td>таблицы игры, состав сверен отдельно</td></tr>' +
      '<tr><td>Арты операторов</td><td>prydwen.gg</td></tr>' +
      '<tr><td>Значки предметов</td><td>enka.network</td></tr>' +
      '<tr><td>Витрина профиля</td><td>enka.network/api/ef через свой воркер</td></tr>' +
    '</table>' +
    '<p class="hint">Дамп таблиц отстаёт от игры: у операторов, вышедших позже, ' +
    'нет кривой характеристик. Оружие и снаряжение витрина отдаёт номерами ' +
    'шаблонов, а таблицы с этими номерами в открытых источниках пока нет.</p>';
  $('sheet').classList.add('on');
});

старт();
