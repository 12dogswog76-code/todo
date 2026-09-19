// Справочник Arknights: Endfield. Весь код страницы — здесь.
//
// Почему отдельным файлом: политика безопасности страницы не разрешает
// inline-скрипты, и по той же причине в разметке нет ни одного onclick —
// события навешиваются делегированием на документе, а что делать, написано
// в data-атрибутах.
//
// Данные: ef-db.json (собирается build-ef-db.py из таблиц игры).
// Значки: enka.network — там лежат картинки предметов и операторов.
// Витрина профиля: enka.network/api/ef/uid/<UID> через наш воркер.

'use strict';

const APP_VER = 'v1';
const ЗНАЧКИ = 'https://enka.network/ui/ef';
const ВИТРИНА = 'https://alextask.ru/api/ef/uid/';
const LS_UID = 'ef-uid';

const $ = id => document.getElementById(id);
const эк = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const чис = n => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('ru'));

let БАЗА = null;
let ВКЛ = 'ops';
// Фильтры живут отдельно от отрисовки: любой из них меняет только это,
// а перерисовка всегда одна и та же.
const Ф = { стихия: '', класс: '', редкость: 0, оружие: '', поиск: '' };

const ВКЛАДКИ = [
  { id: 'ops',   имя: 'Операторы' },
  { id: 'gear',  имя: 'Снаряжение' },
  { id: 'wpn',   имя: 'Оружие' },
  { id: 'me',    имя: 'Мой профиль' },
];

// ── загрузка ────────────────────────────────────────────────────────────────
async function старт() {
  $('ver').textContent = APP_VER;
  рисоватьВкладки();
  try {
    const r = await fetch('ef-db.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('ef-db.json: ' + r.status);
    БАЗА = await r.json();
  } catch (e) {
    $('body').innerHTML = '<div class="empty">база не загрузилась: ' + эк(e.message) + '</div>';
    return;
  }
  $('src').textContent = 'Данные: ' + БАЗА.источник +
    '. Персонажей ' + БАЗА.персонажи.length + ', оружия ' + БАЗА.оружие.length +
    ', снаряжения ' + БАЗА.снаряжение.length + ', наборов ' + БАЗА.наборы.length + '.';
  рисовать();
}

function рисоватьВкладки() {
  $('tabs').innerHTML = ВКЛАДКИ.map(в =>
    '<button class="tab' + (в.id === ВКЛ ? ' on' : '') + '" data-tab="' + в.id + '">' +
    эк(в.имя) + '</button>').join('');
}

function рисовать() {
  рисоватьВкладки();
  const тело = $('body'), фб = $('fbar');
  if (ВКЛ === 'ops') { фб.innerHTML = фильтрыОператоров(); тело.innerHTML = спискомОператоров(); }
  else if (ВКЛ === 'gear') { фб.innerHTML = фильтрНаборов(); тело.innerHTML = спискомНаборов(); }
  else if (ВКЛ === 'wpn') { фб.innerHTML = фильтрОружия(); тело.innerHTML = спискомОружия(); }
  else { фб.innerHTML = ''; тело.innerHTML = профильФорма(); }
}

// ── операторы ───────────────────────────────────────────────────────────────
function фильтрыОператоров() {
  const стихии = [...new Set(БАЗА.персонажи.map(c => c.стихия))];
  const классы = [...new Set(БАЗА.персонажи.map(c => c.класс))];
  const оружия = [...new Set(БАЗА.персонажи.map(c => c.оружие))];
  const чип = (тип, знач, текст, цвет) =>
    '<button class="fb' + (Ф[тип] === знач ? ' on' : '') + '" data-f="' + тип +
    '" data-v="' + эк(знач) + '"' + (цвет ? ' style="color:#' + цвет + '"' : '') + '>' +
    эк(текст) + '</button>';
  return '' +
    '<div class="fgrp"><i>стихия</i>' +
      стихии.map(s => {
        const о = БАЗА.персонажи.find(c => c.стихия === s);
        return чип('стихия', s, о.стихияРу, Ф.стихия === s ? '' : о.цвет);
      }).join('') + '</div>' +
    '<div class="fgrp"><i>класс</i>' +
      классы.map(k => чип('класс', k, БАЗА.персонажи.find(c => c.класс === k).классРу)).join('') +
    '</div>' +
    '<div class="fgrp"><i>ранг</i>' +
      [6, 5, 4].map(r => '<button class="fb' + (Ф.редкость === r ? ' on' : '') +
        '" data-f="редкость" data-v="' + r + '">' + r + '✦</button>').join('') + '</div>' +
    '<div class="fgrp"><i>оружие</i>' +
      оружия.map(w => чип('оружие', w, БАЗА.персонажи.find(c => c.оружие === w).оружиеРу)).join('') +
    '</div>' +
    '<input class="srch" id="q" placeholder="поиск по имени" value="' + эк(Ф.поиск) + '">' +
    '<span class="fcnt" id="cnt"></span>';
}

function отбор() {
  const q = Ф.поиск.trim().toLowerCase();
  return БАЗА.персонажи.filter(c =>
    (!Ф.стихия || c.стихия === Ф.стихия) &&
    (!Ф.класс || c.класс === Ф.класс) &&
    (!Ф.редкость || c.редкость === Ф.редкость) &&
    (!Ф.оружие || c.оружие === Ф.оружие) &&
    (!q || (c.имя + ' ' + (c.имяРу || '')).toLowerCase().includes(q)));
}

function спискомОператоров() {
  const люди = отбор();
  setTimeout(() => {
    const c = $('cnt');
    if (c) c.textContent = люди.length + ' из ' + БАЗА.персонажи.length;
  }, 0);
  if (!люди.length) return '<div class="empty">никто не подошёл под фильтры</div>';
  return '<div class="list">' + люди.map(карточка).join('') + '</div>';
}

function карточка(c) {
  const знач = ЗНАЧКИ + '/charremoteicon/' + c.значок;
  return '<details class="op" style="--el:#' + эк(c.цвет) + '" data-id="' + эк(c.id) + '">' +
    '<summary>' +
      '<img class="ava" src="' + эк(знач) + '" alt="" data-nf="hide" loading="lazy">' +
      '<span class="nm">' + эк(c.имяРу || c.имя) +
        '<i>' + эк(c.стихияРу) + ' · ' + эк(c.классРу) + ' · ' + эк(c.оружиеРу) + '</i></span>' +
      '<span class="rar">' + c.редкость + '✦</span>' +
    '</summary>' +
    '<div class="op-in"><div class="card-in">' + нутро(c) + '</div></div>' +
  '</details>';
}

function нутро(c) {
  let h = '';
  h += '<div class="sec"><h4>кто это</h4><div class="kv">' +
    '<span>Имя в игре</span><b>' + эк(c.имя) + '</b>' +
    '<span>Стихия</span><b style="color:#' + эк(c.цвет) + '">' + эк(c.стихияРу) + '</b>' +
    '<span>Класс</span><b>' + эк(c.классРу) + '</b>' +
    '<span>Оружие</span><b>' + эк(c.оружиеРу) + '</b>' +
    (c.отдел ? '<span>Отдел</span><b>' + эк(c.отдел) + '</b>' : '') +
    '</div></div>';

  if (c.безСтатов) {
    h += '<div class="sec"><h4>характеристики</h4>' +
      '<div class="box"><b>нет в дампе</b>Оператор вышел после снятия таблиц игры. ' +
      'Имя, класс и стихия известны, кривая характеристик появится с обновлением дампа.</div></div>';
  } else {
    const точки = [1, 20, 40, 60, 80, 90, 99].filter(у => c.статы[у]);
    h += '<div class="sec"><h4>характеристики по уровням</h4><table class="tbl">' +
      '<tr><th>ур.</th><th>HP</th><th>ATK</th><th>STR</th><th>AGI</th><th>WISD</th><th>WILL</th></tr>' +
      точки.map(у => {
        const s = c.статы[у];
        return '<tr' + (у === 90 ? ' class="top"' : '') + '><td>' + у + '</td>' +
          ['hp', 'atk', 'str', 'agi', 'wisd', 'will']
            .map(k => '<td class="n">' + чис(s[k]) + '</td>').join('') + '</tr>';
      }).join('') + '</table></div>';
  }

  if (c.своёОружие) {
    const w = БАЗА.оружие.find(x => x.id === c.своёОружие);
    if (w) h += '<div class="sec"><h4>стартовое оружие</h4>' + строкаПредмета(w) + '</div>';
  }
  return h;
}

// ── снаряжение ──────────────────────────────────────────────────────────────
function фильтрНаборов() {
  return '<div class="fgrp"><i>ранг набора</i>' +
    [4, 3, 1].map(r => '<button class="fb' + (Ф.редкость === r ? ' on' : '') +
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
        '<span class="nm">' + эк(n.имяРу || n.имя) +
          '<i>T' + (n.ранг || '?') + ' · предметов: ' + вещи.length + '</i></span>' +
      '</summary>' +
      '<div class="op-in"><div class="card-in">' +
        '<div class="sec full"><h4>эффект комплекта</h4>' +
          '<div class="box"><b>' + (n.нужно || 3) + ' предмета</b>' +
          эк(n.эффектРу || n.эффект || '—') + '</div></div>' +
        '<div class="sec full"><h4>предметы набора</h4><div class="wide">' +
          вещи.map(строкаВещи).join('') + '</div></div>' +
      '</div></div></details>';
  }).join('') + '</div>';
}

function строкаВещи(v) {
  const осн = v.основной ? (v.основной.тип + ' ' + чис(v.основной.значение)) : '';
  return '<div class="it">' +
    '<img src="' + эк(ЗНАЧКИ + '/itemicon/' + v.значок) + '" alt="" data-nf="hide" loading="lazy">' +
    '<span><b>' + эк(v.имяРу || v.имя) + '</b>' +
    '<i>' + эк(v.частьРу) + (v.сУровня ? ' · с ур. ' + v.сУровня : '') +
    (осн ? ' · <span class="num">' + эк(осн) + '</span>' : '') + '</i></span></div>';
}

// ── оружие ──────────────────────────────────────────────────────────────────
function фильтрОружия() {
  return '<div class="fgrp"><i>ранг</i>' +
    [6, 5, 4, 3].map(r => '<button class="fb' + (Ф.редкость === r ? ' on' : '') +
      '" data-f="редкость" data-v="' + r + '">' + r + '✦</button>').join('') + '</div>' +
    '<input class="srch" id="q" placeholder="поиск по названию" value="' + эк(Ф.поиск) + '">' +
    '<span class="fcnt" id="cnt"></span>';
}

function спискомОружия() {
  const q = Ф.поиск.trim().toLowerCase();
  const сп = БАЗА.оружие.filter(w =>
    (!Ф.редкость || w.редкость === Ф.редкость) &&
    (!q || w.имя.toLowerCase().includes(q)));
  setTimeout(() => { const c = $('cnt'); if (c) c.textContent = сп.length + ' из ' + БАЗА.оружие.length; }, 0);
  if (!сп.length) return '<div class="empty">ничего не нашлось</div>';
  return '<div class="wide">' + сп.map(строкаПредмета).join('') + '</div>';
}

function строкаПредмета(w) {
  return '<div class="it">' +
    '<img src="' + эк(ЗНАЧКИ + '/itemicon/' + w.значок) + '" alt="" data-nf="hide" loading="lazy">' +
    '<span><b class="r' + w.редкость + '">' + эк(w.имяРу || w.имя) + '</b>' +
    '<i>' + w.редкость + '✦</i></span></div>';
}

// ── мой профиль ─────────────────────────────────────────────────────────────
function профильФорма() {
  const uid = localStorage.getItem(LS_UID) || '';
  return '<div class="cap">Витрина профиля<i></i><em>enka.network</em></div>' +
    '<div class="box" style="max-width:620px">' +
      '<b>UID из игры</b>' +
      '<div class="fld">' +
        '<input id="uid" inputmode="numeric" placeholder="например 6432642365" value="' + эк(uid) + '">' +
        '<button class="btn" data-act="load">Показать</button>' +
      '</div>' +
      '<div class="say" id="say">Показываются операторы из витрины профиля. ' +
      'Чтобы данные обновились, выйди из игры и нажми «Показать» ещё раз.</div>' +
    '</div>' +
    '<div id="prof"></div>';
}

async function грузитьПрофиль() {
  const uid = ($('uid').value || '').replace(/\D+/g, '');
  const say = $('say');
  if (uid.length < 6) { say.textContent = 'UID — это число из профиля в игре'; return; }
  localStorage.setItem(LS_UID, uid);
  say.textContent = 'запрашиваю…';
  let д;
  try {
    const r = await fetch(ВИТРИНА + uid, { cache: 'no-store' });
    if (!r.ok) throw new Error('ответ ' + r.status);
    д = await r.json();
  } catch (e) {
    say.textContent = 'не получилось: ' + e.message +
      ' (маршрут витрины в воркере может быть ещё не выложен)';
    return;
  }
  say.textContent = 'обновится не чаще, чем раз в ' + (д.ttl || 60) + ' с';
  $('prof').innerHTML = профильHtml(д);
}

// Строковый id оператора достаём из идентификатора навыка: enka отдаёт
// в этой части витрины числовые шаблоны, а в навыках — нормальные имена
// вида chr_0016_laevat_UltimateSkill.
function ктоЭто(ч) {
  const с = ((ч.skillInfo || {}).levelInfo || [])[0];
  const м = с && /^(chr_\d+_[a-z]+)/i.exec(с.skillId || '');
  return м ? м[1] : '';
}

function профильHtml(д) {
  const и = д.playerInfo || {};
  const к = и.businessCard || {};
  const ст = и.statistic || {};
  let h = '<div class="cap">' + эк(к.name || 'профиль') + '<i></i><em>UID ' + эк(д.uid || '') + '</em></div>';
  h += '<div class="wide">' +
    плитка('Уровень', к.adventureLevel) + плитка('Уровень мира', к.worldLevel) +
    плитка('Операторов', ст.charNum) + плитка('Оружия', ст.weaponNum) +
    плитка('Записей', ст.docNum) + '</div>';

  const вит = (д.charData || []).map(ч => {
    const id = ктоЭто(ч);
    const c = БАЗА.персонажи.find(x => x.id === id);
    const нав = ((ч.skillInfo || {}).levelInfo || []);
    return '<details class="op" style="--el:#' + эк(c ? c.цвет : '888888') + '">' +
      '<summary>' +
        (c ? '<img class="ava" src="' + эк(ЗНАЧКИ + '/charremoteicon/' + c.значок) +
             '" alt="" data-nf="hide">' : '<span class="ava"></span>') +
        '<span class="nm">' + эк(c ? (c.имяРу || c.имя) : ('оператор #' + ч.templateId)) +
          '<i>уровень ' + (ч.level || '?') +
          (ч.potentialLevel ? ' · потенциал ' + ч.potentialLevel : '') + '</i></span>' +
        '<span class="rar">' + (c ? c.редкость + '✦' : '') + '</span>' +
      '</summary>' +
      '<div class="op-in"><div class="card-in">' +
        '<div class="sec"><h4>навыки</h4><table class="tbl">' +
          нав.map(н => '<tr><td>' + эк(имяНавыка(н.skillId)) + '</td>' +
            '<td class="n">' + н.skillLevel + ' / ' + н.skillMaxLevel + '</td></tr>').join('') +
        '</table></div>' +
        '<div class="sec"><h4>оружие и снаряжение</h4>' +
          '<div class="box"><b>только номера</b>Витрина отдаёт оружие и снаряжение ' +
          'числовыми шаблонами (оружие #' + эк((ч.weapon || {}).templateId || '—') +
          '), а таблицы с этими номерами в открытых источниках нет. ' +
          'Уровень оружия: <span class="num">' + эк((ч.weapon || {}).weaponLv || '—') +
          '</span>, прорыв: <span class="num">' + эк((ч.weapon || {}).breakthroughLv || 0) +
          '</span>.</div></div>' +
      '</div></div></details>';
  }).join('');

  h += '<div class="cap">Витрина<i></i><em>' + (д.charData || []).length + ' операторов</em></div>' +
       '<div class="list">' + (вит || '<div class="empty">витрина пуста</div>') + '</div>';
  return h;
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

function плитка(имя, знач) {
  return '<div class="box"><b>' + эк(имя) + '</b>' +
    '<span class="num" style="font-size:19px">' + эк(знач == null ? '—' : знач) + '</span></div>';
}

// ── события ─────────────────────────────────────────────────────────────────
// Один обработчик на всю страницу: в разметке нет ни одного onclick, иначе
// политика безопасности потребовала бы разрешить inline-скрипты.
document.addEventListener('click', e => {
  const т = e.target.closest('[data-tab],[data-f],[data-act]');
  if (!т) return;
  if (т.dataset.tab) {
    ВКЛ = т.dataset.tab;
    Ф.редкость = 0; Ф.поиск = '';
    рисовать();
  } else if (т.dataset.f) {
    const п = т.dataset.f;
    const v = п === 'редкость' ? +т.dataset.v : т.dataset.v;
    Ф[п] = (Ф[п] === v) ? (п === 'редкость' ? 0 : '') : v;
    рисовать();
  } else if (т.dataset.act === 'load') {
    грузитьПрофиль();
  }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  Ф.поиск = e.target.value;
  const тело = $('body');
  тело.innerHTML = ВКЛ === 'ops' ? спискомОператоров() : спискомОружия();
});

// Битые картинки прячем. Событие error не всплывает, поэтому слушаем на
// перехвате — иначе обработчик на документе просто не сработает.
document.addEventListener('error', e => {
  const э = e.target;
  if (э && э.tagName === 'IMG' && э.dataset.nf === 'hide') э.style.visibility = 'hidden';
}, true);

$('up').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('ver').addEventListener('click', () => {
  $('sheet-in').innerHTML = '<button class="x" data-close="1">закрыть</button>' +
    '<div class="cap">Откуда данные<i></i><em>' + APP_VER + '</em></div>' +
    '<table class="tbl">' +
      '<tr><td>Операторы, снаряжение, оружие</td><td>таблицы игры, дамп 22.06.2026</td></tr>' +
      '<tr><td>Наборы и их эффекты</td><td>таблицы игры + сверка состава</td></tr>' +
      '<tr><td>Значки и картинки</td><td>enka.network</td></tr>' +
      '<tr><td>Витрина профиля</td><td>enka.network/api/ef</td></tr>' +
    '</table>' +
    '<p class="hint">Дамп таблиц отстаёт от игры: у операторов, вышедших позже, ' +
    'нет кривой характеристик.</p>';
  $('sheet').classList.add('on');
});
document.addEventListener('click', e => {
  if (e.target.dataset && e.target.dataset.close) $('sheet').classList.remove('on');
  else if (e.target.id === 'sheet') $('sheet').classList.remove('on');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('sheet').classList.remove('on');
});

старт();
