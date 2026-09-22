// Справочник NTE — весь код страницы.
//
// Вынесен из index.html отдельным файлом намеренно: пока скрипт лежал внутри
// страницы, политике безопасности приходилось разрешать инлайн-скрипты
// (script-src 'unsafe-inline'), а это ровно та лазейка, через которую
// работает подстановка чужого кода. Теперь в политике остаются только свои
// файлы, и инлайн запрещён совсем.
//
// Загружается с defer: к моменту выполнения разметка уже разобрана, поэтому
// обращения к элементам в конце файла безопасны.

const APP_VER = 'v76';
const $ = id => document.getElementById(id);

// Адреса воркера. Объявление стоит в самом верху намеренно: от него зависят
// EV_API и OCR_API, а они собираются на верхнем уровне скрипта. Если объявить
// ниже по файлу, браузер падает на «Cannot access before initialization» и
// страница остаётся пустой — const не всплывает, в отличие от function.
// Свой домен из списка выкидываем, чтобы не звать самих себя дважды.
const API_BASES = ['', 'https://api.alextask.ru', 'https://alextask.ru',
                   'https://alextask-push.12dogswog76.workers.dev']
  .filter((b, i) => i === 0 || b.indexOf('//' + location.host) < 0);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);

let DB = null, GUIDE = null, RU = null, GEAR = null, I18N = null, CITY = null;
let EVRU = {};
// пробуждения: слаг → список эффектов A1…A6 и резонансов
let AWK = {};
// точки карты со StarDB: сундуки, находки, враги — то, чего нет в таблицах игры
let SDB = null;
// разборы с ntebuild: какие ступени пробуждения брать первыми и чем эспер
// полезен команде. В файлах игры этого нет — это оценка тех, кто в него играл
let NB = {};
// крупные арты скинов: имя мелкой картинки → имя крупной в img/artbig
let ART = {};
// описания навыков и пассивок из локализации игры: слаг → список умений
let SKL = {};
// короткая выжимка «что даёт команде»: слаг → две-три строки
let BRIEF = {};
// что изменилось в данных с прошлого прогона сборщика
let CHANGES = null;

// ── перевод текстов с prydwen ──────────────────────────────────────────────
// Сами тексты приезжают с сайта по-английски и при каждом новом прогоне
// сборщика перезаписываются. Поэтому перевод лежит отдельным файлом-словарём
// «оригинал → русский»: данные можно пересобирать сколько угодно, перевод от
// этого не теряется. Чего в словаре нет — показываем как есть.
function tr(s) {
  if (!s) return s;
  const d = I18N && I18N.t;
  return (d && d[s]) || s;
}
// Приоритеты («Crit Rate > Crit DMG > ATK %») и порядок прокачки — это не
// предложения, а перечни через > и =. Переводим по токенам, разделители
// оставляем на месте.
const PRIO_RU = {
  'atk':'Атака', 'flat atk':'Атака (плоская)', 'flat attack':'Атака (плоская)',
  'atk %':'Атака %', 'hp':'HP', 'hp %':'HP %', 'def':'Защита', 'def %':'Защита %',
  'crit rate':'Шанс крита', 'crit rate %':'Шанс крита',
  'crit dmg':'Крит. урон', 'crit dmg %':'Крит. урон',
  'dmg':'Урон %', 'dmg %':'Урон %', 'dmg%':'Урон %',
  'break intensity':'Инт. разрушения', 'cycle intensity':'Инт. цикла',
  'healing bonus':'Бонус лечения', 'mental damage':'Ментальный урон',
  'anima dmg':'Урон Анимы', 'anima dmg %':'Урон Анимы',
  'chaos dmg':'Урон Хаоса', 'chaos dmg %':'Урон Хаоса',
  'cosmos dmg':'Урон Космоса', 'cosmos dmg %':'Урон Космоса',
  'incantation dmg':'Урон Заклинания', 'incantation dmg %':'Урон Заклинания',
  'lakshana dmg':'Урон Лакшаны', 'lakshana dmg %':'Урон Лакшаны',
  'psyche dmg':'Урон Психики', 'psyche dmg %':'Урон Психики', 'psyche damage':'Урон Психики',
  'basic':'Обычная', 'basics':'Обычные', 'skill':'Навык', 'ult':'Ульта',
  'ultimate':'Ульта', 'support':'Поддержка', 'support skill':'Навык поддержки',
  'passive 1':'Пассивка 1', 'passive 2':'Пассивка 2'
};
function prioRu(s) {
  return String(s || '').split(/(\s*(?:>>|>|=)\s*)/).map(p => {
    if (/^[\s>=]*$/.test(p)) return p;
    const t = p.trim().replace(/\s+/g, ' ');
    const ru = PRIO_RU[t.toLowerCase()];
    return ru ? p.replace(t, ru) : p;
  }).join('');
}
const RATE_RU = { Damage:'Урон', Support:'Поддержка', Hybrid:'Гибрид',
                  Survival:'Выживание', Buff:'Поддержка', 'Endgame PVE':'эндгейм PVE' };
// Награды за коды: валюты оставляем как в игре, служебные слова переводим.
// Часть предметов в игровых таблицах не находится — это мелочь вроде еды и
// кубиков, значка у них нет, но название всё равно должно быть по-русски.
const REW_RU = {
  'blue dice': 'Синий кубик',
  'clicky fries': 'Хрустящая картошка',
  'dynamik': 'Треугольник DynamiK',
  'materials': 'материалы',
  'celebration fireworks avatar frame': 'рамка профиля «Праздничный салют»',
  'puka chocoa ellie tour special': 'Пука Чокоа: тур Элли',
  'lacrimosa launch rewards': 'награды за выход Лакримозы',
  'annulith': 'Аннулит', 'fons': 'Фонс', 'beetle coin': 'Жук-монета',
  'beetle coins': 'Жук-монета'
};
function rewName(s) {
  const t = String(s || '').trim();
  const k = t.toLowerCase().replace(/s$/, '');
  return REW_RU[t.toLowerCase()] || REW_RU[k] || t;
}
function rewRu(s) {
  return String(s || '').replace(/\bMaterials\b/gi, 'материалы').replace(/\bx(\d+)/g, '×$1');
}
// Награда приходит строкой вида «Annulith x100 + Materials». Разбираем её на
// части и подставляем значки предметов из игры: список наград собирает
// build-nte-db.ps1 в nte-gear.json.
function rewFind(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return ((GEAR && GEAR.rew) || []).filter(r =>
    n.indexOf(String(r.en).toLowerCase()) === 0)[0] || null;
}
// Разделитель зависит от источника: prydwen пишет «A x100 + B», ntebuild —
// «100 A · 5 B». Число тоже стоит по-разному, поэтому проверяем оба порядка.
function rewHtml(s) {
  const parts = String(s || '').split(/\s*[+·•]\s*|\s*·\s*/).filter(Boolean);
  if (!parts.length) return '';
  return parts.map(p => {
    const t = p.trim();
    let name = t, cnt = '';
    let m = /^(.*?)\s*[x×]\s*([\d,\s]+)$/i.exec(t);          // «Annulith x100»
    if (m) { name = m[1]; cnt = m[2]; }
    else {
      m = /^[x×]?\s*([\d][\d,\s]*)\s+(.+)$/.exec(t);          // «100 Annulith»
      if (m) { cnt = m[1]; name = m[2]; }
    }
    cnt = cnt.replace(/[,\s]/g, '');
    const it = rewFind(name);
    // Предмета нет в таблицах игры — значка не будет, но имя переводим и
    // количество показываем так же, как у остальных: иначе в карточке
    // посреди русского списка торчало «1 Blue Dice».
    if (!it || !it.icon) return '<span class="rw">' + esc(rewName(rewRu(name))) +
      (cnt ? '<b>×' + esc(num(+cnt)) + '</b>' : '') + '</span>';
    return '<span class="rw"><img src="img/items/' + esc(it.icon) + '" alt="" loading="lazy">' +
      esc(it.ru || name) + (cnt ? '<b>×' + esc(num(+cnt)) + '</b>' : '') + '</span>';
  }).join('');
}
const state = { tab: 'espers', q: '', el: '', role: '', tier: '', rar: '', plan: 'mint', tview: 'cars' };

// Команды, планировщик Console и калькулятор статов живут внутри карточки
// эспера: сами по себе, в отрыве от конкретного персонажа, они бесполезны.
const TABS = [
  ['espers', 'Эсперы'], ['arcs', 'Оружие'], ['carts', 'Картриджи'],
  ['tier', 'Тир-лист'], ['teams', 'Команды'], ['ban', 'События'],
  ['codes', 'Коды'], ['city', 'Город'], ['map', 'Карта'],
  ['mech', 'Механики']
];

const EL_RU = { Anima:'Анима', Chaos:'Хаос', Cosmos:'Космос',
                Incantation:'Заклинание', Lakshana:'Лакшана', Psyche:'Психика' };
const ROLE_RU = { Damage:'Урон', Survival:'Выживание', Buff:'Поддержка' };
const TIERS = ['S+', 'S', 'A', 'B', 'C', 'D'];
// Цвет тира — от горячего к холодному: красный это мета, синий аутсайдер.
// Через переменную его подхватывают и метка на плитке, и подпись, и колонка.
const TIER_VAR = { 'S+':'--t-sp', 'S':'--t-s', 'A':'--t-a', 'B':'--t-b', 'C':'--t-c', 'D':'--t-d' };
const tierStyle = t => TIER_VAR[t] ? '--tier:var(' + TIER_VAR[t] + ')' : '';
const elStyle = e => e ? '--el:var(--' + e + ');--el-c:var(--' + e + ')' : '';

const STAT_RU = {
  hp:'HP', atk:'Атака', def:'Защита', cr:'Шанс крита', cd:'Крит. урон',
  dmg:'Общий урон', brk:'Разрушение', er:'Восст. энергии',
  cyc:'Интенсивность цикла', elem:'Урон стихии'
};
const STAT_PCT = { cr:1, cd:1, dmg:1, elem:1, brk:1 };
const STAT_EN = { hp:'HP', atk:'ATK', def:'DEF', cr:'CRIT Rate', cd:'CRIT DMG',
                  cyc:'Cycle Intensity', brk:'Break Intensity', er:'Energy Regen' };

// Сетка Console у каждого эспера своя, и в игре она названа по внутреннему
// имени персонажа: Хотори — это Jin, Цзююань — kuhara, Аурелия — mitsuki.
// Опознано по текстам их же навыков в локализации.
const GRID_OF = {
  adler:'Adler', aurelia:'mitsuki', baicang:'Cang', chaos:'chaos', chiz:'chiichan',
  daffodil:'daffodill', edgar:'edgar', fadia:'Fadia', haniel:'Haniel', hathor:'Hathor',
  hotori:'Jin', iroi:'oneiroi', jiuyuan:'kuhara', lacrimosa:'lacrimosa', linko:'radio',
  mint:'Mint', nanally:'Nanally', sakiri:'Sagiri', shinku:'shinku', skia:'skia',
  zankou:'zankou', zero:'Female'
};

function ruName(kind, s) {
  if (!RU || !s) return s;
  const d = RU[kind];
  return (d && d[s]) || s;
}
function statName(k, a) {
  if (k === 'elem') return 'Урон: ' + ((a && EL_RU[a.el]) || 'стихии');
  const fromGame = RU && RU.stats && STAT_EN[k] ? RU.stats[STAT_EN[k]] : null;
  return fromGame || STAT_RU[k] || k;
}
const elIcon = el => 'img/ui/el-' + String(el).toLowerCase() + '.png';
const roleIcon = r => 'img/ui/role-' + String(r).toLowerCase() + '.webp';
const portrait = a => 'img/espers/' + a.slug + '.png';
const artOf = a => 'img/art/' + a.slug + '.png';
// Обликов у эспера может быть несколько: обычный вид и купленные скины.
// Список собирает build-nte-db.ps1 из файлов игры; здесь просто складываем
// в один ряд, чтобы листать стрелками у арта, как в игровом гардеробе.
function looks(a) {
  const skins = ((CITY && CITY.skins) || []).filter(x => x.slug === a.slug && x.pic);
  // Обычный вид в таблице внешности иногда записан дважды: один раз с
  // пометкой «по умолчанию», второй без неё. У Даффодил из-за этого в списке
  // облика два одинаковых «Отражения в зеркале». Отсеиваем по картинке.
  const defPics = {};
  skins.forEach(x => { if (x.def) defPics[String(x.pic).split('/').pop()] = 1; });
  const out = [{ ru: 'Обычный вид', pic: artOf(a), def: true }];
  skins
    .filter(x => !x.def && !defPics[String(x.pic).split('/').pop()])
    .sort((x, y) => String(x.ru).localeCompare(String(y.ru), 'ru'))
    .forEach(x => {
      const nm = String(x.pic).split('/').pop();
      // Крупная версия, если её собрал build-nte-art.ps1. В таблицах игры
      // лежит картинка для мелкой плашки интерфейса, 380 пикселей по ширине,
      // и рядом с артом эспера она выглядит мутной. Крупные — те же скины
      // из полноразмерного набора, ужатые до тысячи с небольшим.
      const big = ART[nm];
      out.push({
        ru: x.ru, desc: x.desc, rar: x.rar, src: x.src,
        pic: big ? 'img/artbig/' + big : 'img/skins/' + nm
      });
    });
  return out;
}
let lookIdx = 0;      // какой облик показан в открытой карточке

async function load() {
  // ?v=версия — иначе браузер отдаёт файл из кеша, и свежие поля данных
  // (опыт, материалы прокачки) на странице просто не появляются.
  const grab = (f, opt) => fetch(f + '?v=' + APP_VER).then(r => r.json())
    .catch(() => opt ? null : Promise.reject(new Error(f)));
  const [db, guide, dict, gear, i18n, city, awk, sdb, nb, art, sk, ch, evru] = await Promise.all([
    grab('nte-db.json'), grab('nte-guide.json'), grab('nte-ru.json', 1),
    grab('nte-gear.json', 1), grab('nte-i18n.json', 1), grab('nte-city.json', 1),
    grab('nte-awaken.json', 1), grab('nte-map.json', 1), grab('nte-build.json', 1),
    grab('nte-art.json', 1), grab('nte-skills.json', 1),
    grab('nte-changes.json', 1), grab('nte-ev-ru.json', 1)
  ]);
  DB = db; GUIDE = guide; RU = dict; GEAR = gear; I18N = i18n; CITY = city;
  AWK = (awk && awk.awaken) || {};
  SDB = sdb || null;
  NB = (nb && nb.a) || {};
  ART = (art && art.a) || {};
  SKL = (sk && sk.a) || {};
  BRIEF = (sk && sk.brief) || {};
  CHANGES = ch || null;
  // Названия событий и их награды по-русски. Файл правится руками: календарь
  // у ntebuild английский, официального русского списка у нас нет, а в игре
  // интерфейс русский — и сверять глазами «Runaway Echoes» с «Беглыми
  // отголосками» каждый раз неудобно.
  EVRU = (evru && evru.ev) || {};
  if (evru && evru.rew) Object.keys(evru.rew).forEach(k => { REW_RU[k] = evru.rew[k]; });
  $('ver').textContent = APP_VER;
  $('ver').onclick = showFresh;
  bindTools();
  instBind();
  $('cloudBtn').classList.toggle('on', !!syncCfg().np);
  $('toolsBtn').classList.toggle('on', !!syncCfg().np);
  workerVer();
  swStart();
  drawTabs();
  draw();
}

function drawTabs() {
  $('tabs').innerHTML = TABS.map(t =>
    '<button class="tb' + (state.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' +
    esc(t[1]) + '</button>').join('');
  $('tabs').querySelectorAll('.tb').forEach(b => b.onclick = () => {
    // фильтры сбрасываем: стихия, выбранная в списке эсперов, иначе сразу
    // прячет половину составов на соседней вкладке
    state.tab = b.dataset.t; state.q = ''; $('q').value = '';
    state.el = state.role = state.tier = state.rar = '';
    drawTabs(); draw();
  });
}

// Отрисовка вкладки в обёртке. Если внутри что-то падает — а так уже было,
// когда в данных машины попался пустой элемент, — фильтры успевают
// перерисоваться, а тело остаётся от прошлой вкладки: на экране висел
// тир-лист с фильтрами транспорта, и понять, что сломалось, было нельзя.
// Теперь на такой случай в теле появляется сообщение с самой ошибкой.
function draw() {
  const t = state.tab;
  $('q').style.display = (t === 'mech') ? 'none' : '';
  // На карте всё лишнее ужимается: страница шире 1560, шапка тоньше, строка
  // фильтров схлопывается — счётчик точек переезжает в угол самой карты.
  document.body.classList.toggle('mapmode', t === 'map');
  const one = {
    espers: drawEspers, arcs: drawArcs, carts: drawCarts, tier: drawTier,
    teams: drawTeams, ban: drawBanners, codes: drawCodes, city: drawCity,
    map: drawMap, mech: drawMech
  }[t];
  if (!one) return;
  try { return one(); }
  catch (e) {
    console.error('вкладка ' + t + ':', e);
    $('body').innerHTML = '<div class="empty">Вкладка не нарисовалась: ' +
      esc(e && e.message) + '.<br>Скорее всего, данные собраны старой версией ' +
      'build-nte-db.ps1 — перезапусти сборщик.</div>';
    foot('');
  }
}

// ── фильтры ────────────────────────────────────────────────────────────────
function fgroup(label, key, list, icon, ru) {
  return '<div class="fgrp"><u>' + label + '</u>' +
    list.map(v => '<button class="fb' + (state[key] === v ? ' on' : '') +
      '" data-f="' + key + '" data-v="' + esc(v) + '">' +
      (icon ? '<img src="' + icon(v) + '" alt="" loading="lazy">' : '') +
      esc(ru ? (ru[v] || v) : v) + '</button>').join('') + '</div>';
}
function bindFilters() {
  // Только кнопки-фильтры: переключатель раздела рисуется тем же классом, и
  // без выборки по data-f этот обработчик затирал его собственный — на вкладке
  // «Город» кнопка «Недвижимость» переставала нажиматься.
  $('filters').querySelectorAll('.fb[data-f]').forEach(b => b.onclick = () => {
    const k = b.dataset.f;
    state[k] = (state[k] === b.dataset.v) ? '' : b.dataset.v;   // повторный клик снимает
    draw();
  });
}

// ── эсперы ─────────────────────────────────────────────────────────────────
function espersShown() {
  const q = state.q.trim().toLowerCase();
  return DB.agents.filter(a => {
    if (state.el && a.el !== state.el) return false;
    if (state.role && a.role !== state.role) return false;
    if (state.tier && a.tier !== state.tier) return false;
    if (q && (a.ru + ' ' + a.en + ' ' + a.slug).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort((x, y) => {
    const t = a => { const i = TIERS.indexOf(a.tier); return i < 0 ? 99 : i; };
    return (t(x) - t(y)) || x.ru.localeCompare(y.ru, 'ru');
  });
}
// ── что делать сегодня ─────────────────────────────────────────────────────
// Сводка на главной. Всё это есть на своих вкладках, но чтобы понять «что
// горит», приходилось обойти три: баннеры, коды и события. Здесь собрано то,
// у чего есть срок и что можно потерять.
function todayHtml() {
  const now = Date.now(), день = 86400000;
  const дней = t => Math.ceil((Date.parse(t) - now) / день);
  const карточка = (цвет, что, когда, куда) =>
    '<div class="td' + (цвет ? ' ' + цвет : '') + '"' +
      (куда ? ' data-td="' + куда + '" title="перейти"' : '') + '>' +
      '<b>' + что + '</b><i>' + когда + '</i></div>';

  const пункты = [];

  // баннеры, которые вот-вот кончатся
  ((GUIDE && GUIDE.banners) || []).forEach(b => {
    if (!b.to || !/current|сейчас/i.test(b.key + ' ' + b.group)) return;
    const д = дней(b.to);
    if (!isFinite(д) || д < 0 || д > 10) return;
    const кто = b.slug ? (agentBy(b.slug) || {}).ru : banName(b);
    пункты.push({ д: д, html: карточка(д <= 3 ? 'hot' : '',
      esc(кто || b.name), 'баннер — ' + (д <= 0 ? 'последний день' :
      'ещё ' + д + ' ' + plural(д, 'день', 'дня', 'дней')), 'ban') });
  });

  // события: что заканчивается в ближайшую неделю
  ((evLive && evLive.list) || []).forEach(e => {
    if (!e.to || e.perm) return;
    const д = дней(e.to);
    if (!isFinite(д) || д < 0 || д > 7) return;
    пункты.push({ д: д, html: карточка(д <= 2 ? 'hot' : '',
      esc(evName(e)), 'событие — ' + (д <= 0 ? 'последний день' :
      'ещё ' + д + ' ' + plural(д, 'день', 'дня', 'дней')), 'ban') });
  });

  // коды, которые ещё не активированы
  const коды = ((codesLive && codesLive.list) || (GUIDE && GUIDE.codes && GUIDE.codes.list) || []);
  const было = codesUsed();
  const свежие = коды.filter(c => c && c.code && !было[c.code] && !/expired|срок вышел/i.test(c.note || ''));
  if (свежие.length) {
    пункты.push({ д: 99, html: карточка('', свежие.length + ' ' +
      plural(свежие.length, 'код не активирован', 'кода не активированы', 'кодов не активировано'),
      'награды сгорают со временем', 'codes') });
  }

  // Данные, которые собираются скриптами на компьютере, со временем тухнут:
  // тир-лист, сборки и баннеры остаются от прошлого патча, а по странице это
  // незаметно. Если с прогона прошло больше двух недель — это тоже «горит».
  const СТАРО = 14;
  const стухло = [];
  const проверить = (имя, когда) => {
    const д = daysAgo(когда);
    if (д != null && д > СТАРО) стухло.push({ имя: имя, д: д });
  };
  проверить('эсперы и картинки', (DB && DB.built) || '');
  проверить('тир-лист и сборки', (GUIDE && GUIDE.built) || '');
  if (стухло.length) {
    стухло.sort((a, b) => b.д - a.д);
    const самое = стухло[0];
    пункты.push({ д: -1, html: карточка('hot',
      'данные не обновлялись ' + самое.д + ' ' + plural(самое.д, 'день', 'дня', 'дней'),
      стухло.map(x => x.имя).join(', ') + ' — запусти обновить-nte.ps1', '') });
  }

  if (!пункты.length) return '';
  пункты.sort((a, b) => a.д - b.д);
  return '<div class="cap" style="margin-top:0"><b>Что горит</b><span></span>' +
    '<em>сроки заканчиваются</em></div>' +
    '<div class="tds">' + пункты.map(x => x.html).join('') + '</div>';
}
function bindToday() {
  $('body').querySelectorAll('[data-td]').forEach(el => el.onclick = () => {
    state.tab = el.dataset.td; state.q = ''; drawTabs(); draw();
  });
}
function drawEspers() {
  const els = [...new Set(DB.agents.map(a => a.el).filter(Boolean))].sort();
  const roles = [...new Set(DB.agents.map(a => a.role).filter(Boolean))];
  const tiers = TIERS.filter(t => DB.agents.some(a => a.tier === t));
  const list = espersShown();
  $('filters').innerHTML =
    fgroup('стихия', 'el', els, elIcon, EL_RU) +
    fgroup('роль', 'role', roles, roleIcon, ROLE_RU) +
    fgroup('тир', 'tier', tiers, null, null) +
    '<span class="fcnt">' + list.length + ' из ' + DB.agents.length + '</span>';
  bindFilters();
  const сегодня = todayHtml();
  $('body').innerHTML = (сегодня || '') + (list.length ? '<div class="grid">' + list.map(a =>
    '<div class="card" data-slug="' + a.slug + '" style="' + elStyle(a.el) + ';' +
      tierStyle(a.tier) + '">' +
      '<div class="card-p">' +
        '<img src="' + portrait(a) + '" alt="' + esc(a.ru) + '" loading="lazy">' +
        (a.tier ? '<span class="card-t">' + esc(a.tier) + '</span>' : '') +
        '<span class="card-e">' +
          (a.el ? '<img src="' + elIcon(a.el) + '" title="' + esc(EL_RU[a.el] || a.el) + '" alt="">' : '') +
          (a.role ? '<img src="' + roleIcon(a.role) + '" title="' + esc(ROLE_RU[a.role] || a.role) + '" alt="">' : '') +
        '</span>' +
        '<div class="card-n"><b>' + esc(a.ru) + '</b><i>' + esc(a.en) + '</i></div>' +
      '</div></div>').join('') + '</div>'
    : '<div class="empty">Никого не нашлось — сними фильтры или почисти поиск.</div>');
  $('body').querySelectorAll('.card').forEach(c => c.onclick = () => open(c.dataset.slug));
  bindToday();
  // События приезжают с воркера позже страницы: как приедут — сводку
  // перерисовываем, иначе «что горит» останется без них. Просим один раз:
  // иначе отрисовка звала бы загрузку, а та — отрисовку, и так по кругу.
  if (!evLive && !evAsked) { evAsked = 1; evRefresh(); }
  foot('Имена — из локализации игры, картинки — с вики, сборки — prydwen.');
}

// ── оружие ─────────────────────────────────────────────────────────────────
// Порядок как в трекере ZZZ: сперва S, потом A и B, внутри редкости по имени.
// Раньше сортировка шла по редкости в алфавитном порядке, и наверху оказывались
// синие A и B, а самое нужное уезжало вниз.
const RAR_ORDER = { S: 0, A: 1, B: 2 };
function arcOwner(a) {
  const ids = a.own || [];
  for (const num of ids) {
    const who = DB.agents.filter(x => x.num === num)[0];
    if (who) return who;
  }
  return null;
}
// «Атака 286 (+109 за прорывы)» — берём последний уровень и последнюю стадию.
function arcMax(a) {
  const lv = (a.lv || [])[(a.lv || []).length - 1];
  const bt = (a.bt || [])[(a.bt || []).length - 1];
  const out = { lv: lv ? lv.lv : 0, atk: lv ? lv.atk : 0, sub: null, btAtk: 0 };
  for (const m of (bt ? bt.mods : [])) {
    if (m.p === 'AtkBase') out.btAtk = m.v;
    else if (!out.sub) out.sub = m;
  }
  out.total = out.atk + out.btAtk;
  return out;
}
const statVal = m => m.v + (m.pct ? '%' : '');

function drawArcs() {
  if (!GEAR) { $('body').innerHTML = '<div class="empty">Нет nte-gear.json — прогони build-nte-db.ps1.</div>'; return; }
  const q = state.q.trim().toLowerCase();
  const rars = ['S', 'A', 'B'].filter(r => GEAR.arcs.some(a => a.rar === r));
  const list = GEAR.arcs.filter(a => {
    if (state.rar && a.rar !== state.rar) return false;
    if (q && (a.ru + ' ' + a.en).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).slice().sort((x, y) =>
    ((RAR_ORDER[x.rar] == null ? 9 : RAR_ORDER[x.rar]) - (RAR_ORDER[y.rar] == null ? 9 : RAR_ORDER[y.rar])) ||
    x.ru.localeCompare(y.ru, 'ru'));

  $('filters').innerHTML = fgroup('редкость', 'rar', rars, null, null) +
    '<span class="fcnt">' + list.length + ' из ' + GEAR.arcs.length + '</span>';
  bindFilters();
  const hasStats = GEAR.arcs.some(a => (a.lv || []).length);
  $('body').innerHTML = list.length ? '<div class="list">' + list.map(a => {
    const who = arcOwner(a), mx = arcMax(a);
    return '<div class="wp" data-id="' + esc(a.id) + '">' +
      '<div class="wp-h">' +
        '<img class="wp-ic" src="img/arcs/' + esc(a.icon) + '" alt="" loading="lazy">' +
        '<div class="wp-b">' +
          '<b>' + (a.rar ? '<span class="rar ' + esc(a.rar) + '">' + esc(a.rar) + '</span>' : '') +
            esc(a.ru) + '</b>' +
          '<i>' + esc(a.en) + '</i>' +
          (mx.total ? '<div class="wp-st">' +
            '<span>атака <b>' + mx.total + '</b></span>' +
            (mx.sub ? '<span>' + esc(mx.sub.ru) + ' <b>' + esc(statVal(mx.sub)) + '</b></span>' : '') +
            '<span>ур. ' + mx.lv + ' + прорывы</span></div>' : '') +
        '</div>' +
        (who ? '<img class="wp-own" src="' + portrait(who) + '" title="именное оружие: ' +
          esc(who.ru) + '" alt="" loading="lazy">' : '') +
        '<span class="wp-x">⌄</span>' +
      '</div>' +
      '<div class="wp-d">' + arcDetail(a, who) + '</div>' +
    '</div>';
  }).join('') + '</div>'
    : '<div class="empty">Ничего не нашлось.</div>';
  $('body').querySelectorAll('.wp-h').forEach(h => h.onclick = () => {
    h.parentElement.classList.toggle('open');
    bindArcPlan();
  });
  bindArcPlan();
  foot('Оружие, характеристики и иконки — из таблиц игры. Всего: ' + GEAR.arcs.length + '.' +
    (hasStats ? '' : ' Характеристики появятся после прогона build-nte-db.ps1.'));
}

// Разворот: один ползунок уровня. Под ним — что оружие даёт на этом уровне и
// во что обошёлся путь с первого. Двух ползунков не нужно: качают всегда с
// начала, а «с какого по какой» — вопрос, который в игре не стоит.
const arcLv = {};                          // выбранный уровень, по одному на оружие
function arcMaxLv(a) { const l = a.lv || []; return l.length ? l[l.length - 1].lv : 80; }
function arcAtk(a, lv) {
  const row = (a.lv || []).filter(x => x.lv === lv)[0];
  return row ? row.atk : 0;
}
// Сколько прорывов пройдено к этому уровню: у каждого свой потолок, выше него
// без прорыва не поднять.
function arcStage(a, lv) {
  const bt = (a.bt || []).slice().sort((x, y) => x.n - y.n);
  let last = bt[0] || null;
  for (const b of bt) { if (b.maxLv < lv) last = b; }
  const done = bt.filter(b => b.n > 0 && b.maxLv < lv);
  return { done: done, cur: last };
}
// Вторая характеристика оружия растёт прорывами: показываем ту, что уже открыта.
function arcSub(a, lv) {
  const st = arcStage(a, lv);
  const from = st.done.length ? st.done[st.done.length - 1] : (a.bt || [])[0];
  const mods = (from && from.mods) || [];
  return mods.filter(m => m.p !== 'AtkBase')[0] || null;
}
function arcBonusAtk(a, lv) {
  const st = arcStage(a, lv);
  const from = st.done.length ? st.done[st.done.length - 1] : (a.bt || [])[0];
  const m = ((from && from.mods) || []).filter(x => x.p === 'AtkBase')[0];
  return m ? m.v : 0;
}
function arcCost(a, lv) {
  const exp = (a.exp || []).slice(0, Math.max(0, lv - 1)).reduce((n, x) => n + (x || 0), 0);
  const items = {}, add = list => (list || []).forEach(it => {
    if (!items[it.id]) items[it.id] = { ru: it.ru, icon: it.icon, rar: it.rar, n: 0 };
    items[it.id].n += it.n;
  });
  let gold = 0;
  arcStage(a, lv).done.forEach(b => { add(b.need); gold += b.gold || 0; });
  return { exp: exp, gold: gold, items: Object.values(items) };
}
const num = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function arcDetail(a, who) {
  const lv = a.lv || [];
  if (!lv.length) return '<div class="hint">' + esc(a.desc || '') + '</div>';
  const max = arcMaxLv(a);
  const cur = arcLv[a.id] != null ? arcLv[a.id] : max;
  // деления как на ntebuild: каждые десять уровней и последний
  const marks = [];
  for (let i = 1; i <= max; i += 10) marks.push(i === 1 ? 1 : i - 1);
  if (marks[marks.length - 1] !== max) marks.push(max);

  return (who ? '<div class="hint" style="margin:9px 0 0">Именное оружие: <b>' + esc(who.ru) +
      '</b> — у него от него больше всего пользы.</div>' : '') +
    '<div class="cap"><b>Прокачка</b><span></span><em id="lvcap' + esc(a.id) + '">до ' + cur +
      ' уровня</em></div>' +
    '<div class="lvpick">' +
      '<input type="range" min="1" max="' + max + '" value="' + cur +
        '" step="1" data-arc="' + esc(a.id) + '">' +
      '<div class="ticks">' + marks.map(m =>
        '<span style="left:' + ((m - 1) / (max - 1) * 100).toFixed(2) + '%">' + m + '</span>').join('') +
      '</div>' +
    '</div>' +
    '<div class="stat" id="lvst' + esc(a.id) + '">' + arcStatHtml(a, cur) + '</div>' +
    '<div id="lvmat' + esc(a.id) + '">' + arcMatHtml(a, cur) + '</div>' +
    (a.desc ? '<div class="hint">' + esc(a.desc) + '</div>' : '');
}
function arcStatHtml(a, lv) {
  const sub2 = arcSub(a, lv), bonus = arcBonusAtk(a, lv);
  const st = arcStage(a, lv);
  return '<div class="st ok"><b>' + num(arcAtk(a, lv) + bonus) + '</b>атака на ' + lv + ' ур.</div>' +
    (sub2 ? '<div class="st"><b>' + esc(statVal(sub2)) + '</b>' + esc(sub2.ru) + '</div>' : '') +
    '<div class="st"><b>' + st.done.length + '</b>прорывов пройдено</div>';
}
// Опыт в игре не насыпают числом — его дают красками, и в инвентаре ты видишь
// именно их. Поэтому требуемый опыт переводим обратно в расходники: сначала
// самые ёмкие, остаток закрываем младшей с запасом (половину краски не дают).
function expMats(exp, list) {
  const out = [];
  const src = (list || []).filter(x => x && x.exp > 0);
  let rest = Math.max(0, Math.round(exp || 0));
  if (!src.length || !rest) return out;
  src.forEach((it, i) => {
    let k = Math.floor(rest / it.exp);
    if (i === src.length - 1 && rest % it.exp) k++;
    if (k > 0) { out.push({ id: it.id, ru: it.ru, icon: it.icon, rar: it.rar, n: k }); rest -= k * it.exp; }
  });
  return out;
}
function matHtml(list) {
  return '<div class="mats">' + list.map(it =>
    '<div class="mat' + (it.rar ? ' r' + esc(it.rar) : '') + '">' +
      (it.icon ? '<img src="img/items/' + esc(it.icon) + '" alt="" loading="lazy">' : '') +
      '<span>' + esc(it.ru) + '</span><b>×' + num(it.n) + '</b></div>').join('') + '</div>';
}
function goldMat(n) {
  const g = (GEAR && GEAR.gold) || {};
  return n ? [{ ru: g.ru || 'Монеты', icon: g.icon || '', rar: g.rar || '', n: n }] : [];
}
function arcMatHtml(a, lv) {
  const cost = arcCost(a, lv);
  const mats = goldMat(cost.gold)
    .concat(expMats(cost.exp, GEAR.expFork))
    .concat(cost.items);
  if (!mats.length && !cost.exp) return '';
  // если справочник красок ещё не собран — показываем хотя бы число опыта
  const plain = (cost.exp && !expMats(cost.exp, GEAR.expFork).length)
    ? '<div class="stat"><div class="st"><b>' + num(cost.exp) + '</b>опыта</div></div>' : '';
  return '<div class="cap"><b>Во что обойдётся</b><span></span><em>с первого уровня' +
      (cost.exp ? ' · ' + num(cost.exp) + ' опыта' : '') + '</em></div>' +
    plain + (mats.length ? matHtml(mats) : '');
}
function bindArcPlan() {
  $('body').querySelectorAll('input[data-arc]').forEach(inp => {
    // Обновляем только цифры: если перерисовать блок целиком, ползунок
    // пересоздаётся прямо под курсором и перетаскивание обрывается на первом
    // же движении — со стороны это выглядит как «он не ездит».
    inp.oninput = () => {
      const id = inp.dataset.arc, lv = +inp.value;
      arcLv[id] = lv;
      const a = GEAR.arcs.filter(x => x.id === id)[0];
      const cap = $('lvcap' + id), st = $('lvst' + id), mat = $('lvmat' + id);
      if (cap) cap.textContent = 'до ' + lv + ' уровня';
      if (st) st.innerHTML = arcStatHtml(a, lv);
      if (mat) mat.innerHTML = arcMatHtml(a, lv);
    };
  });
}

// ── картриджи ──────────────────────────────────────────────────────────────
// Иконка набора и требуемые формы деталей — из игровых таблиц. По названию в
// списке ориентироваться неудобно: в игре набор узнаётся по значку.
//
// SuitGeometryCondition — это какие формы деталей набор вообще принимает.
// Названия там внутренние («EquipmentGeometry_Hen2»), поэтому показываем не их,
// а саму фигуру: рисуем клетки по координатам из таблицы форм.
function shapeMini(name) {
  const flat = (GEAR.shapes || {})[name];
  if (!flat) return '';
  const cells = [];
  for (let i = 0; i + 1 < flat.length; i += 2) cells.push([flat[i], flat[i + 1]]);
  const ys = cells.map(c => c[0]), xs = cells.map(c => c[1]);
  const y0 = Math.min(...ys), x0 = Math.min(...xs);
  const h = Math.max(...ys) - y0 + 1, w = Math.max(...xs) - x0 + 1;
  let out = '<span class="mini" style="grid-template-columns:repeat(' + w + ',5px)">';
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++)
    out += '<i style="' + (cells.some(p => p[0] - y0 === r && p[1] - x0 === c) ? '' : 'opacity:0') + '"></i>';
  return out + '</span>';
}
function shapeType(name) {
  const flat = (GEAR.shapes || {})[name];
  if (!flat) return '';
  const n = flat.length / 2;
  return n === 2 ? 'II' : n === 3 ? 'III' : n === 4 ? 'IV' : '';
}
// Переключатель раздела. От fgroup отличается тем, что повторный клик ничего
// не снимает: раздел всегда какой-то выбран, пустого состояния тут нет.
function vgroup(label, key, pairs) {
  return '<div class="fgrp"><u>' + label + '</u>' +
    pairs.map(p => '<button class="fb' + (state[key] === p[0] ? ' on' : '') +
      '" data-v2="' + key + '" data-vv="' + esc(p[0]) + '">' + esc(p[1]) + '</button>').join('') +
    '</div>';
}
function bindViews() {
  $('filters').querySelectorAll('.fb[data-v2]').forEach(b => b.onclick = () => {
    state[b.dataset.v2] = b.dataset.vv; draw();
  });
}
const RAR_TITLE = { S: 'Легендарный', A: 'Эпический', B: 'Редкий', C: 'Обычный' };
function rarPill(r) {
  return r ? '<span class="rpill r' + esc(r) + '" title="' + esc(RAR_TITLE[r] || '') + '">' + esc(r) + '</span>' : '';
}
// Сколько клеток занимает сама фигура — по числу координат в таблице форм.
// Имя geoSize, а не shapeCells: такая функция уже есть у планировщика Console,
// она возвращает координаты, и одноимённая перекрыла бы её целиком.
function geoSize(name) {
  const flat = (GEAR.shapes || {})[name];
  return flat ? flat.length / 2 : 0;
}
function suitById(id) { return (GEAR.suits || []).filter(s => s.id === id)[0]; }

// ── картриджи ──────────────────────────────────────────────────────────────
// В игре на сетку Console кладут две разные детали, и путать их нельзя:
//   «Картридж» — квадратный, принадлежит набору, даёт бонус набора;
//   «Модуль»  — фигурный, к наборам не относится, расширяет сетку.
// Раньше они лежали в трёх разных списках (наборы, картриджи, модули), и одно
// и то же имя встречалось дважды. Теперь один список наборов: раскрыл — и
// видишь бонусы, картриджи всех рангов и какие модули набор принимает.
function statVals(r) {
  const cols = ['S', 'A', 'B'];
  const f = n => String(Math.round(n * 10) / 10).replace('.', ',');
  return cols.map(c => {
    const v = r.val && r.val[c];
    if (!v) return '';
    const u = r.pct ? '%' : '';
    return '<span class="sv">' + rarPill(c) + '<b>' + f(v.max) + u + '</b>' +
      '<i>с ' + f(v.min) + u + '</i></span>';
  }).join('');
}
// Что может выпасть на картридже — общая таблица для всех наборов: пул
// одинаковый, меняется только ранг детали.
function dropHtml() {
  const rows = GEAR.modStats || [];
  if (!rows.length) return '';
  return '<details class="mfold"><summary><b>Что может выпасть на картридже</b></summary>' +
    '<div class="mfold-in">' +
    '<div class="hint" style="margin:8px 0">Основная характеристика выпадает случайно из ' +
    'этого списка. Число — значение на 20 уровне, мелким — стартовое.</div>' +
    '<div class="drops">' + rows.map(r =>
      '<div class="drop">' + statIco(dropKey(r.p)) + '<span>' + esc(r.ru) + '</span>' +
      '<div class="dv">' + statVals(r) + '</div></div>').join('') + '</div>' +
    '</div></details>';
}
// имя характеристики из таблицы → ключ значка
function dropKey(p) {
  const t = String(p || '');
  if (/^HPMax/.test(t)) return 'hp';
  if (/^Atk/.test(t)) return 'atk';
  if (/^Def/.test(t)) return 'def';
  if (/^CritDamage/.test(t)) return 'cd';
  if (/^Crit/.test(t)) return 'cr';
  if (/^DamageUp/.test(t)) return 'elem';
  if (/^Mag/.test(t)) return 'cyc';
  if (/Unbal/.test(t)) return 'brk';
  if (/Heal/.test(t)) return 'heal';
  return '';
}
function partCard(m) {
  const bits = [];
  if (m.grids) bits.push('<span class="gsh">+' + m.grids + ' к сетке</span>');
  if (!m.core && geoSize(m.geo)) bits.push('<span class="gsh">' + shapeMini(m.geo) +
    'занимает ' + geoSize(m.geo) + '</span>');
  if (m.max) bits.push('<span class="gsh">до ' + m.max + ' ур.</span>');
  if (m.baseN) bits.push('<span class="gsh">' + m.baseN + ' осн. + ' + m.subN + ' доп.</span>');
  if (m.gold) bits.push('<span class="gsh">' + num(m.gold) + ' монет за уровень</span>');
  return '<div class="part">' +
    (m.icon ? '<img src="img/mods/' + esc(m.icon) + '" alt="" loading="lazy">' : '') +
    '<div class="part-b"><b>' + esc(m.ru || m.id) + '</b>' + rarPill(m.rar) +
      (bits.length ? '<div class="geo">' + bits.join('') + '</div>' : '') +
    '</div></div>';
}
// Формы, которые принимает набор. Раньше это были четыре серых плашки
// «тип II / тип III / тип IV» без единой подробности. Теперь по каждой форме
// видно саму фигуру, сколько клеток она занимает, сколько даёт к сетке и
// какие модули этой формы вообще есть в игре.
function geoHtml(geos, rar) {
  const mods = (GEAR.mods || []).filter(m => !m.core);
  return '<div class="wide">' + geos.map(g => {
    const same = mods.filter(m => m.geo === g);
    const best = same.filter(m => m.rar === 'S')[0] || same[0];
    const t = shapeType(g);
    return '<div class="part">' +
      (best && best.icon ? '<img src="img/mods/' + esc(best.icon) + '" alt="" loading="lazy">' : '') +
      '<div class="part-b">' +
        '<b>' + esc(shapeName(g)) + '</b>' + (t ? ' <span class="m">тип ' + esc(t) + '</span>' : '') +
        '<div class="geo">' +
          '<span class="gsh">' + shapeMini(g) + 'занимает ' + geoSize(g) + '</span>' +
          (best && best.grids ? '<span class="gsh">+' + best.grids + ' к сетке</span>' : '') +
          (best && best.baseN ? '<span class="gsh">' + best.baseN + ' осн. + ' +
            best.subN + ' доп.</span>' : '') +
          (same.length ? '<span class="gsh">рангов: ' +
            [...new Set(same.map(m => m.rar))].join(', ') + '</span>' : '') +
        '</div>' +
        (best ? '<div class="hint" style="margin:5px 0 0">' + modStatHint(best.rar) + '</div>' : '') +
      '</div></div>';
  }).join('') + '</div>';
}
// Что даёт модуль этого ранга: диапазон основной характеристики с 1 по 20
// уровень. Конкретная характеристика выпадает случайно, поэтому показываем
// вилку по всему пулу, а не одно число.
function modStatHint(rar) {
  const rows = (GEAR.modStats || []).filter(r => r.val && r.val[rar]);
  if (!rows.length) return 'Характеристики выпадают случайно.';
  const lo = Math.min(...rows.map(r => r.val[rar].min));
  const hi = Math.max(...rows.map(r => r.val[rar].max));
  return 'Основная характеристика ранга ' + esc(rar) + ': от ' +
    (Math.round(lo * 10) / 10) + ' до ' + (Math.round(hi * 10) / 10) +
    ' на 20 уровне, какая именно — случайно из ' + rows.length + '.';
}
function drawCarts() {
  if (!GEAR) { $('body').innerHTML = '<div class="empty">Нет nte-gear.json — прогони build-nte-db.ps1.</div>'; return; }
  const q = state.q.trim().toLowerCase();
  const mods = GEAR.mods || [];
  const named = (GEAR.suits || []).map(s => ({
    id: s.id, bonuses: s.bonuses, name: s.ru || s.en || s.id, en: s.en || '',
    icon: s.icon || '', geo: s.geo || []
  })).filter(s => !q || (s.name + ' ' + s.en).toLowerCase().indexOf(q) >= 0)
     .sort((x, y) => x.name.localeCompare(y.name, 'ru'));

  // Фигурные модули к наборам не относятся — они общие, показываем отдельным
  // свёрнутым блоком внизу, а не отдельной вкладкой.
  // Порядок: сначала все S, потом A, потом B; внутри ранга — по типу
  // (II, III, IV) и по числу клеток. Раньше сортировка шла от числа клеток,
  // и ранги перемешивались: S-модуль типа II стоял выше A-модуля типа IV,
  // а найти «все S» глазами было нельзя.
  const RAR_ORD = { S: 0, A: 1, B: 2, C: 3 };
  const ord = m => (RAR_ORD[m.rar] != null ? RAR_ORD[m.rar] : 9);
  const plain = mods.filter(m => !m.core).slice().sort((a, b) =>
    ord(a) - ord(b) ||
    (geoSize(a.geo) - geoSize(b.geo)) ||
    String(shapeName(a.geo)).localeCompare(String(shapeName(b.geo)), 'ru'));

  $('filters').innerHTML = '<span class="fcnt">' + named.length + ' наборов</span>';
  $('body').innerHTML = '<div class="list">' + named.map(s => {
    const carts = mods.filter(m => m.core && m.suit === s.id)
      .sort((a, b) => ['S', 'A', 'B'].indexOf(a.rar) - ['S', 'A', 'B'].indexOf(b.rar));
    const top = carts[0];
    // значок набора заменяем картинкой его картриджа: в игре узнают по ней
    const pic = (top && top.icon) ? 'img/mods/' + top.icon
              : (s.icon ? 'img/suits/' + s.icon : '');
    return '<details class="suit">' +
      '<summary>' +
        (pic ? '<img class="cart-ic" src="' + esc(pic) + '" alt="" loading="lazy">' : '') +
        '<div class="item-b">' +
          '<b style="font-size:14px;color:var(--gold)" title="' + esc(s.en) + '">' + esc(s.name) + '</b>' +
          (carts.length ? rarPill(carts[0].rar) : '') +
          s.bonuses.map(b => '<div class="set-b"><i>' + b.n + '</i>' + esc(tr(b.text)) + '</div>').join('') +
        '</div>' +
      '</summary>' +
      // Список картриджей набора убран: ранги A и B повторяли S слово в слово,
      // отличаясь только числами, и раскрытая карточка от этого вырастала
      // втрое. Ранг S виден в шапке набора, значения по рангам — в общей
      // таблице «что может выпасть».
      '<div class="suit-in">' +
        (s.geo.length ? '<div class="sec full">' +
          cap2('Принимает модули', s.geo.length + ' формы') +
          geoHtml(s.geo, top && top.rar) + '</div>' : '') +
      '</div>' +
    '</details>';
  }).join('') + '</div>' +
  dropHtml() +
  (plain.length ? '<details class="mfold"><summary><b>Модули — общие для всех наборов</b></summary>' +
    '<div class="mfold-in"><div class="hint" style="margin:8px 0">Фигурные модули: ' +
    'расширяют сетку Console и дают случайные характеристики. К наборам не ' +
    'относятся, бонус набора от них не зависит. Сначала ранг S, затем A и B; ' +
    'внутри ранга — по форме.</div>' +
    ['S', 'A', 'B', 'C'].map(r => {
      const part = plain.filter(m => m.rar === r);
      if (!part.length) return '';
      return cap2('Ранг ' + r, part.length + ' шт.') +
        '<div class="parts">' + part.map(partCard).join('') + '</div>';
    }).join('') +
    '</div></details>' : '');

  foot('Наборы картриджей из файлов игры: бонус включается, когда на сетке собрано ' +
       'столько картриджей набора. Раскрой набор — увидишь, какие формы модулей он ' +
       'принимает и что они дают.');
}
// заголовок внутри раскрытого набора
function cap2(t, note) {
  return '<div class="cap"><b>' + esc(t) + '</b><span></span>' +
    (note ? '<em>' + esc(note) + '</em>' : '') + '</div>';
}
// ── тир-лист ───────────────────────────────────────────────────────────────
// Внутри тира эсперы разложены по ролям: в одной строке S+ стояли и Хаос с
// уроном, и Сакири с поддержкой, и понять, кого с кем сравнивают, было нельзя.
// На портретах — значки стихии и роли, чтобы не открывать карточку ради этого.
const ROLE_ORDER = ['Damage', 'Buff', 'Survival'];
function drawTier() {
  const els = [...new Set(DB.agents.map(a => a.el).filter(Boolean))].sort();
  const roles = ROLE_ORDER.filter(r => DB.agents.some(a => a.role === r))
    .concat([...new Set(DB.agents.map(a => a.role).filter(Boolean))].filter(r => ROLE_ORDER.indexOf(r) < 0));
  $('filters').innerHTML =
    fgroup('стихия', 'el', els, elIcon, EL_RU) +
    fgroup('роль', 'role', roles, roleIcon, ROLE_RU) +
    '<span class="fcnt">' + DB.agents.filter(a => a.tier).length + ' с оценкой</span>';
  bindFilters();

  const q = state.q.trim().toLowerCase();
  const fit = a => (!state.el || a.el === state.el) && (!state.role || a.role === state.role) &&
    (!q || (a.ru + a.en).toLowerCase().indexOf(q) >= 0);
  // колонки — роли, строки — тиры; в ячейке эсперы этой роли в этом тире
  const cols = roles.filter(r => !state.role || r === state.role);
  const rows = TIERS.filter(t => DB.agents.some(a => a.tier === t && fit(a)));
  if (!rows.length) { $('body').innerHTML = '<div class="empty">Пусто — сними фильтр.</div>'; foot(''); return; }

  const cell = (t, r) => {
    const list = DB.agents.filter(a => a.tier === t && a.role === r && fit(a))
      .sort((x, y) => x.ru.localeCompare(y.ru, 'ru'));
    if (!list.length) return '<div class="tcell empty-c"></div>';
    return '<div class="tcell">' + list.map(a =>
      '<div class="ta" data-slug="' + a.slug + '"><div class="pic">' +
        '<img class="p" src="' + portrait(a) + '" alt="" loading="lazy">' +
        '<span class="badges">' +
          (a.el ? '<img src="' + elIcon(a.el) + '" title="' + esc(EL_RU[a.el] || a.el) + '" alt="">' : '') +
        '</span></div>' +
        '<span>' + esc(a.ru) + '</span></div>').join('') + '</div>';
  };
  $('body').innerHTML =
    '<div class="tgrid" style="grid-template-columns:56px repeat(' + cols.length + ',1fr)">' +
      '<div class="thead"><div class="corner"></div>' +
        cols.map(r => '<div><img src="' + roleIcon(r) + '" alt="">' +
          esc(ROLE_RU[r] || r) + '</div>').join('') +
      '</div>' +
      rows.map((t, i) =>
        '<div class="tlab" style="' + tierStyle(t) + '">' + esc(t) + '</div>' +
        cols.map(r => cell(t, r)).join('')).join('') +
    '</div>';
  $('body').querySelectorAll('.ta').forEach(c => c.onclick = () => open(c.dataset.slug));
  foot('Оценки с prydwen.gg для эндгейма PVE. Колонки — роли, строки — тир.');
}

// ── Console: сетка эспера ──────────────────────────────────────────────────
// Живёт внутри карточки: сетка у каждого эспера своя, и в отрыве от персонажа
// планировщик не нужен. Маска — из игры: «-1» значит, что клетки нет вовсе.
// Детали кладём по их настоящим формам, тоже из игры: полоски, уголки, зигзаги.
// Поворот — обычный поворот координат на 90 градусов.
let plan = { cells: {}, pick: null, rot: 0, next: 1, slug: '' };

function gridOf(slug) {
  if (!GEAR || !GEAR.grids) return null;
  const key = 'EquipmentSlots_' + (GRID_OF[slug] || '');
  return GEAR.grids[key] || null;
}
function shapeCells(flat) {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}
function rotate(cells, times) {
  let c = cells.map(p => [p[0], p[1]]);
  for (let i = 0; i < (times % 4 + 4) % 4; i++) c = c.map(p => [p[1], -p[0]]);
  return c;
}
function shapeSize(name) { return shapeCells(GEAR.shapes[name]).length; }
function typeOf(name) {
  const n = shapeSize(name);
  return n === 2 ? 'II' : n === 3 ? 'III' : n === 4 ? 'IV' : '?';
}
// Форму называем по её виду, а не по внутреннему имени из таблицы: «Hen3» и
// «ZhiJiao4» ничего не говорят, а «полоска» и «уголок» говорят.
function shapeName(name) {
  const c = shapeCells(GEAR.shapes[name]);
  const ys = new Set(c.map(p => p[0])), xs = new Set(c.map(p => p[1]));
  if (ys.size === 1) return 'полоска ' + c.length;
  if (xs.size === 1) return 'столбик ' + c.length;
  if (c.length === 4 && ys.size === 2 && xs.size === 2) return 'квадрат';
  if (c.length === 3) return 'уголок';
  return ys.size === 2 || xs.size === 2 ? 'уголок ' + c.length : 'зигзаг ' + c.length;
}

const PIECE_COLORS = { II:'#60a5fa', III:'#4ade80', IV:'#fbbf24' };
function planMask(slug) {
  const g = gridOf(slug);
  return g ? g.mask.map(line => line.split(',').map(x => parseInt(x, 10))) : null;
}
// Набор картриджей эспера из игровых таблиц — нужен и ради значка, и ради
// списка форм, которые он принимает.
function suitOf(name) {
  if (!GEAR || !name) return null;
  const n = String(name).toLowerCase();
  return GEAR.suits.filter(x => String(x.en || '').toLowerCase() === n ||
                                String(x.ru || '').toLowerCase() === n)[0] || null;
}

// ── авторасклад ────────────────────────────────────────────────────────────
// Сетка вмещает больше деталей, чем перечисляет гайд: у Занку двадцать клеток,
// а «II, III, III, IV» занимают двенадцать. Оставшееся место в игре тоже
// заполняют — модулями того типа, за который у эспера начислен бонус
// («+16% крит. урона за каждый модуль типа III»). Поэтому кладём сперва
// перечисленное гайдом, а потом добиваем сетку выгодным типом, пока лезет.
//
// Перебор идёт с откатом: крупные детали первыми, иначе они не находят места.
function traitInfo(g) {
  const t = tr(g.trait || '');
  const type = (t.match(/типа\s+(IV|III|II)/i) || t.match(/Type\s+(IV|III|II)/i) || [])[1] || '';
  const val = parseFloat((t.match(/([\d.]+)\s*%/) || [])[1] || '0');
  // что именно растёт — берём кусок до «за каждый»
  const what = t.split(/за каждый|for each/i)[0].replace(/[+\d.%]+\s*$/, '').trim();
  return { type: type.toUpperCase(), val: val, what: what };
}
function autoLayout(slug, variant) {
  const mask = planMask(slug);
  const g = (GUIDE.agents || {})[slug] || {};
  if (!mask || !GEAR || !GEAR.shapes) return null;

  const suit = suitOf(g.set && g.set.n);
  const H = mask.length, W = mask[0].length;
  // Сначала пробуем формы, которые принимает набор эспера. У части наборов их
  // мало, и такими деталями сетку целиком не закрыть — тогда идём вторым
  // заходом по всем формам игры: лучше полная раскладка чужими формами, чем
  // пустая сетка.
  const suitForms = (suit && suit.geo && suit.geo.length) ? suit.geo : null;
  const tryWith = allowed => {

  // Заранее считаем все варианты «форма + поворот»: сдвигать их по сетке
  // придётся тысячи раз, и пересчитывать координаты каждый раз незачем.
  const forms = [];
  allowed.forEach(name => {
    const seen = new Set();
    for (let rot = 0; rot < 4; rot++) {
      const cells = rotate(shapeCells(GEAR.shapes[name]), rot);
      const ys = cells.map(c => c[0]), xs = cells.map(c => c[1]);
      const y0 = Math.min(...ys), x0 = Math.min(...xs);
      const norm = cells.map(c => [c[0] - y0, c[1] - x0])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const key = JSON.stringify(norm);
      if (seen.has(key)) continue;      // симметричные повороты не плодим
      seen.add(key);
      forms.push({ name: name, t: typeOf(name), cells: norm });
    }
  });

  // Порядок перебора решает, каким выйдет результат. Сперва то, что назвал
  // гайд, потом тип, за который эсперу начислен бонус, и лишь затем остальное.
  const want = (g.pieces || []).slice();
  const need = { II:0, III:0, IV:0 };
  want.forEach(t => { if (need[t] != null) need[t]++; });
  const goodType = traitInfo(g).type || 'III';
  const shift = (variant || 0);
  const rank = f => (need[f.t] > 0 ? 0 : f.t === goodType ? 1 : 2);

  const occ = new Array(H * W).fill(0);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
    if (mask[r][c] < 0) occ[r * W + c] = -1;      // клетки нет вовсе
  const out = [];
  let steps = 0;
  // Лучшее частичное решение: если полного не найдётся, покажем хотя бы его.
  let best = [];

  // Ключевая мысль: на каждом шаге закрываем ПЕРВУЮ свободную клетку. Тогда
  // пропустить её нельзя, и дырок в раскладке не остаётся — жадный проход
  // раньше оставлял по три-пять пустых клеток именно потому, что клал деталь
  // где придётся и обходил неудобные места стороной.
  function firstFree() {
    for (let i = 0; i < occ.length; i++) if (occ[i] === 0) return i;
    return -1;
  }
  function solve() {
    if (steps++ > 60000) return false;            // страховка от долгого перебора
    if (out.length > best.length) best = out.slice();
    const i = firstFree();
    if (i < 0) return true;                        // всё закрыто
    const r0 = Math.floor(i / W), c0 = i % W;
    const list = forms.slice().sort((a, b) => rank(a) - rank(b));
    for (let k = 0; k < list.length; k++) {
      const f = list[(k + shift) % list.length];
      // деталь должна накрыть эту клетку — примеряем каждой своей клеткой
      for (const anchor of f.cells) {
        const dr = r0 - anchor[0], dc = c0 - anchor[1];
        let ok = true;
        const idx = [];
        for (const p of f.cells) {
          const rr = dr + p[0], cc = dc + p[1];
          if (rr < 0 || cc < 0 || rr >= H || cc >= W) { ok = false; break; }
          const j = rr * W + cc;
          if (occ[j] !== 0) { ok = false; break; }
          idx.push(j);
        }
        if (!ok) continue;
        const n = out.length + 1;
        idx.forEach(j => { occ[j] = n; });
        const fromGuide = need[f.t] > 0;
        if (fromGuide) need[f.t]--;
        out.push({ idx: out.length, t: f.t, name: f.name,
                   keys: idx.map(j => Math.floor(j / W) + ':' + (j % W)),
                   extra: !fromGuide });
        if (solve()) return true;
        idx.forEach(j => { occ[j] = 0; });
        out.pop();
        if (fromGuide) need[f.t]++;
      }
    }
    return false;
  }
    return solve() ? out : best;
  };

  const first = tryWith(suitForms || Object.keys(GEAR.shapes));
  const cells = mask.reduce((n, r) => n + r.filter(v => v === 0).length, 0);
  const covered = l => l.reduce((n, p) => n + p.keys.length, 0);
  if (suitForms && covered(first) < cells) {
    const second = tryWith(Object.keys(GEAR.shapes));
    if (covered(second) > covered(first)) return second;
  }
  return first;
}

function planHtml(slug) {
  const mask = planMask(slug);
  if (!mask) return '<div class="hint">Сетка этого эспера ещё не попала в игровые таблицы.</div>';
  const a = agentBy(slug) || {};
  const g = (GUIDE.agents || {})[slug] || {};
  const suit = suitOf(g.set && g.set.n);
  const W = mask[0].length;
  const free = mask.reduce((n, r) => n + r.filter(v => v === 0).length, 0);

  const lay = autoLayout(slug, plan.variant) || [];
  const cellOf = {};
  lay.forEach(pc => pc.keys.forEach(k => { cellOf[k] = pc; }));
  const used = Object.keys(cellOf).length;

  const cnt = { II:0, III:0, IV:0 };
  lay.forEach(pc => { if (cnt[pc.t] != null) cnt[pc.t]++; });
  const ti = traitInfo(g);
  const bonus = ti.type && ti.val ? Math.round(cnt[ti.type] * ti.val * 10) / 10 : 0;

  const legend = lay.map(pc => {
    const cells = shapeCells(GEAR.shapes[pc.name]);
    const ys = cells.map(c => c[0]), xs = cells.map(c => c[1]);
    const y0 = Math.min(...ys), x0 = Math.min(...xs);
    const h = Math.max(...ys) - y0 + 1, w = Math.max(...xs) - x0 + 1;
    let mini = '<span class="shp" style="grid-template-columns:repeat(' + w + ',7px)">';
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const has = cells.some(pt => pt[0] - y0 === r && pt[1] - x0 === c);
      mini += '<i style="' + (has ? 'background:' + (PIECE_COLORS[pc.t] || '#8b92a3') +
        (pc.extra ? ';opacity:.55' : '') : 'opacity:0') + '"></i>';
    }
    return '<div class="pcs' + (pc.extra ? ' extra' : '') + '">' + mini + '</span>' +
      '<b>' + esc(pc.t) + '</b><i>' + esc(shapeName(pc.name)) + '</i></div>';
  }).join('');

  const board = '<div class="board" style="grid-template-columns:repeat(' + W + ',auto)">' +
    mask.map((row, r) => row.map((v, c) => {
      const k = r + ':' + c;
      const pc = cellOf[k];
      const st = v < 0 ? ' off' : (pc ? ' on' : '');
      const bg = pc ? ' style="background:' + (PIECE_COLORS[pc.t] || '#8b92a3') +
        (pc.extra ? ';opacity:.62' : '') + '"' : '';
      return '<div class="cell' + st + '"' + bg + '>' + (pc ? '<b>' + esc(pc.t) + '</b>' : '') + '</div>';
    }).join('')).join('') + '</div>';

  return '<div class="plan">' +
      '<div class="plan-l">' + board +
        '<div class="hint">Сетка типа ' + (a.grid || '?') + ': занято ' + used + ' из ' + free +
          ' клеток. Ярким показаны модули и картриджи из гайда, приглушённым — чем добить остаток.</div>' +
      '</div>' +
      '<div class="plan-r">' +
        '<div class="stat">' +
          '<div class="st"><b>' + cnt.II + '</b>тип II</div>' +
          '<div class="st"><b>' + cnt.III + '</b>тип III</div>' +
          '<div class="st"><b>' + cnt.IV + '</b>тип IV</div>' +
          (bonus ? '<div class="st ok"><b>+' + bonus + '%</b>' + esc(ti.what || 'бонус эспера') + '</div>' : '') +
        '</div>' +
        (g.trait ? '<div class="verdict" style="margin-bottom:12px">' + esc(tr(g.trait)) +
          (bonus ? ' <b>Сейчас на сетке ' + cnt[ti.type] + ' таких — это +' + bonus + '%.</b>' : '') +
          '</div>' : '') +
        (suit || (g.set && g.set.n) ?
          '<div class="cap" style="margin-top:4px"><b>Набор модулей</b><span></span></div>' +
          '<div class="cart" style="margin-bottom:10px">' +
            (suit && suit.icon ? '<img class="cart-ic" src="img/suits/' + esc(suit.icon) + '" alt="">' : '') +
            '<div class="item-b">' +
              '<b style="font-size:14px;color:var(--gold)">' + esc(ruName('carts', g.set.n)) + '</b>' +
              (g.set.b2 ? '<div class="set-b"><i>2</i>' + esc(tr(g.set.b2)) + '</div>' : '') +
              (g.set.b4 ? '<div class="set-b"><i>4</i>' + esc(tr(g.set.b4)) + '</div>' : '') +
            '</div>' +
          '</div>' : '') +
        (lay.length ? '<div class="cap"><b>Что стоит на сетке</b><span></span><em>' +
          lay.length + ' шт.</em></div><div class="pieces-row">' + legend + '</div>' : '') +
        '<button class="fb" id="planNext" style="margin-top:12px">другой вариант раскладки</button>' +
      '</div>' +
    '</div>';
}

function bindPlan() {
  const b = $('planNext');
  if (b) b.onclick = () => {
    plan.variant = (plan.variant || 0) + 1;
    const box = $('shBody');
    if (box) { box.innerHTML = planHtml(plan.slug); bindPlan(); }
  };
}

// ── баннеры ────────────────────────────────────────────────────────────────
// Расписание берётся с prydwen: своей таблицы под баннеры в игре нет. Карточки
// приходят уже сгруппированными — «идут сейчас», «следующие», «объявленные», —
// поэтому просто выводим их подборками в том же порядке.
// Арт для фона плашки баннера. Берём крупную версию обычного вида эспера,
// если её собрал build-nte-art.ps1: в img/art лежит картинка с prydwen, она
// подходит, но у крупной выше и разрешение, и качество.
// Название для плашки. У объявленных заранее баннеров оружия имени у самого
// оружия ещё нет — в расписании стоит имя эспера, которому оно достанется
// («Blackbird», «Akane»). Русского названия для такой строки в базе оружия не
// найдётся, поэтому подставляем имя эспера и пишем, что это его оружие.
function banName(b) {
  const ru = ruName('arcs', b.name);
  if (ru && ru !== b.name) return ru;
  const who = (DB.agents || []).filter(x =>
    String(x.en).toLowerCase() === String(b.name).toLowerCase() ||
    String(x.slug).toLowerCase() === String(b.name).toLowerCase())[0];
  if (who) return 'оружие ' + who.ru;
  return b.name;
}
// Чей это баннер. У плашки оружия в расписании нет ссылки на эспера, хотя
// выходят они парой: первое оружие — к первому эсперу, второе ко второму.
// Пользуемся этим: ищем группу-пару («Оружие — идёт сейчас» ↔ «Идут сейчас»)
// и берём из неё баннер с тем же номером по счёту. Для объявленных заранее
// проще: там в названии прямо стоит имя эспера.
function banOwner(b, all) {
  if (b.slug) return agentBy(b.slug);
  if (b.kind !== 'arc') return null;
  const byName = (DB.agents || []).filter(x =>
    String(x.en).toLowerCase() === String(b.name).toLowerCase() ||
    String(x.slug).toLowerCase() === String(b.name).toLowerCase())[0];
  if (byName) return byName;
  const pair = String(b.key || '').replace('weapon', 'character');
  const mine = all.filter(x => x.key === b.key);
  const theirs = all.filter(x => x.key === pair);
  const i = mine.indexOf(b);
  return i >= 0 && theirs[i] ? agentBy(theirs[i].slug) : null;
}
function bannerArt(a) {
  const def = ((CITY && CITY.skins) || []).filter(x => x.slug === a.slug && x.def && x.pic)[0];
  if (def) {
    const big = ART[String(def.pic).split('/').pop()];
    if (big) return 'img/artbig/' + big;
  }
  return artOf(a);
}
function drawBanners() {
  const list = (GUIDE.banners || []).filter(b => {
    const q = state.q.trim().toLowerCase();
    return !q || (b.name + ' ' + b.patch).toLowerCase().indexOf(q) >= 0;
  });
  // Счётчик на двоих: вкладка теперь и про баннеры, и про события.
  const ев = (evLive && evLive.list) || [];
  $('filters').innerHTML =
    '<div class="fgrp"><u>сроки</u>' +
      '<button class="fb' + (remOn ? ' on' : '') + '" id="remBtn">' +
      (remOn ? 'напоминания включены' : 'напоминать о сроках') + '</button></div>' +
    '<span class="fcnt">' + list.length + ' ' +
    plural(list.length, 'баннер', 'баннера', 'баннеров') +
    (ев.length ? ' · ' + ев.filter(e => e.live && !e.perm).length + ' событий идёт' : '') +
    '</span>';
  // Пустой список баннеров календарь не отменяет: при поиске «Rails» баннеров
  // не найдётся, а события есть, и уходить со страницы ни с чем неправильно.
  if (!list.length) {
    $('body').innerHTML = '<div class="hint">' +
      (state.q.trim()
        ? 'Среди баннеров по запросу ничего нет.'
        : 'Расписания баннеров пока нет — оно приезжает вместе со сборками, ' +
          'прогони nte-pryd.js версии 1.3 или новее.') + '</div>' +
      '<div id="evBox"></div>';
    evDraw();
    bindRem();
    foot('Календарь событий с ntebuild. Даты по серверу EU.');
    return;
  }
  const groups = [];
  list.forEach(b => {
    let g = groups.filter(x => x.name === b.group)[0];
    if (!g) { g = { name: b.group, items: [] }; groups.push(g); }
    g.items.push(b);
  });
  // «идёт сейчас» — если в подборке так и написано; красим зелёным
  const isLive = g => /current/i.test(g.name || '');
  $('body').innerHTML = groups.map(g =>
    '<div class="bgrp">' +
      '<div class="cap" style="margin-top:0"><b>' + esc(ruGroup(g.name)) + '</b><span></span>' +
        '<em>' + g.items.length + '</em></div>' +
      '<div class="bcards">' + g.items.map(b => {
        const a = DB.agents.filter(x => x.slug === b.slug)[0];
        // плашка красится цветом стихии: у эспера своей, у оружия — того,
        // с кем оно выходит
        const own = a || banOwner(b, list);
        // у оружия своего слага нет — ищем иконку по названию в игровой базе
        const pic = a ? portrait(a) : arcPic(b.name);
        const go = a ? ' data-ban-slug="' + esc(a.slug) + '"'
                     : ' data-ban-arc="' + esc(ruName('arcs', b.name) || b.name) + '"';
        // За текстом — крупный арт эспера, как на ntebuild: плашка перестаёт
        // быть строкой списка и сразу читается, кто на баннере. Арт берём тот
        // же, что и в карточке, только фоном и с затемнением. Если крупного
        // нет (оружие, новый эспер) — плашка остаётся обычной.
        const bg = a ? bannerArt(a) : '';
        return '<div class="bc' + (isLive(g) ? ' live' : '') + (b.top ? ' bc-main' : '') +
            (bg ? ' bc-art' : '') + (own && own.el ? ' bc-el' : '') + '"' +
            (own && own.el ? ' style="' + elStyle(own.el) + '"' : '') +
            go + ' title="открыть' + (a ? ' карточку эспера' : ' оружие') + '">' +
          (bg ? '<div class="bc-art-i" style="--bg:url(\'' + bg + '\')"></div>' : '') +
          (pic ? '<img src="' + pic + '" alt="" loading="lazy">' : '') +
          '<div class="bc-b">' +
            '<b><span class="bc-k' + (b.kind === 'arc' ? ' arc' : '') + '">' +
              (b.kind === 'arc' ? 'оружие' : 'эспер') + '</span>' +
              esc(a ? a.ru : banName(b)) + '</b>' +
            (b.patch ? '<i>' + esc(b.patch) + '</i>' : '') +
            (b.from ? '<i class="bc-d">' + esc(banDates(b)) + '</i>' :
              (b.dates ? '<i class="bc-d">' + esc(b.dates) + '</i>' :
                         '<i class="bc-d off">даты ещё не объявлены</i>')) +
            banClock(b) +
          '</div></div>';
      }).join('') + '</div>' +
    '</div>').join('');
  $('body').querySelectorAll('[data-ban-slug]').forEach(c =>
    c.onclick = () => open(c.dataset.banSlug));
  // Оружие карточкой не открывается — оно живёт списком, поэтому переносим на
  // вкладку «Оружие» и подставляем название в поиск.
  $('body').querySelectorAll('[data-ban-arc]').forEach(c => c.onclick = () => {
    state.tab = 'arcs'; state.q = c.dataset.banArc; state.rar = '';
    $('q').value = state.q; drawTabs(); draw();
  });
  // Календарь событий идёт следом за баннерами, на той же вкладке. Раньше это
  // были две вкладки, и события показывались дважды: коротким блоком тут и
  // полным списком там. Данные при этом разные — баннеры приезжают с prydwen,
  // календарь с ntebuild, — поэтому их не разделили, а сложили в одну ленту:
  // сначала что крутится в баннерах, потом чем занят сам патч.
  $('body').insertAdjacentHTML('beforeend', '<div id="evBox"></div>');
  evDraw();
  startBanTick();
  bindRem();
  foot('Расписание баннеров с prydwen, календарь событий с ntebuild. Даты по серверу EU.');
}

// ── события патча ──────────────────────────────────────────────────────────
// Календаря событий в файлах игры нет: даты активностей приходят с сервера
// игры и в таблицы не попадают. Поэтому список тянет воркер со сводного
// календаря ntebuild, а страница показывает, что идёт сейчас и что скоро.
const EV_API = API_BASES.map(b => b + '/api/nte/events');
let evLive = null;
let evAsked = 0;       // запрос на события уже отправлен — второй раз не нужно
const EV_KIND = {
  'In-Game Event': 'событие', 'Ongoing Activity': 'постоянная активность',
  'Beyond the Rails': 'За рельсами', 'Character Banner': 'баннер эспера',
  'Arc Banner': 'баннер оружия', 'Major Update': 'обновление',
  'Livestream': 'стрим'
};
// Названия событий не переводим: они всплывают в игре по-английски, и русский
// вариант только мешает искать. А вот награды — те же предметы, что в кодах,
// и у них перевод уже есть.
// Названия и награды приходят с чужой страницы в сыром виде: «Hunter&#x27;s
// Crucible», «&quot;Tide&quot; watercraft». Раскрываем сущности до показа —
// иначе на плашке так и висит «&#x27;». Раскрываем только сами сущности,
// разметку не трогаем: дальше строка всё равно уходит через esc().
function unent(s) {
  return String(s == null ? '' : s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
// Русское имя события. Нет в словаре — показываем английское: лучше так, чем
// пустая карточка у события, вышедшего после последней правки словаря.
function evName(e) {
  const ru = EVRU[e && e.slug];
  return ru || unent(e && e.name);
}
function evRew(s) {
  return rewHtml(unent(s).replace(/\s{2,}/g, ' · '));
}
// Сколько осталось — единственная формула на всю страницу. Раньше их было
// две: одна считала до полуночи, другая до конца последнего дня, и на плашке
// выходило «осталось 2 дн. · ещё 1 день».
function evLeft(e) {
  if (!e || e.perm || !e.to) return null;
  const end = Date.parse(e.to + 'T23:59:59Z');
  if (!isFinite(end)) return null;
  return Math.ceil((end - Date.now()) / 86400000);
}
function evDays(e) {
  if (e.perm) return 'постоянно';
  if (!e.to) return e.from ? 'с ' + ruDate(e.from) : '';
  const left = evLeft(e);
  if (left != null && left < 0) return 'закончилось ' + ruDate(e.to);
  return ruDate(e.from) + ' — ' + ruDate(e.to);
}
// Номер патча воркер не отдаёт — в календаре ntebuild его нет отдельным полем.
// Зато он есть в названиях: «Circle Bounty — Version 1.3». Берём оттуда.
function evVer() {
  if (evLive && evLive.ver) return evLive.ver;
  const m = ((evLive && evLive.list) || [])
    .map(e => /version\s+([\d.]+)/i.exec(e.name || ''))
    .filter(Boolean)[0];
  return m ? m[1] : '';
}
function evDraw() {
  const box = $('evBox');
  if (!box) return;
  if (!evLive) { if (!evAsked) { evAsked = 1; evRefresh(); } 
    box.innerHTML = '<div class="cap"><b>События патча</b><span></span>' +
      '<em>едут с воркера…</em></div>';
    return;
  }
  const q = state.q.trim().toLowerCase();
  const all = (evLive.list || []).filter(e =>
    !q || ((e.name || '') + ' ' + evName(e) + ' ' + (e.rew || ''))
      .toLowerCase().indexOf(q) >= 0);
  const идут = all.filter(e => e.live && !e.perm).sort(evSort);
  const скоро = all.filter(e => e.soon && !e.live).sort(evSort);
  const пост = all.filter(e => e.perm && !e.live && !e.soon)
                  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
  const прошли = all.filter(e => !e.live && !e.soon && !e.perm).sort(evSort).reverse();
  const блок = (t, list, note) => list.length
    ? '<div class="cap"><b>' + esc(t) + '</b><span></span><em>' + list.length + '</em></div>' +
      (note ? '<div class="hint" style="margin:0 0 8px">' + note + '</div>' : '') +
      '<div class="evcs">' + list.map(evCard).join('') + '</div>'
    : '';
  box.innerHTML =
    '<div class="cap"><b>События' + (evVer() ? ' патча ' + esc(evVer()) : '') + '</b>' +
      '<span></span><em>' + идут.length + ' идут · ' + скоро.length + ' скоро</em></div>' +
    блок('Идут сейчас', идут) +
    блок('Скоро начнутся', скоро) +
    блок('Постоянные', пост, 'Доступны всегда — заходить можно в любой момент.') +
    (прошли.length
      ? '<details class="mfold" style="margin-top:12px"><summary><b>Уже закончились</b> · ' +
        прошли.length + '</summary><div class="mfold-in">' +
        '<div class="evcs" style="margin-top:10px">' + прошли.slice(0, 24).map(evCard).join('') +
        '</div></div></details>'
      : '') +
    (q && !идут.length && !скоро.length && !пост.length && !прошли.length
      ? '<div class="hint">По запросу среди событий ничего не нашлось.</div>' : '');
}
// ── карточки событий ───────────────────────────────────────────────────────
function evSort(a, b) {
  // сначала то, что вот-вот кончится
  const ta = Date.parse(a.to) || Infinity, tb = Date.parse(b.to) || Infinity;
  return ta - tb || String(a.name).localeCompare(String(b.name), 'ru');
}
// Хвост строки со сроком. У того, что ещё не началось, считать «сколько
// осталось» нельзя: выходило «Fons Rush · ещё 16 дней» у события, которое
// стартует через неделю. Для таких — сколько ждать старта.
function evTail(e, дней) {
  if (!e || e.perm) return '';
  const старт = Date.parse((e.from || '') + 'T00:00:00Z');
  if (isFinite(старт) && старт > Date.now()) {
    const ч = Math.ceil((старт - Date.now()) / 86400000);
    return ' · старт через ' + ч + ' ' + plural(ч, 'день', 'дня', 'дней');
  }
  if (дней == null || дней < 0) return '';
  return ' · ' + (дней <= 1 ? 'последний день'
                : 'ещё ' + дней + ' ' + plural(дней, 'день', 'дня', 'дней'));
}
function evCard(e) {
  const дней = evLeft(e);
  const горит = дней != null && дней >= 0 && дней <= 3;
  return '<div class="evc' + (e.live ? ' on' : '') + (e.soon ? ' soon' : '') +
      (e.perm ? ' perm' : '') + (горит ? ' hot' : '') + '">' +
    '<div class="evc-h">' +
      '<b>' + esc(evName(e)) + '</b>' +
      (e.kind ? '<u>' + esc(EV_KIND[e.kind] || e.kind) + '</u>' : '') +
    '</div>' +
    '<div class="evc-d">' + esc(evDays(e)) + esc(evTail(e, дней)) + '</div>' +
    (evName(e) !== unent(e.name) ? '<div class="evc-en">' + esc(unent(e.name)) + '</div>' : '') +
    (e.rew ? '<div class="evc-r">' + evRew(e.rew) + '</div>' : '') +
  '</div>';
}
async function evRefresh(force) {
  const one = u => fetch(u + (force ? '?fresh=1' : ''), { cache: 'no-store' })
    .then(r => r.json())
    .then(j => (j && j.list && j.list.length) ? j : Promise.reject(new Error('пусто')));
  try {
    evLive = await Promise.any(EV_API.map(one));
    if (state.tab === 'ban') evDraw();
    // на главной события идут в блок «что горит» — там нужна полная перерисовка
    if (state.tab === 'espers') draw();
  } catch (e) { evLive = null; }
}
// ── обратный отсчёт ────────────────────────────────────────────────────────
// Дни округлённо — мало: под конец фазы важно, сколько именно часов осталось
// на добивание баннера. Пересчитываем раз в секунду, но только текст внутри
// уже нарисованных карточек, чтобы не перерисовывать вкладку.
let banTimer = null;
function banClock(b) {
  const st = Date.parse(b.from), en = Date.parse(b.to);
  if (!st && !en) return '';
  return '<i class="bc-t" data-st="' + (st || 0) + '" data-en="' + (en || 0) + '"></i>';
}
function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
  const m = Math.floor(s % 3600 / 60), ss = s % 60;
  const p = n => (n < 10 ? '0' : '') + n;
  return (d ? d + ' ' + plural(d, 'день', 'дня', 'дней') + ' ' : '') + p(h) + ':' + p(m) + ':' + p(ss);
}
function banTick() {
  const els = document.querySelectorAll('.bc-t');
  if (!els.length) { clearInterval(banTimer); banTimer = null; return; }
  const now = Date.now();
  els.forEach(el => {
    const st = +el.dataset.st, en = +el.dataset.en;
    // Конец дан датой без времени — это полночь, то есть баннер живёт
    // весь последний день; поэтому к нему прибавляем сутки.
    const end = en ? en + 86400000 : 0;
    if (st && now < st) { el.className = 'bc-t soon'; el.textContent = 'старт через ' + hms(st - now); }
    else if (end && now < end) { el.className = 'bc-t'; el.textContent = 'осталось ' + hms(end - now); }
    else if (end) { el.className = 'bc-t done'; el.textContent = 'завершён'; }
    else el.textContent = '';
  });
}
function startBanTick() {
  banTick();
  if (!banTimer) banTimer = setInterval(banTick, 1000);
}
// Даты приходят в ISO («2026-08-19») — показываем по-нашему, днём и месяцем.
// Если баннер идёт прямо сейчас, дописываем, сколько ему осталось.
// Иконка Arc из игровой базы: у баннеров оружия нет ни слага, ни картинки —
// сопоставляем по названию, английскому или русскому.
function arcPic(name) {
  if (!GEAR || !name) return '';
  const n = String(name).toLowerCase();
  const a = GEAR.arcs.filter(x => String(x.en || '').toLowerCase() === n ||
                                  String(x.ru || '').toLowerCase() === n)[0];
  if (a) return 'img/arcs/' + a.icon;
  // У будущих баннеров оружие ещё безымянное, и prydwen подписывает их именем
  // эспера («Blackbird», «Akane Rin»). Ставим тогда его портрет — лучше, чем
  // пустая рамка.
  const who = DB.agents.filter(x => String(x.en || '').toLowerCase() === n ||
                                    String(x.ru || '').toLowerCase() === n)[0];
  return who ? portrait(who) : '';
}
function banDates(b) {
  const d = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? m[3] + '.' + m[2] : ''; };
  const from = d(b.from), to = d(b.to);
  if (!from) return b.dates || '';
  // «Осталось N дней» тут не пишем: строкой ниже идёт живой отсчёт с
  // секундами, и на плашке получалось два одинаковых текста подряд. В
  // карточке эспера отсчёта нет — туда дни добавляет banLeft.
  return from + (to ? ' — ' + to : '');
}
// Сколько осталось — словами. Нужно там, где нет бегущего отсчёта: в карточке
// эспера на вкладке «Сейчас».
function banLeft(b) {
  const end = Date.parse(b && b.to), now = Date.now();
  if (!end || end <= now) return '';
  const days = Math.ceil((end - now) / 86400000);
  if (days > 60) return '';
  return ', осталось ' + days + ' ' + plural(days, 'день', 'дня', 'дней');
}
function plural(n, a, b2, c) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return a;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return b2;
  return c;
}

// Заголовки подборок приходят по-английски — переводим знакомые, остальные
// показываем как есть: список у них время от времени меняется.
function ruGroup(s) {
  const map = {
    'Current Banners': 'Идут сейчас',
    'Current Arc Banners': 'Оружие — идёт сейчас',
    'Next Character Banners': 'Следующие эсперы',
    'Next Weapon Banners': 'Следующее оружие',
    'Upcoming Banners': 'Объявленные'
  };
  return map[s] || s || 'Баннеры';
}

// ── команды ────────────────────────────────────────────────────────────────
// Состав — это четыре слота, и в слоте может стоять несколько взаимозаменяемых
// эсперов: у prydwen так и нарисовано. Поэтому слот — всегда массив.
function agentBy(slug) { return DB.agents.filter(x => x.slug === slug)[0] || null; }
function slotHtml(slugs) {
  return '<div class="slot">' + slugs.map(s => {
    const a = agentBy(s);
    return '<div class="alt" data-slug="' + esc(s) + '">' +
      '<img src="' + (a ? portrait(a) : '') + '" alt="" loading="lazy">' +
      '<span>' + esc(a ? a.ru : s) + '</span></div>';
  }).join('') + '</div>';
}
function teamMatches(t, q) {
  if (!q) return true;
  const names = t.slots.flat().map(s => { const a = agentBy(s); return a ? a.ru + ' ' + a.en : s; });
  return (t.name + ' ' + names.join(' ')).toLowerCase().indexOf(q) >= 0;
}
function teamsHtml(list, withTier) {
  return list.map(t =>
    '<div class="team">' +
      (withTier ? '<div class="team-l ' + (t.tier === 'S+' ? 't0' : (!t.tier || /C|D/.test(t.tier)) ? 't3' : '') +
        '" title="' + (t.tier ? 'место в тир-листе команд' : 'этого состава в тир-листе команд нет') + '">' +
        esc(t.tier || '·') + '</div>' : '') +
      '<div class="team-n">' + esc(t.name || 'состав') +
        (t.note ? '<i>' + esc(t.note) + '</i>' : '') + '</div>' +
      '<div class="team-s">' + t.slots.map(slotHtml).join('') + '</div>' +
    '</div>').join('');
}
// ── вкладка «Команды» ──────────────────────────────────────────────────────
// Составы приезжают из двух мест: тир-лист команд prydwen (там есть место) и
// карточки эсперов (там места нет, зато составов больше). Приоритет у
// тир-листа: если состав есть в обоих, берём его версию с местом, а из
// карточки — только те, которых в тир-листе нет.
function allTeams() {
  const out = [], seen = new Set();
  const key = t => teamKey(t) || t.slots.map(s => s.slice().sort().join('/')).join('|');
  (GUIDE.teams || []).forEach(t => {
    const k = key(t);
    if (seen.has(k)) return;
    seen.add(k); out.push(Object.assign({}, t, { src: 'тир-лист команд' }));
  });
  Object.keys(GUIDE.agents || {}).forEach(slug => {
    ((GUIDE.agents[slug] || {}).teams || []).forEach(t => {
      const k = key(t);
      if (seen.has(k) || t.slots.length < 3) return;
      seen.add(k);
      out.push(Object.assign({}, t, { tier: '', src: 'из гайда ' + (agentBy(slug) || {}).ru }));
    });
  });
  return out;
}
// Выбранные эсперы на вкладке «Команды» — лежат в браузере, чтобы не
// сбрасываться при переходе на карточку и обратно.
function teamPick() {
  try { return JSON.parse(sessionStorage.getItem('nte-team-pick')) || []; }
  catch (e) { return []; }
}
function teamPickSave(v) {
  try { sessionStorage.setItem('nte-team-pick', JSON.stringify(v)); } catch (e) {}
}
function drawTeams() {
  const q = state.q.trim().toLowerCase();
  const pick = teamPick();
  let list = allTeams();
  if (q) list = list.filter(t => ((t.name || '') + ' ' + t.slots.map(s => s.map(x => {
    const a = agentBy(x); return (a ? a.ru + ' ' + a.en : x);
  }).join(' ')).join(' ')).toLowerCase().indexOf(q) >= 0);
  const byTier = (x, y) => {
    const r = t => { const i = TIERS.indexOf(t.tier); return i < 0 ? 99 : i; };
    return r(x) - r(y) || String(x.name || '').localeCompare(String(y.name || ''), 'ru');
  };
  list.sort(byTier);

  const has = (t, slug) => t.slots.some(sl => sl.indexOf(slug) >= 0);
  // Стихия состава — стихия эспера из первого слота: там стоит тот, вокруг
  // кого состав и собран. По ней же фильтруем и группируем.
  const teamEl = t => {
    const first = (t.slots[0] || [])[0];
    const a = first && agentBy(first);
    return a ? a.el : '';
  };
  const teamEls = t => [...new Set(t.slots.flat().map(x => {
    const a = agentBy(x); return a ? a.el : '';
  }).filter(Boolean))];
  // Отбор по стихии: оставляем составы, где эспер такой стихии вообще есть.
  if (state.el) list = list.filter(t => teamEls(t).indexOf(state.el) >= 0);

  // Выбрано несколько — сверху составы, где они играют вместе. Нет таких —
  // блок не показываем вовсе, чтобы не создавать ощущение, что он пустой.
  let blocks = [];
  if (pick.length === 0) {
    // Никто не выбран — раскладываем по стихиям: так видно, чем вообще
    // играют за каждую стихию, а не сплошной список из сорока составов.
    //
    // Стихия состава — по первому слоту, но фильтр оставляет и те составы,
    // где выбранная стихия стоит вторым-третьим номером. Из-за этого при
    // выбранной Лакшане первым блоком оказывалась Анима: у состава ведущим
    // был анимовый эспер. Поэтому при выбранной стихии её блок идёт первым,
    // а внутри него — сначала составы, где эспер этой стихии ведущий.
    const els = [...new Set(list.map(teamEl).filter(Boolean))]
      .sort((a, b) =>
        (a === state.el ? -1 : 0) - (b === state.el ? -1 : 0) ||
        String(EL_RU[a] || a).localeCompare(String(EL_RU[b] || b), 'ru'));
    if (state.el) {
      // при выбранной стихии блок один: все составы с ней, ведущие сверху
      const own = list.slice().sort((x, y) =>
        (teamEl(x) === state.el ? 0 : 1) - (teamEl(y) === state.el ? 0 : 1));
      blocks.push({ t: EL_RU[state.el] || state.el, n: own.length + ' составов',
                    list: own, el: state.el });
    } else {
      els.forEach(el => {
        const own = list.filter(t => teamEl(t) === el);
        if (own.length) blocks.push({ t: EL_RU[el] || el, n: own.length + ' составов',
                                      list: own, el: el });
      });
      const rest = list.filter(t => !teamEl(t));
      if (rest.length) blocks.push({ t: 'Прочие', n: rest.length + ' составов', list: rest });
    }
  } else if (pick.length === 1) {
    const a = agentBy(pick[0]);
    blocks.push({ t: 'Составы с ним', n: (a ? a.ru : pick[0]), list: list.filter(x => has(x, pick[0])) });
  } else {
    const both = list.filter(x => pick.every(p => has(x, p)));
    if (both.length) {
      blocks.push({ t: 'Играют вместе', n: both.length + ' составов', list: both });
    }
    pick.forEach(p => {
      const a = agentBy(p);
      const own = list.filter(x => has(x, p) && both.indexOf(x) < 0);
      if (own.length) blocks.push({ t: a ? a.ru : p, n: own.length + ' составов', list: own });
    });
  }
  blocks = blocks.filter(b => b.list.length);

  // полоса портретов: только те, кто вообще встречается в составах
  const inTeams = {};
  allTeams().forEach(t => t.slots.forEach(sl => sl.forEach(x => inTeams[x] = (inTeams[x] || 0) + 1)));
  const roster = DB.agents.filter(a => inTeams[a.slug])
    .sort((x, y) => (inTeams[y.slug] - inTeams[x.slug]) || x.ru.localeCompare(y.ru, 'ru'));

  // Фильтр по стихии вернулся на место: он был на этой вкладке до того, как
  // её переписали под выбор по портретам, и одно другому не мешает —
  // портреты сужают до конкретных эсперов, стихия отсекает целиком.
  const allEls = [...new Set(DB.agents.map(a => a.el).filter(Boolean))].sort();
  $('filters').innerHTML =
    fgroup('стихия', 'el', allEls, elIcon, EL_RU) +
    '<span class="fcnt">' +
    (pick.length ? 'выбрано ' + pick.length + ' · ' : '') +
    blocks.reduce((n, b) => n + b.list.length, 0) + ' составов</span>';
  bindFilters();

  $('body').innerHTML =
    '<div class="roster">' + roster.map(a =>
      '<button class="rost' + (pick.indexOf(a.slug) >= 0 ? ' on' : '') + '" data-pick="' +
        esc(a.slug) + '" title="' + esc(a.ru) + ' · в ' + inTeams[a.slug] + ' составах">' +
        '<img src="' + portrait(a) + '" alt="" loading="lazy"><span>' + esc(a.ru) + '</span>' +
      '</button>').join('') +
      (pick.length ? '<button class="rost clr" data-pick="">сбросить</button>' : '') +
    '</div>' +
    (blocks.length
      ? blocks.map(b => (b.t ? '<div class="cap"' +
          (b.el ? ' style="--capc:var(--' + esc(b.el) + ')"' : '') + '><b>' +
          (b.el ? '<img src="' + elIcon(b.el) + '" alt="" ' +
            'style="width:16px;height:16px;vertical-align:-3px;margin-right:6px">' : '') +
          esc(b.t) + '</b><span></span><em>' + esc(b.n) + '</em></div>' : '') +
          '<div class="list">' + teamsHtml(b.list.map(t =>
            Object.assign({}, t, { note: t.src })), true) + '</div>').join('')
      : '<div class="empty">Составов с этими эсперами нет. Сними кого-нибудь из выбранных.</div>');

  $('body').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const slug = b.dataset.pick;
    if (!slug) { teamPickSave([]); draw(); return; }
    const cur = teamPick();
    const i = cur.indexOf(slug);
    if (i >= 0) cur.splice(i, 1); else cur.push(slug);
    teamPickSave(cur); draw();
  });
  bindTeamClicks();
  foot('Составы с prydwen: место — из тир-листа команд, остальные из гайдов эсперов. ' +
       'Нажми портреты сверху — покажу составы с ними; если выбрано несколько, ' +
       'сначала идут те, где они играют вместе.');
}
function bindTeamClicks() {
  $('body').querySelectorAll('.alt').forEach(c => c.onclick = () => open(c.dataset.slug));
}
// ── город: транспорт и жильё ───────────────────────────────────────────────
// Не боёвка, но в NTE это половина игры: машину надо купить и обвесить,
// квартиру — купить и обставить. Данные из таблиц игры, файл отдельный.
const CUR_ICO = { Fons: 'Icon_Fonizie.png', Annulith: 'Icon_Ringstone.png',
                  gold: 'item_Coin_Beetle.png', Beetle: 'item_Coin_Beetle.png' };
const CUR_RU  = { Fons: 'фонсы', Annulith: 'аннулит', gold: 'монеты',
                  RobbankCoin: 'жетоны Robbank', Beetle: 'монеты' };
// Цену показываем значком валюты, а не словом: в игре её тоже узнают по
// картинке, и строка «4 000 000 фонсов» занимает полкарточки.
function money(n, cur) {
  const ic = CUR_ICO[cur];
  const t = CUR_RU[cur] || cur || '';
  return '<span class="cash" title="' + esc(t) + '">' +
    (ic ? '<img src="img/items/' + esc(ic) + '" alt="" loading="lazy">' : '') +
    '<b>' + num(n) + '</b>' + (ic ? '' : ' ' + esc(t)) + '</span>';
}
const CAR_SRC = { Shop: 'покупается в салоне', Quest: 'за задание', Activity: 'за событие',
                  Gift: 'подарок', Default: 'выдаётся сразу' };
function carSrc(s) { return CAR_SRC[s] || (s ? 'источник: ' + s : 'источник неизвестен'); }
// Характеристики машины: слева значение со стока, справа — до чего доводится
// тюнингом. Оба числа считает сборщик: игра держит их не в записи машины, а
// в её деталях, и складывает сама.
function vstatsHtml(stats) {
  const list = (stats || []).filter(s => s && (s.v || s.max));
  if (!list.length) return '';
  return '<div class="vstats">' + list.map(s => {
    const v = s.v || 0, mx = Math.max(s.max || 0, v);
    const up = mx > v;
    return '<div class="vst">' +
      '<i>' + esc(s.k) + '</i>' +
      '<div class="vst-n"><b>' + v + '</b>' +
        (up ? '<s>→ ' + mx + '</s>' : '') + '</div>' +
      '<div class="vst-b">' +
        (up ? '<em style="width:100%"></em>' : '') +
        '<u style="width:' + Math.round(v / (mx || 1) * 100) + '%"></u>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}
// Узел тюнинга: сколько вариантов, почём и что меняют.
function partsHtml(parts) {
  const keys = Object.keys(parts || {});
  if (!keys.length) return '<div class="hint">Тюнинга у этой машины нет.</div>';
  return '<div class="wide">' + keys.map(t => {
    const list = parts[t] || [];
    return '<details class="node"><summary><b>' + esc(t) + '</b>' +
      '<em>' + list.length + '</em></summary>' +
      '<div class="node-in">' + list.map(m =>
        '<div class="tune' + (m.def ? ' std' : '') + '">' +
          '<div class="tune-t"><b>' + esc(m.ru || m.id) + '</b>' +
            (m.def ? '<span class="gsh">заводская</span>' : '') +
            (m.price ? money(m.price, m.cur) : '<span class="gsh">бесплатно</span>') +
          '</div>' +
          ((m.sc || []).length ? '<div class="tune-s">' + m.sc.map(x =>
            '<span class="gsh">' + esc(x.k) + ' <b>' + x.v + '</b></span>').join('') + '</div>' : '') +
          (m.desc ? '<div class="hint" style="margin:4px 0 0">' + esc(m.desc) + '</div>' : '') +
        '</div>').join('') + '</div></details>';
  }).join('') + '</div>';
}
function carCard(c) {
  // filter(Boolean) — страховка от пустых элементов в данных: одна такая
  // дырка роняла отрисовку всего списка машин, и вкладка не открывалась
  const skins = (c.skins || []).filter(Boolean);
  return '<details class="suit">' +
    '<summary>' +
      (c.icon ? '<img class="cart-ic car-ic" src="img/cars/' + esc(c.icon) + '" alt="" loading="lazy">' : '') +
      '<div class="item-b">' +
        '<b style="font-size:14px;color:var(--gold)">' + esc(c.ru) + '</b>' + rarPill(c.rar) +
        (c.brand ? '<span class="brand">' + esc(c.brand) + '</span>' : '') +
        '<div class="geo">' +
          (c.price ? '<span class="gsh">' + money(c.price, c.cur) + '</span>'
                   : '<span class="gsh">' + esc(carSrc(c.src)) + '</span>') +
          (c.mods ? '<span class="gsh">' + c.mods + ' деталей тюнинга</span>' : '') +
          (skins.length ? '<span class="gsh">' + skins.length + ' раскрасок</span>' : '') +
        '</div>' +
      '</div>' +
    '</summary>' +
    '<div class="suit-in">' +
      (c.desc ? '<div class="sec full"><div class="hint">' + esc(c.desc) + '</div></div>' : '') +
      ((c.stats || []).length ?
        '<div class="sec full">' +
          cap2('Характеристики', 'со стока → с тюнингом') + vstatsHtml(c.stats) +
          '<div class="hint">Потолок считается по каждой характеристике отдельно: ' +
          'в каждом узле берётся лучшая по ней деталь. Собрать все максимумы ' +
          'одновременно не всегда выйдет — в узле у деталей разный набор.</div>' +
          (c.modGold ? '<div class="hint">Полный комплект деталей, без косметики: ' +
            money(c.modGold, 'Fons') + '</div>' : '') +
        '</div>' : '') +
      (Object.keys(c.parts || {}).length
        ? '<div class="sec full">' + cap2('Тюнинг', 'по узлам') + partsHtml(c.parts) + '</div>' : '') +
      (skins.length ? '<div class="sec">' + cap2('Раскраски', skins.length + ' шт.') +
        '<div class="wide">' + skins.map(sk =>
          '<div class="part">' +
            (sk.icon ? '<img src="img/cars/' + esc(String(sk.icon).split('/').pop()) +
              '" alt="" loading="lazy">' : '') +
            '<div class="part-b"><b>' + esc(sk.ru || sk.id) + '</b>' +
              (sk.desc ? '<div class="hint" style="margin:3px 0 0">' + esc(sk.desc) + '</div>' : '') +
            '</div></div>').join('') + '</div></div>' : '') +
      // машина есть в таблицах, а данных по ней нет — так честнее, чем пустое место
      (!(c.stats || []).length && !Object.keys(c.parts || {}).length && !skins.length
        ? '<div class="sec full"><div class="hint">В таблицах игры по этой машине ' +
          'только источник (' + esc(carSrc(c.src)) + '): ни тюнинга, ни характеристик, ' +
          'ни раскрасок там нет.</div></div>' : '') +
    '</div>' +
  '</details>';
}
// Кадры интерьера в том порядке, в каком их показывает игра: сначала здание
// снаружи, потом вид жилья целиком, потом шесть фотографий комнат.
function flatPics(f) {
  const out = [];
  if (f.top)  out.push({ pic: 'img/flats/' + f.top,  ru: 'Здание' });
  if (f.plan) out.push({ pic: 'img/flats/' + f.plan, ru: 'Жильё целиком' });
  (f.rooms || []).forEach((p, i) => out.push({ pic: 'img/flats/' + p, ru: 'Фото ' + (i + 1) }));
  if (!out.length && f.pic) out.push({ pic: 'img/flats/' + f.pic, ru: '' });
  return out;
}
function galHtml(pics, id) {
  if (!pics.length) return '';
  return '<div class="gal" data-gal="' + esc(id) + '">' +
    '<div class="gal-win"><img class="gal-big" id="gal-' + esc(id) + '" src="' +
      esc(pics[0].pic) + '" alt=""></div>' +
    (pics[0].ru ? '<div class="gal-cap" id="galc-' + esc(id) + '">' + esc(pics[0].ru) + '</div>' : '') +
    (pics.length > 1 ? '<div class="gal-row">' + pics.map((p, i) =>
      '<button class="gal-t' + (i ? '' : ' on') + '" data-gi="' + i + '" title="' + esc(p.ru) + '">' +
      '<img src="' + esc(p.pic) + '" alt="" loading="lazy"></button>').join('') + '</div>' : '') +
  '</div>';
}
// Переключение кадров — одним обработчиком на весь список: карточек домов
// семь, а кнопок под полсотни, вешать на каждую отдельный смысла нет.
let galTimer = null;
function bindGal(pack) {
  if (galTimer) { clearInterval(galTimer); galTimer = null; }
  const boxes = [];
  document.querySelectorAll('.gal').forEach(box => {
    const id = box.dataset.gal, pics = pack[id] || [];
    // Кадр меняется через затухание: сначала гасим, подменяем на невидимом,
    // потом проявляем. Резкая подмена при автолистании дёргала глаз.
    const show = (i, fast) => {
      const p = pics[i]; if (!p) return;
      const big = $('gal-' + id), cap = $('galc-' + id);
      const put = () => {
        if (big) big.src = p.pic;
        if (cap) cap.textContent = p.ru || '';
      };
      if (big && !fast) {
        const pre = new Image();          // ждём загрузку, иначе мигнёт пустотой
        pre.onload = pre.onerror = () => {
          big.classList.add('fade');
          setTimeout(() => { put(); big.classList.remove('fade'); }, 260);
        };
        pre.src = p.pic;
      } else { put(); }
      box.querySelectorAll('.gal-t').forEach(t =>
        t.classList.toggle('on', +t.dataset.gi === i));
      box.dataset.gi = i;
    };
    box.querySelectorAll('[data-gi]').forEach(b2 => b2.onclick = () => {
      show(+b2.dataset.gi, true);    // по клику — сразу, без затухания
      box.dataset.hold = '1';        // ткнул руками — дальше не листаем сами
    });
    if (pics.length > 1) boxes.push({ box: box, pics: pics, show: show });
  });
  // Кадры перелистываются сами раз в пять секунд: у дома их восемь, и щёлкать
  // по всем, чтобы просто посмотреть квартиру, утомительно. Как только ткнул
  // мышью — автолистание для этого дома выключается, чтобы не перебивало.
  if (!boxes.length) return;
  galTimer = setInterval(() => {
    boxes.forEach(g => {
      if (g.box.dataset.hold === '1') return;
      if (!g.box.closest('details[open]')) return;   // закрытую карточку не листаем
      const i = (+g.box.dataset.gi || 0) + 1;
      g.show(i >= g.pics.length ? 0 : i);
    });
  }, 5000);
}
function flatCard(f, anom) {
  const pic = f.pic ? 'img/flats/' + f.pic : '';
  return '<details class="suit">' +
    '<summary>' +
      (pic ? '<img class="cart-ic flat-ic" src="' + esc(pic) + '" alt="" loading="lazy">' : '') +
      '<div class="item-b">' +
        '<b style="font-size:14px;color:var(--gold)">' + esc(f.ru) + '</b>' +
        '<span class="brand">' + esc(f.type) + '</span>' +
        (f.addr ? '<div class="hint" style="margin:4px 0 0">' + esc(f.addr) + '</div>' : '') +
        '<div class="geo">' +
          (f.price ? '<span class="gsh">' + money(f.price, f.cur) + '</span>' : '') +
          (f.park ? '<span class="gsh">парковка на ' + f.park + '</span>' : '') +
          (f.load ? '<span class="gsh">мебели на ' + num(f.load) + '</span>' : '') +
          (f.sale && f.sale !== 'OnSale' ? '<span class="gsh">не продаётся</span>' : '') +
        '</div>' +
      '</div>' +
    '</summary>' +
    '<div class="suit-in">' +
      (f.slog || f.desc ? '<div class="sec full">' +
        (f.slog ? '<div class="hint">' + esc(f.slog) + '</div>' : '') +
        (f.desc ? '<div class="hint">' + esc(f.desc) + '</div>' : '') + '</div>' : '') +
      (() => { const ps = flatPics(f); return ps.length
        ? '<div class="sec">' + cap2('Как выглядит', ps.length + ' фото') +
          galHtml(ps, f.id) + '</div>' : ''; })() +
      // мебель — на всю ширину: восемнадцать предметов в одной колонке это
      // простыня на два экрана, а в четыре колонки они видны целиком
      (anom && anom.length ? '<div class="sec full">' +
        cap2('Аномальная мебель', anom.length + ' предметов') +
        '<div class="hint" style="margin:0 0 8px">Ставится в любое купленное жильё — ' +
        'привязки к конкретному дому в файлах игры нет.</div>' +
        '<div class="anoms">' + anom.map(anomCard).join('') + '</div></div>' : '') +
    '</div>' +
  '</details>';
}
// Карточка аномальной мебели. Все по одному правилу: ровная высота, текст
// сверху, кнопка раскрытия прижата к низу — иначе в ряду одни блоки в два
// раза выше других. Ступени прокачки раскрываются на всю ширину ряда и сами
// ложатся в колонки: их бывает десять, и лентой вниз они не помещаются.
function anomCard(x) {
  const pic = x.pic ? 'img/anom/' + esc(x.pic) : '';
  const head = '<div class="anom-h">' +
      (pic ? '<img src="' + pic + '" alt="" loading="lazy" ' +
        'data-nf="drop">' : '') +
      '<div><b>' + esc(x.ru) + '</b>' +
      (x.desc ? '<span>' + esc(x.desc) + '</span>' : '') + '</div>' +
    '</div>';
  if (!(x.lv && x.lv.length)) return '<div class="anom">' + head + '</div>';
  return '<details class="anom"><summary>' + head +
      '<em>' + x.lv.length + ' ' +
      plural(x.lv.length, 'ступень прокачки', 'ступени прокачки', 'ступеней прокачки') +
      '</em></summary>' +
    '<div class="anom-lv">' + x.lv.map((v, i) =>
      '<div class="anom-s"><u>' + (i + 1) + '</u><span>' + esc(v) + '</span></div>').join('') +
    '</div></details>';
}
function drawCity() {
  if (!CITY) {
    $('filters').innerHTML = '';
    $('body').innerHTML = '<div class="empty">Нет nte-city.json — прогони build-nte-db.ps1.</div>';
    foot('');
    return;
  }
  const q = state.q.trim().toLowerCase();
  const view = state.tview || 'cars';
  const head = vgroup('раздел', 'tview', [['cars', 'Транспорт'], ['flats', 'Недвижимость']]);

  if (view === 'flats') {
    const list = (CITY.flats || []).filter(f => !q ||
      ((f.ru || '') + ' ' + (f.addr || '') + ' ' + (f.type || '')).toLowerCase().indexOf(q) >= 0);
    $('filters').innerHTML = head + '<span class="fcnt">' + list.length + ' объектов</span>';
    bindViews();
    $('body').innerHTML = '<div class="list">' +
      list.map(f => flatCard(f, CITY.anom || [])).join('') + '</div>';
    const pack = {}; list.forEach(f => pack[f.id] = flatPics(f));
    bindGal(pack);
    foot('Недвижимость: цена, парковка и предел по мебели — из таблиц игры. ' +
         'Раскрой объект — увидишь фотографии комнат и аномальную мебель, ' +
         'ради которой жильё и покупают.');
    return;
  }
  let list = (CITY.cars || []).filter(c => !q ||
    ((c.ru || '') + ' ' + (c.en || '') + ' ' + (c.brand || '')).toLowerCase().indexOf(q) >= 0);
  const brands = [...new Set((CITY.cars || []).map(c => c.brand).filter(Boolean))].sort();
  if (state.rar && brands.indexOf(state.rar) >= 0) list = list.filter(c => c.brand === state.rar);
  $('filters').innerHTML = head + fgroup('марка', 'rar', brands, null, null) +
    '<span class="fcnt">' + list.length + ' из ' + (CITY.cars || []).length + '</span>';
  bindFilters(); bindViews();
  $('body').innerHTML = '<div class="list">' + list.map(carCard).join('') + '</div>';
  foot('Транспорт: цена из салона, тюнинг и раскраски — из таблиц игры. ' +
       'Раскрой машину — увидишь узлы: сколько вариантов, почём и что меняют.');
}

// ── карта города ───────────────────────────────────────────────────────────
// Точки и подложка — из файлов игры (build-nte-db.ps1), чужие карты не
// копируем. Плитки лежат сеткой n×n; всё рисуем в долях от размера карты,
// поэтому масштаб — это просто transform контейнера.
//
// Управление как у любой интерактивной карты: тянешь мышью, колесо приближает
// к курсору. Прокрутка страницы при этом не срабатывает — колесо над картой
// принадлежит карте.
const MAP_GRP = { tp: 'переходы', shop: 'магазины', locker: 'хранение', place: 'места' };
const MAP_COL = { tp: '#4ade80', shop: '#ffb800', locker: '#6fc0ff', place: '#b98bff' };
let mapView = { z: 1, x: 0, y: 0 };      // масштаб и сдвиг контейнера
function mapCal() {
  try { return Object.assign({ dx: 0, dy: 0, k: 1, lay: 3 },
    JSON.parse(localStorage.getItem('nte-map-cal')) || {}); }
  catch (e) { return { dx: 0, dy: 0, k: 1, lay: 3 }; }
}
function mapCalSave(v) {
  try { localStorage.setItem('nte-map-cal', JSON.stringify(v)); } catch (e) {}
}
function mapFound() {
  try { return JSON.parse(localStorage.getItem('nte-map-found')) || {}; }
  catch (e) { return {}; }
}
function mapFoundToggle(id) {
  const f = mapFound();
  if (f[id]) delete f[id]; else f[id] = 1;
  try { localStorage.setItem('nte-map-found', JSON.stringify(f)); } catch (e) {}
}
// Свои точки.
//
// Сундуков, ресурсов и точек кражи в игровых таблицах нет: они лежат внутри
// самих уровней, а не в справочниках. У чужих карт они есть потому, что их
// собирали руками игроки — по одной, месяцами. Скопировать чужую базу нельзя,
// а вот отмечать свои находки можно: Shift + клик по карте ставит точку с
// названием, она хранится в браузере и уезжает в облако вместе с отметками.
const MINE_KINDS = ['сундук', 'ресурс', 'точка кражи', 'предмет', 'задание', 'другое'];
function mapMine() {
  try { return JSON.parse(localStorage.getItem('nte-map-mine')) || []; }
  catch (e) { return []; }
}
function mapMineSave(v) {
  try { localStorage.setItem('nte-map-mine', JSON.stringify(v)); } catch (e) {}
}
// какие категории скрыты
function mapOff() {
  try { return JSON.parse(localStorage.getItem('nte-map-off')) || {}; }
  catch (e) { return {}; }
}
function mapOffSave(v) {
  try { localStorage.setItem('nte-map-off', JSON.stringify(v)); } catch (e) {}
}
// Привязка мира к картинке.
//
// Точную даёт манифест карты StarDB: они распаковали уровни и знают охват мира.
// Формула их же: fx = (x - minX) / edge, fy = (y - minY) / edge, причём ось Y
// НЕ переворачивается. Проверено наложением на подложку: так на дороги и
// кварталы садится 93 % наших точек, с переворотом — 61 %, а при прежнем
// способе (вписывание облака точек в квадрат) было 34 %.
//
// Если файла со StarDB нет, берём приблизительную привязку из сборки, а на
// совсем старом json — прежнее вписывание.
function mapBox(pts) {
  const s = SDB && SDB.box;
  if (s && s.edge) return { minX: +s.minX, minY: +s.minY, edge: +s.edge, flip: false };
  const b = CITY && CITY.map && CITY.map.box;
  if (b && b.side) {
    return { minX: (+b.cx || 0) - b.side / 2, minY: (+b.cy || 0) - b.side / 2,
             edge: +b.side, flip: true };
  }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = (x1 - x0) || 1, h = (y1 - y0) || 1;
  const pad = 0.12, side = Math.max(w, h) / (1 - 2 * pad);
  return { minX: (x0 + x1) / 2 - side / 2, minY: (y0 + y1) / 2 - side / 2,
           edge: side, flip: true };
}
// мировые координаты → доли картинки
function mapXY(p, box) {
  const fx = (p.x - box.minX) / box.edge;
  const fy = (p.y - box.minY) / box.edge;
  return [fx, box.flip ? 1 - fy : fy];
}
// Категория точки — это её название: «Аптека «Бамбук»», «Башня Вертхаймера».
// Группа (магазины/переходы) остаётся для цвета.
function mapCats(pts) {
  const by = {};
  pts.forEach(p => {
    const k = p.t || 'без названия';
    // Путь к значку нужен полный: у точек из таблиц игры картинки лежат в
    // img/mapicon, у точек StarDB — в подпапке sd. В списке категорий раньше
    // ко всем подставлялась первая папка, и половина значков была битой.
    if (!by[k]) by[k] = { name: k, g: p.g, n: 0,
      ic: p.ic ? (p.sd ? 'img/mapicon/sd/' : 'img/mapicon/') + p.ic : '' };
    by[k].n++;
  });
  return Object.values(by).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'));
}
// Уровень плиток. Раньше пороги были вбиты числами («до 1.8× — слой 6×6»),
// и они врали: порог подбирался под карту шириной в полэкрана, а на весь
// экран той же плитки уже не хватало — отсюда мыло. Теперь считаем честно.
//
// Плитки все 512×512, так что слой с сеткой n даёт полотно n×512 пикселей:
// 6×6 — 3072, 12×12 — 6144, 25×25 — 12800. Нужно столько пикселей, сколько
// занимает полотно на экране: сторона окна × зум × плотность экрана. Берём
// самый лёгкий слой, которому хватает разрешения. Плотность режем двойкой:
// на 4K-мониторе иначе сразу требуется слой, которого нет.
// Слой 1 — самый подробный, 51×51 плиток по 512. Держать 2601 файл на сайте
// накладно (одна выкладка — часы из-за ограничений GitHub), поэтому сборщик
// склеивает их по 3×3: получается 17×17 блоков по 1536, те же 26112 пикселей
// по стороне. Отсюда и разный размер плитки у слоёв.
const MAP_TILEPX = { 1: 1536 };
function mapTilePx(lay) { return MAP_TILEPX[lay] || 512; }
function mapTileSrc(lay, n, r, c) {
  if (lay === 1) {
    return 'img/map/z1/b_' + String(r).padStart(2, '0') + '_' +
           String(c).padStart(2, '0') + '.jpg';
  }
  return 'img/map/z' + lay + '/map_bigworld_1' +
         String(r * n + c + 1).padStart(4, '0') + '.png';
}
// Запас качества. Считать «пиксель исходника на пиксель экрана» мало: ровно
// на границе 1:1 браузер всё равно размазывает, потому что попадания пикселя
// в пиксель не бывает — карту двигают и масштабируют дробно. Полтора пикселя
// исходника на экранный дают уже честную резкость, а лишний вес не страшен:
// слои различаются вдвое, так что запас просто сдвигает переключение раньше.
const MAP_SHARP = 1.5;
// Потолок приближения. Раньше стоял 12 — под слой 25×25, дальше которого
// всё равно шло мыло. С подробным слоем (26112 пикселей по стороне) чётко
// остаётся примерно до шестнадцатикратного.
const MAP_ZMAX = 16;
// side — сторона полотна на экране, уже с учётом приближения.
function mapLayer(tiles, side) {
  const need = (side || 900) * Math.min(2, window.devicePixelRatio || 1) * MAP_SHARP;
  const lays = Object.keys(tiles).map(Number).sort((a, b) => b - a);  // 4, 3, 2, 1
  let lay = lays.length ? lays[0] : 4;
  for (const l of lays) {
    lay = l;
    if ((tiles[String(l)] || 6) * mapTilePx(l) >= need) break;
  }
  return lay;
}
// Приближение меняет РАЗМЕР полотна, а не его масштаб.
//
// Раньше было `transform: scale(zoom)`, и это оказалось причиной мыла, которое
// я ловил три захода. Слой с трансформацией браузер растеризует один раз, а
// потом растягивает готовую картинку силами видеокарты — как фотографию.
// Пока внутри лежали только плитки, Chrome успевал перерисовывать слой заново
// в новом масштабе; стоило добавить хоть одну метку с тенью, слой становился
// «сложным», перерисовка отключалась, и карта превращалась в растянутый
// скриншот. Отсюда и наблюдение: без меток чётко, с одной-единственной —
// мыло.
//
// Теперь полотну задаётся ширина и высота в пикселях (сторона × приближение),
// плитки внутри лежат в процентах и потому запрашиваются у браузера сразу в
// нужном размере — он рисует их честно, без растягивания. Трансформом остался
// только сдвиг: translate масштаб не меняет, растр не портит и по-прежнему
// считается видеокартой.
let mapRaf = 0;
function mapSide0() {
  const wrap = $('mapWrap');
  return wrap ? (wrap.clientHeight || 600) : 600;   // полотно квадратное, по высоте окна
}
function mapApply() {
  const el = $('mapIn');
  if (!el) return;
  const s = Math.round(mapSide0() * mapView.z);
  el.style.width = s + 'px';
  el.style.height = s + 'px';
  el.style.transform = 'translate(' + Math.round(mapView.x) + 'px,' +
                                      Math.round(mapView.y) + 'px)';
  mapDots();
  if (mapRaf) return;
  mapRaf = requestAnimationFrame(() => { mapRaf = 0; mapTilesSwap(); });
}
// Исходный вид: карта целиком, по центру окна. Полотно квадратное, а окно
// теперь шире — поэтому нулевой сдвиг уже не центр, его надо посчитать.
function mapHome() {
  const wrap = $('mapWrap');
  if (!wrap) { mapView = { z: 1, x: 0, y: 0 }; return; }
  mapView = { z: 1, x: Math.round((wrap.clientWidth - mapSide0()) / 2), y: 0 };
}
// Видимый кусок полотна в долях от его стороны, с запасом по краям: точка на
// границе не должна мигать при каждом дёрганье мыши. Сторона здесь уже с
// учётом приближения — полотно и правда такого размера.
function mapSeen(pad) {
  const wrap = $('mapWrap');
  if (!wrap) return null;
  const side = Math.max(1, mapSide0() * mapView.z);
  const p = pad == null ? 0.06 : pad;
  return {
    side: side,
    x0: -mapView.x / side - p,
    x1: (wrap.clientWidth - mapView.x) / side + p,
    y0: -mapView.y / side - p,
    y1: (wrap.clientHeight - mapView.y) / side + p
  };
}
// ── точки на холсте ────────────────────────────────────────────────────────
//
// Раньше каждая точка была отдельным узлом разметки. Пока их было четыреста,
// это работало; со StarDB стало три с половиной тысячи, и браузер начал
// захлёбываться: на каждое движение карты он пересчитывал положение, цвет,
// тень и картинку у всего списка. Никакой отсев невидимых не спасал — узлы
// всё равно оставались в документе.
//
// Теперь все точки рисуются на одном холсте, поверх подложки. Холст живёт в
// экранных координатах, а не внутри полотна: перерисовать пару сотен кружков
// дешевле, чем заставить браузер двигать тысячи элементов. Наведение и клики
// работают через поиск ближайшей точки по координатам курсора.
let mapPts = [];        // все показанные точки: доли, цвет, значок, подпись
let mapIcons = {};      // кэш картинок значков: адрес → Image
let mapHot = null;      // точка под курсором
let mapHotAll = [];     // и все её соседи, попавшие под тот же курсор
// Где сейчас курсор внутри карты. Нужно, чтобы нарисовать собственную метку:
// системный указатель на тёмной плотной карте теряется, и непонятно, на что
// целишься.
let mapCur = null;
let mapVis = [];        // попавшие в кадр: по ним ищем, что под курсором
let mapR = 10;          // радиус значка сейчас — зависит от приближения

// Значки подгружаем по мере надобности. Пока картинка не пришла — рисуем
// цветной кружок, когда пришла — холст перерисовывается сам.
// Значок сразу после загрузки уменьшается в копию 48×48 и дальше рисуется уже
// из неё. Двумя выигрышами. Первый — качество: исходники бывают и 411 пикселей,
// а браузер при рисовании ужимает их грубым фильтром в один проход, отчего на
// мелком значке оставалась каша. Здесь уменьшение идёт ступенями и с хорошим
// сглаживанием, один раз на значок. Второй — скорость: рисовать две тысячи
// картинок из маленькой копии заметно дешевле, чем из большой.
// Готовим лесенку копий: 64, 32 и 16 пикселей. Смысл в том, чтобы рисовать
// значок из копии, которая лишь немного крупнее нужного размера. Когда
// браузер ужимает картинку больше чем вдвое за один проход, он берёт грубый
// фильтр — именно от этого на значке оставалась каша, и никакое «high quality»
// не помогало. А уменьшение в полтора-два раза он делает честно.
//
// Исходники разные: у игровых значков 64 пикселя, у StarDB встречаются и 411.
// Крупные ужимаются половинками, шаг за шагом, один раз на значок.
const MAP_MIPS = [64, 32, 16];
function mapShrink(from, fw, fh, size) {
  const k = Math.min(size / fw, size / fh);   // у части значков картинка не квадратная
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const cx = cv.getContext('2d');
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(from, (size - fw * k) / 2, (size - fh * k) / 2, fw * k, fh * k);
  return cv;
}
function mapIcon(src) {
  if (!src) return null;
  let im = mapIcons[src];
  if (im === undefined) {
    im = new Image();
    im.onload = () => {
      try {
        let from = im, fw = im.naturalWidth || 64, fh = im.naturalHeight || 64;
        // крупный исходник ужимаем половинками, пока не станет вдвое больше
        // верхней ступени — дальше доводит mapShrink
        while (fw > MAP_MIPS[0] * 2) {
          const nw = Math.round(fw / 2), nh = Math.round(fh / 2);
          const c = document.createElement('canvas');
          c.width = nw; c.height = nh;
          const cx = c.getContext('2d');
          cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
          cx.drawImage(from, 0, 0, nw, nh);
          from = c; fw = nw; fh = nh;
        }
        // каждую следующую ступень строим из предыдущей — так резче
        const m0 = mapShrink(from, fw, fh, MAP_MIPS[0]);
        const m1 = mapShrink(m0, MAP_MIPS[0], MAP_MIPS[0], MAP_MIPS[1]);
        const m2 = mapShrink(m1, MAP_MIPS[1], MAP_MIPS[1], MAP_MIPS[2]);
        im.mips = [m0, m1, m2];
      } catch (e) { im.mips = null; }
      im.ok = 1;
      mapDotsSoon();
    };
    im.onerror = () => { im.ok = 0; };
    im.src = src;
    mapIcons[src] = im;
  }
  if (!im || !im.ok) return null;
  return im;
}
// Копия под нужный размер: самая мелкая из тех, что не меньше него.
function mapMip(im, need) {
  if (!im.mips) return im;
  for (let i = MAP_MIPS.length - 1; i >= 0; i--) {
    if (MAP_MIPS[i] >= need) return im.mips[i];
  }
  return im.mips[0];
}
let mapDotsRaf = 0;
function mapDotsSoon() {
  if (mapDotsRaf) return;
  mapDotsRaf = requestAnimationFrame(() => { mapDotsRaf = 0; mapDots(); });
}
function mapDots() {
  const cv = $('mapCv'), wrap = $('mapWrap');
  if (!cv || !wrap) return;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const side = mapSide0() * mapView.z;
  const ox = mapView.x, oy = mapView.y;
  // Сначала считаем, сколько точек попадёт в окно. Если их много, рисуем
  // упрощённо — без картинок и обводок: на отдалении значок всё равно меньше
  // собственной рамки, зато кадр остаётся быстрым.
  const vis = [];
  for (let i = 0; i < mapPts.length; i++) {
    const p = mapPts[i];
    const x = ox + p.fx * side, y = oy + p.fy * side;
    if (x < -24 || x > W + 24 || y < -24 || y > H + 24) continue;
    p.sx = x; p.sy = y;
    vis.push(p);
  }
  mapVis = vis;
  // Когда карта отдалена и точек в кадре под три тысячи, они всё равно
  // налезают друг на друга: рисуем их простыми квадратиками. В остальных
  // случаях — полноценный значок.
  const tiny = vis.length > 2400;
  // Размер значка растёт с приближением. На обзоре мелкий значок — это норма,
  // точек много и важно только где они лежат. А вот когда подошёл вплотную,
  // значок должен читаться: что именно там лежит, сундук или автомат.
  const zf = Math.max(0, Math.min(1, (mapView.z - 1.5) / 6.5));
  const R = Math.round(7 + 9 * zf);        // радиус подложки: 7 … 16
  const IC = Math.round(R * 1.75);         // сторона картинки: 12 … 28
  mapR = tiny ? 5 : R;                     // по нему ищем, что под курсором

  if (tiny) {
    for (let i = 0; i < vis.length; i++) {
      const p = vis[i];
      ctx.globalAlpha = p.on ? 0.32 : 1;
      ctx.fillStyle = p.on ? '#8a8a8a' : p.col;
      ctx.fillRect(p.sx - 2.5, p.sy - 2.5, 5, 5);
    }
    ctx.globalAlpha = 1;
    return mapDotsHot(ctx);
  }

  // Подложки и обводки собираем в общие контуры и заливаем разом: три тысячи
  // отдельных beginPath/fill стоят дорого, а цветов у точек десяток.
  const backs = new Path2D(), byCol = new Map(), fills = new Map();
  for (let i = 0; i < vis.length; i++) {
    const p = vis[i];
    const col = p.on ? '#8a8a8a' : p.col;
    const im = p.ic ? mapIcon(p.ic) : null;
    if (im) {
      backs.moveTo(p.sx + R, p.sy);
      backs.arc(p.sx, p.sy, R, 0, 6.2832);
      let path = byCol.get(col);
      if (!path) { path = new Path2D(); byCol.set(col, path); }
      path.moveTo(p.sx + R, p.sy);
      path.arc(p.sx, p.sy, R, 0, 6.2832);
    } else {
      let path = fills.get(col);
      if (!path) { path = new Path2D(); fills.set(col, path); }
      path.moveTo(p.sx + R - 1, p.sy);
      path.arc(p.sx, p.sy, R - 1, 0, 6.2832);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(8,10,14,.85)';
  ctx.fill(backs);
  ctx.lineWidth = 1.6;
  byCol.forEach((path, col) => { ctx.strokeStyle = col; ctx.stroke(path); });
  fills.forEach((path, col) => {
    ctx.fillStyle = col; ctx.fill(path);
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke(path);
  });

  // Сами картинки — из подготовленной копии подходящего размера (см. mapIcon).
  // Нужный размер один на весь кадр, поэтому ступень выбираем один раз.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const need = IC * dpr;
  for (let i = 0; i < vis.length; i++) {
    const p = vis[i];
    const im = p.ic ? mapIcon(p.ic) : null;
    if (!im) continue;
    ctx.globalAlpha = p.on ? 0.32 : 1;
    ctx.drawImage(mapMip(im, need), p.sx - IC / 2, p.sy - IC / 2, IC, IC);
  }
  // своя точка — звёздочка, чтобы не путать с игровыми значками
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1a0d14';
  ctx.font = 'bold ' + Math.round(R * 1.2) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < vis.length; i++) {
    if (vis[i].mine) ctx.fillText('✦', vis[i].sx, vis[i].sy + 0.5);
  }
  return mapDotsHot(ctx);
}
// Точка под курсором — поверх всех и с белым ободком.
// Своя метка курсора тут была и убрана. Замер показал, что она встаёт ровно
// под системным указателем — промах ноль пикселей, — но на экране с
// масштабированием Windows выглядит вторым курсором и только сбивает. Вместо
// неё сделано главное: широкий радиус попадания, чтобы наводиться было легко.
function mapDotsHot(ctx) {
  if (!mapHot || mapHot.sx == null) return;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.5;
  // соседей обводим тускло, ту, что первой в списке, — ярко
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  for (let i = 1; i < mapHotAll.length; i++) {
    const q = mapHotAll[i];
    if (q.sx == null) continue;
    ctx.beginPath(); ctx.arc(q.sx, q.sy, mapR + 3, 0, 6.2832); ctx.stroke();
  }
  ctx.strokeStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 4;
  ctx.beginPath(); ctx.arc(mapHot.sx, mapHot.sy, mapR + 4, 0, 6.2832); ctx.stroke();
  ctx.shadowBlur = 0;
}
// Наведение, отметки и свои точки. Узлов у точек больше нет, поэтому события
// висят на самом окне карты, а нужная точка ищется по координатам курсора.
function bindMapDots() {
  const wrap = $('mapWrap'), tip = $('mapTip');
  if (!wrap || !tip) return;
  let moved = 0;

  wrap.addEventListener('mousedown', () => { moved = 0; });
  wrap.addEventListener('mousemove', e => {
    moved++;
    const m0 = mapScale(wrap);
    mapCur = { x: (e.clientX - m0.r.left) / m0.kx - wrap.clientLeft,
               y: (e.clientY - m0.r.top) / m0.ky - wrap.clientTop };
    const all = mapHitAll(e.clientX, e.clientY);
    const p = all[0] || null;
    if (p !== mapHot) {
      mapHot = p;
      mapHotAll = all;
      wrap.style.cursor = p ? 'pointer' : '';
      mapDots();
    }
    if (p) {
      // Подсказку вешаем на саму точку, а не на курсор: так она не дрожит
      // вслед за мышью и всегда понятно, к какому значку относится.
      //
      // Значок в ней показывается крупно. На карте он физически маленький —
      // тридцать пикселей, и больше делать нельзя, точек тысячи и они
      // слипнутся. А разглядеть, что именно там лежит, всё равно надо: здесь
      // та же картинка идёт в полный рост.
      // если под курсором несколько точек — перечисляем их все
      const rest = mapHotAll.slice(1);
      tip.innerHTML = (p.ic ? '<img src="' + esc(p.ic) + '" alt="">' : '') +
        '<span>' + esc(p.t) +
        (rest.length ? '<i class="tip-more">и рядом: ' +
          rest.slice(0, 4).map(x => esc(x.t)).join(', ') +
          (rest.length > 4 ? ' и ещё ' + (rest.length - 4) : '') + '</i>' : '') +
        '</span>';
      tip.classList.add('on');
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = p.sx - w / 2;
      let y = p.sy - mapR - h - 8;
      if (y < 4) y = p.sy + mapR + 8;                       // у верхнего края — снизу
      x = Math.max(4, Math.min(x, wrap.clientWidth - w - 4));
      tip.style.left = Math.round(x) + 'px';
      tip.style.top = Math.round(y) + 'px';
    } else {
      tip.classList.remove('on');
    }
  });
  wrap.addEventListener('mouseleave', () => {
    tip.classList.remove('on');
    mapCur = null;
    mapHot = null; mapHotAll = [];
    mapDots();
  });

  wrap.addEventListener('click', e => {
    if (moved > 3) return;               // это было перетаскивание, а не клик
    const p = mapHit(e.clientX, e.clientY);
    // Shift + клик по пустому месту — поставить свою точку
    if (e.shiftKey && !p) {
      const side = mapSide0() * mapView.z;
      const m = mapScale(wrap);
      const fx = ((e.clientX - m.r.left) / m.kx - mapView.x) / side;
      const fy = ((e.clientY - m.r.top) / m.ky - mapView.y) / side;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
      const t = prompt('Что здесь? Например: «сундук у моста»');
      if (!t) return;
      const kind = (prompt('Тип: ' + MINE_KINDS.join(' / '), MINE_KINDS[0]) || 'другое').trim();
      const all = mapMine();
      all.push({ id: Date.now().toString(36), t: t.trim(), kind: kind, fx: fx, fy: fy });
      mapMineSave(all);
      draw();
      return;
    }
    if (!p) return;
    mapFoundToggle(p.id);
    p.on = !p.on;
    mapDots();
  });

  // свою точку убирает правая кнопка — чужие не трогаем
  wrap.addEventListener('contextmenu', e => {
    const p = mapHit(e.clientX, e.clientY);
    if (!p || !p.mine) return;
    e.preventDefault();
    mapMineSave(mapMine().filter(m => String(m.id) !== p.mine));
    draw();
  });
}
// Что под курсором. Ищем только среди попавших в кадр — их сотни, а не тысячи,
// и экранные координаты у них уже посчитаны отрисовкой.
// Что под курсором. Возвращаем не одну точку, а все, что попали под него.
//
// Так вышло не от хорошей жизни: в городе точки лежат кучами. Проверено
// замером — под курсором в радиусе трёх пикселей бывает по двенадцать штук.
// Какую из них ни выбери «главной», пользователь смотрит на другую и видит,
// что подсветилась не та. Поэтому показываем весь список: подсвечиваем все и
// перечисляем их в подсказке.
// Перевод координат мыши в координаты карты.
//
// Здесь была ошибка, из-за которой курсор «попадал не туда». Я вычитал из
// clientX левый край прямоугольника элемента — и это неверно, когда у
// страницы есть масштаб. getBoundingClientRect отдаёт размеры уже
// отмасштабированными, а clientX и внутренние размеры элемента — нет. На
// экране с масштабом сто процентов прямоугольник у нас 1531 пиксель шириной
// при внутренней ширине 1223: всё, что дальше от левого края, уезжало тем
// сильнее, чем правее. Отсюда и «работает только на 175 %» — там числа
// случайно сходились.
//
// Считаем поправку явно: во сколько раз нарисованное отличается от
// разметочного. Без масштаба это единица, и ничего не меняется.
function mapScale(el) {
  const r = el.getBoundingClientRect();
  const w = el.clientWidth || 1, h = el.clientHeight || 1;
  return { r: r, kx: (r.width / w) || 1, ky: (r.height / h) || 1 };
}
function mapHitAll(cx, cy) {
  const wrap = $('mapWrap');
  if (!wrap) return [];
  // clientLeft — это рамка окна карты. Холст лежит внутри неё, а прямоугольник
  // меряется снаружи; без поправки всё смещалось на пиксель.
  const m = mapScale(wrap), r = m.r;
  const x = (cx - r.left) / m.kx - wrap.clientLeft;
  const y = (cy - r.top) / m.ky - wrap.clientTop;
  // Радиус попадания заметно больше самой точки: на отдалении она рисуется
  // пятью пикселями, и попасть в неё мышью нереально. Четырнадцать пикселей —
  // это примерно палец на экране, целиться становится легко.
  const rad = Math.max(14, mapR + 3);
  const rr = rad * rad;
  const out = [];
  for (let i = mapVis.length - 1; i >= 0; i--) {
    const p = mapVis[i];
    const dx = p.sx - x, dy = p.sy - y;
    if (dx * dx + dy * dy <= rr) out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}
function mapHit(cx, cy) { return mapHitAll(cx, cy)[0] || null; }
// Подгонка привязки: доли пересчитываются из исходных (bx, by) и холст
// перерисовывается. Раньше для этого двигали каждый узел по отдельности.
function mapMarksMove(c) {
  for (let i = 0; i < mapPts.length; i++) {
    const p = mapPts[i];
    if (p.bx == null) continue;      // свои точки привязка не трогает
    p.fx = ((p.bx - 0.5) * c.k + 0.5) + c.dx / 100;
    p.fy = ((p.by - 0.5) * c.k + 0.5) + c.dy / 100;
  }
  mapDots();
}
// Подложка. Рисуем не всю сетку, а только плитки, попавшие в окно: на слое
// 25×25 это полтора-два десятка картинок вместо 625, и переключение уровня
// перестаёт быть заметным. Уже загруженные плитки не трогаем — иначе при
// каждом сдвиге карта моргала бы, пока браузер достаёт их из кэша.
//
// loading="lazy" тут не годится: слой лежит внутри transform:scale, и браузер
// считает его размеры не по-человечески — половина плиток просто не грузилась.
let mapTileEls = {};
function mapTilesSwap() {
  const host = $('mapTiles');
  const s = mapSeen(0.02);
  if (!host || !s) return;
  const tiles = (CITY && CITY.map && CITY.map.tiles) || {};
  const lay = mapLayer(tiles, s.side);
  const n = tiles[String(lay)] || 6;
  if (+host.dataset.lay !== lay) { host.innerHTML = ''; mapTileEls = {}; host.dataset.lay = lay; }

  const nfo = $('mapNfo');
  if (nfo) {
    nfo.textContent = ' · слой ' + (tiles[String(lay)] || 6) + '×' +
      (tiles[String(lay)] || 6) + ', ' + mapView.z.toFixed(1) + '×';
  }
  const c0 = Math.max(0, Math.floor(s.x0 * n)), c1 = Math.min(n - 1, Math.ceil(s.x1 * n));
  const r0 = Math.max(0, Math.floor(s.y0 * n)), r1 = Math.min(n - 1, Math.ceil(s.y1 * n));
  const st = 100 / n, keep = {};
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * n + c + 1, k = String(i);
      keep[k] = 1;
      if (mapTileEls[k]) continue;
      const im = document.createElement('img');
      im.src = mapTileSrc(lay, n, r, c);
      im.alt = ''; im.draggable = false;
      im.style.cssText = 'left:' + (c * st) + '%;top:' + (r * st) + '%;' +
                         'width:' + st + '%;height:' + st + '%';
      host.appendChild(im);
      mapTileEls[k] = im;
    }
  }
  // далёкие плитки выбрасываем, чтобы список не рос бесконечно при катании
  const ks = Object.keys(mapTileEls);
  if (ks.length > 90) {
    for (const k of ks) {
      if (keep[k]) continue;
      mapTileEls[k].remove();
      delete mapTileEls[k];
    }
  }
}
// Колонка «Что показывать». Категорий больше восьмидесяти, и одним столбцом
// это стена текста, в которой ничего не найти. Разложено по типам точек из
// самих данных: переходы, магазины, хранение, места. Каждый тип
// сворачивается, и у него своя кнопка «все / снять».
function mapSideHtml(cats, off, cal) {
  const groups = Object.keys(MAP_GRP).filter(g => cats.some(c => c.g === g))
    .concat([...new Set(cats.map(c => c.g))].filter(g => !MAP_GRP[g] && !/^sd:/.test(g)));
  // подкатегории со StarDB идут своим блоком, с пометкой источника
  const sdGroups = [...new Set(cats.map(c => c.g))].filter(g => /^sd:/.test(g));
  const sdName = g => {
    const id = g.slice(3);
    const c = ((SDB && SDB.cats) || []).filter(x => x.id === id)[0];
    return c ? c.ru : id;
  };
  const one = c =>
    '<label class="mcat' + (off[c.name] ? ' off' : '') + '" title="' + esc(c.name) + '">' +
      '<input type="checkbox" data-cat="' + esc(c.name) + '"' + (off[c.name] ? '' : ' checked') + '>' +
      (c.ic ? '<img src="' + esc(c.ic) + '" alt="" loading="lazy" ' +
              'data-nf="drop">'
            : '<i style="--c:' + (MAP_COL[c.g] || '#fff') + '"></i>') +
      '<span>' + esc(c.name) + '</span><em>' + c.n + '</em>' +
    '</label>';
  return '<div class="mapside-h"><b>Что показывать</b>' +
      '<span><button data-mall="1">все</button><button data-mall="0">снять</button></span>' +
    '</div>' +
    groups.map(g => {
      const own = cats.filter(c => c.g === g);
      if (!own.length) return '';
      const n = own.reduce((s, c) => s + c.n, 0);
      const hid = own.every(c => off[c.name]);
      return '<details class="mgrp"' + (hid ? '' : ' open') + '>' +
        '<summary><i style="--c:' + (MAP_COL[g] || '#fff') + '"></i>' +
          '<b>' + esc(MAP_GRP[g] || g) + '</b><em>' + n + '</em>' +
          '<button data-mgrp="' + esc(g) + '" data-on="' + (hid ? '1' : '0') + '">' +
            (hid ? 'все' : 'снять') + '</button>' +
        '</summary>' +
        '<div class="mapcats">' + own.map(one).join('') + '</div></details>';
    }).join('') +
    // точки со StarDB: сундуки, находки, враги — то, чего нет в таблицах игры
    (sdGroups.length
      ? '<div class="mapside-h" style="margin:10px 0 4px"><b>Со StarDB</b>' +
          '<span><a class="fb" href="https://nte.stardb.gg/map" target="_blank" ' +
          'rel="noopener" title="источник данных, с разрешения разработчика">источник ↗</a>' +
          '</span></div>' +
        sdGroups.map(g => {
          const own = cats.filter(c => c.g === g);
          const n = own.reduce((s, c) => s + c.n, 0);
          const hid = own.every(c => off[c.name]);
          return '<details class="mgrp"' + (hid ? '' : ' open') + '>' +
            '<summary><i style="--c:' + (SDB_COL[g.slice(3)] || '#fff') + '"></i>' +
              '<b>' + esc(sdName(g)) + '</b><em>' + n + '</em>' +
              '<button data-mgrp="' + esc(g) + '" data-on="' + (hid ? '1' : '0') + '">' +
                (hid ? 'все' : 'снять') + '</button>' +
            '</summary>' +
            '<div class="mapcats">' + own.map(one).join('') + '</div></details>';
        }).join('')
      : '') +
    // свои точки: то, чего нет ни в таблицах, ни у StarDB
    (() => {
      const mine = mapMine();
      const by = {};
      mine.forEach(m => by[m.kind] = (by[m.kind] || 0) + 1);
      const rows = Object.keys(by).sort();
      return '<details class="mgrp"' + (rows.length ? ' open' : '') + '>' +
        '<summary><i style="--c:#ff7ab6"></i><b>мои точки</b><em>' + mine.length + '</em></summary>' +
        '<div class="mapcats">' +
          (rows.length ? rows.map(k =>
            '<label class="mcat' + (off['мои: ' + k] ? ' off' : '') + '">' +
              '<input type="checkbox" data-cat="' + esc('мои: ' + k) + '"' +
                (off['мои: ' + k] ? '' : ' checked') + '>' +
              '<i style="--c:#ff7ab6"></i><span>' + esc(k) + '</span><em>' + by[k] + '</em>' +
            '</label>').join('')
          : '<div class="hint" style="margin:4px 0">Пока пусто. Сундуков и ресурсов в ' +
            'таблицах игры нет — их собирают руками. <b>Shift + клик</b> по карте ставит ' +
            'свою точку, правая кнопка по ней убирает.</div>') +
        '<div class="mapbar" style="margin-top:6px">' +
          '<button data-mineout title="сохранить свои точки файлом">выгрузить</button>' +
          '<button data-minein title="добавить точки из файла">загрузить</button>' +
        '</div>' +
        '</div></details>';
    })() +
    '<div class="mapbar">' +
      '<button data-mreset>сбросить отметки</button>' +
    '</div>' +
    '<details class="mfold" style="margin-top:9px"><summary><b>Подстройка привязки</b></summary>' +
      '<div class="mfold-in"><div class="mapbar" style="margin-top:8px">' +
        '<label>вбок<input type="number" step="0.5" value="' + cal.dx + '" data-cal="dx"></label>' +
        '<label>вверх<input type="number" step="0.5" value="' + cal.dy + '" data-cal="dy"></label>' +
        '<label>масштаб<input type="number" step="0.02" value="' + cal.k + '" data-cal="k"></label>' +
      '</div>' +
      '<div class="mapbar" style="margin-top:6px">' +
        '<button data-calreset>вернуть как в сборке</button></div>' +
      '<div class="hint">Быстрее всего — <b>зажать Alt и потянуть прямо по карте</b>: ' +
      'поедут только значки, карта останется на месте. <b>Alt + колесо</b> растягивает ' +
      'расстановку. Числа тут — то же самое, только вручную.<br><br>' +
      'В файлах игры привязки мировых координат к картинке нет вовсе — ни в таблицах ' +
      'точек, ни в настройках мини-карты. Поэтому подгонка руками, зато один раз: ' +
      'значения остаются в этом браузере.</div>' +
      '</div></details>';
}
// Точки со StarDB в нашем виде. Их подкатегории (сундуки, находки, враги)
// становятся группами наравне с нашими переходами и магазинами, только
// помечены как чужой источник — у них своя пометка в колонке и своя ссылка.
const SDB_COL = { wanderers_journal: '#f0a4ff', map_finds: '#ffd166',
                  weekly: '#7ee8b0', enemies: '#ff8f8f',
                  anomaly_zone: '#9db8ff', incomplete: '#9aa3b5' };
// Тысяча точек со StarDB приходит без своей картинки — в их данных поле
// значка просто пустое. На карте они превращались в безликие кружки, и
// половина карты выглядела «без иконок». Берём запасной значок по типу точки:
// самый частый среди тех точек этой же группы, у которых картинка есть.
let sdbFall = null;
function sdbFallback() {
  if (sdbFall) return sdbFall;
  const cnt = {};
  ((SDB && SDB.pts) || []).forEach(p => {
    if (!p.ic || !p.g) return;
    (cnt[p.g] || (cnt[p.g] = {}))[p.ic] = (cnt[p.g][p.ic] || 0) + 1;
  });
  sdbFall = {};
  Object.keys(cnt).forEach(g => {
    sdbFall[g] = Object.keys(cnt[g]).sort((a, b) => cnt[g][b] - cnt[g][a])[0];
  });
  return sdbFall;
}
function sdbPts() {
  if (!SDB || !(SDB.pts || []).length) return [];
  const fb = sdbFallback();
  return SDB.pts.map(p => ({
    id: 'sd-' + p.id, x: p.x, y: p.y, g: 'sd:' + p.g,
    t: p.t || p.en || 'точка', ru: p.en || '', ic: p.ic || fb[p.g] || '', sd: 1
  }));
}
function drawMap() {
  const M = (CITY && CITY.map) || null;
  if (!M || !(M.pts || []).length) {
    $('filters').innerHTML = '';
    $('body').innerHTML = '<div class="empty">Карта не собрана — прогони build-nte-db.ps1.</div>';
    foot('');
    return;
  }
  const cal = mapCal(), found = mapFound(), off = mapOff();
  const q = state.q.trim().toLowerCase();
  // точки из таблиц игры и точки со StarDB — в одном списке
  const all = M.pts.concat(sdbPts());
  const cats = mapCats(all);
  const shown = all.filter(p => !off[p.t || 'без названия'] &&
    (!q || ((p.t || '') + ' ' + (p.ru || '')).toLowerCase().indexOf(q) >= 0));
  const box = mapBox(all);

  $('filters').innerHTML = '';
  // Слой и кратность дописываются на лету: по ним сразу видно, чего не хватает,
  // если карта вдруг замылилась, — не нужно лезть в консоль.
  const cnt = '<div class="mapcnt">показано ' + shown.length + ' из ' + all.length +
    ' · отмечено ' + Object.keys(found).length + '<i id="mapNfo"></i></div>';

  // Точки — в массив, а не в разметку. Три с половиной тысячи отдельных узлов
  // браузер честно раскладывал, красил и перерисовывал при каждом движении
  // карты; на этом всё и вставало. Теперь они рисуются на одном холсте.
  mapPts = [];
  for (const p of shown) {
    const [fx0, fy0] = mapXY(p, box);
    const fx = ((fx0 - 0.5) * cal.k + 0.5) + cal.dx / 100;
    const fy = ((fy0 - 0.5) * cal.k + 0.5) + cal.dy / 100;
    // далеко за краем карты точку не держим, но ближний вылет оставляем: при
    // подгонке привязки её надо видеть, иначе тянешь пустоту
    if (fx < -0.6 || fx > 1.6 || fy < -0.6 || fy > 1.6) continue;
    mapPts.push({
      id: p.id, fx: fx, fy: fy, bx: fx0, by: fy0,
      col: p.sd ? (SDB_COL[String(p.g).slice(3)] || '#fff') : (MAP_COL[p.g] || '#fff'),
      ic: p.ic ? (p.sd ? 'img/mapicon/sd/' : 'img/mapicon/') + p.ic : '',
      t: (p.t || '') + (p.ru && p.ru !== p.t ? ' — ' + p.ru : ''),
      on: !!found[p.id]
    });
  }
  // свои точки поверх игровых: их доли уже в координатах картинки, привязка
  // к ним не применяется — их ставил человек по самой карте
  const mine = mapMine().filter(m => !off['мои: ' + m.kind] &&
    (!q || ((m.t || '') + ' ' + (m.kind || '')).toLowerCase().indexOf(q) >= 0));
  for (const m of mine) {
    mapPts.push({
      id: 'mine-' + m.id, mine: String(m.id), fx: m.fx, fy: m.fy,
      col: '#ff7ab6', ic: '',
      t: m.t + ' · ' + m.kind + ' · своя точка, ПКМ — убрать',
      on: !!found['mine-' + m.id]
    });
  }

  // подложку рисует mapTilesSwap: уровень зависит от текущего масштаба
  $('body').innerHTML =
    '<div class="maprow">' +
      '<aside class="mapside">' + mapSideHtml(cats, off, cal) + '</aside>' +
      '<div class="mapwrap" id="mapWrap"><div class="mapin" id="mapIn">' +
        '<div class="maptiles" id="mapTiles" data-lay="0"></div>' +
      '</div>' +
      '<canvas class="mapcv" id="mapCv"></canvas>' +
      '<div class="maptip" id="mapTip"></div>' +
      cnt +
      '<div class="mapzoom">' +
        '<button data-mz="+">+</button><button data-mz="-">−</button>' +
        '<button data-mz="0" title="вернуть как было">⟲</button>' +
        '<button data-mz="f" title="во весь экран (Esc — обратно)">⛶</button>' +
      '</div></div>' +
    '</div>';

  mapHome();
  mapApply();
  // Первую отрисовку делаем сразу, а не ждём кадра: requestAnimationFrame не
  // срабатывает, пока вкладка браузера в фоне, и подложка оставалась пустой
  // до первого движения мышью. Открыл карту в соседней вкладке — вернулся к
  // чёрному прямоугольнику.
  mapTilesSwap();
  mapDots();
  bindMapDrag();
  bindMapDots();
  // окно карты тянется по высоте экрана: при развороте браузера или входе в
  // полный экран квадрат надо заново поставить по центру
  if (!window.__mapResize) {
    window.__mapResize = 1;
    const again = () => { if (state.tab === 'map' && $('mapWrap')) { mapHome(); mapApply(); } };
    window.addEventListener('resize', again);
    document.addEventListener('fullscreenchange', again);
  }

  $('body').querySelectorAll('input[data-cat]').forEach(inp => inp.onchange = () => {
    const o = mapOff();
    if (inp.checked) delete o[inp.dataset.cat]; else o[inp.dataset.cat] = 1;
    mapOffSave(o); draw();
  });
  $('body').querySelectorAll('[data-mall]').forEach(b => b.onclick = () => {
    if (b.dataset.mall === '1') { mapOffSave({}); }
    else { const o = {}; cats.forEach(c => o[c.name] = 1); mapOffSave(o); }
    draw();
  });
  // «все / снять» внутри типа: клик по кнопке не должен ещё и сворачивать
  // сам блок, поэтому событие гасим
  $('body').querySelectorAll('[data-mgrp]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    const o = mapOff(), g = b.dataset.mgrp, on = b.dataset.on === '1';
    cats.filter(c => c.g === g).forEach(c => { if (on) delete o[c.name]; else o[c.name] = 1; });
    mapOffSave(o); draw();
  });
  $('body').querySelectorAll('input[data-cal]').forEach(inp => inp.onchange = () => {
    const c = mapCal(); c[inp.dataset.cal] = +inp.value || 0;
    if (inp.dataset.cal === 'k' && !c.k) c.k = 1;
    mapCalSave(c); draw();
  });
  // Выгрузка и загрузка своих точек файлом. Нужна, чтобы наполнять карту не в
  // одиночку: точки можно собрать на разных аккаунтах и свести вместе, а сама
  // выгрузка — обычный json, его же принимает загрузка. Совпадения по
  // координатам не дублируются.
  const mo = $('body').querySelector('[data-mineout]');
  if (mo) mo.onclick = () => {
    const blob = new Blob([JSON.stringify({ note: 'свои точки карты NTE', pts: mapMine() }, null, 1)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nte-мои-точки.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const mi = $('body').querySelector('[data-minein]');
  if (mi) mi.onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        let add = [];
        try {
          const j = JSON.parse(rd.result);
          add = Array.isArray(j) ? j : (j.pts || []);
        } catch (e) { alert('Файл не разобрался — это должен быть json со своими точками.'); return; }
        const all = mapMine();
        const seen = {};
        all.forEach(m => seen[m.fx.toFixed(4) + ':' + m.fy.toFixed(4)] = 1);
        let n = 0;
        add.forEach(m => {
          const fx = +m.fx, fy = +m.fy;
          if (!isFinite(fx) || !isFinite(fy) || fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
          const key = fx.toFixed(4) + ':' + fy.toFixed(4);
          if (seen[key]) return;
          seen[key] = 1; n++;
          all.push({ id: (Date.now() + n).toString(36), t: String(m.t || 'точка').slice(0, 80),
                     kind: String(m.kind || 'другое').slice(0, 30), fx: fx, fy: fy });
        });
        mapMineSave(all);
        alert('Добавлено точек: ' + n + (add.length - n ? ', пропущено повторов: ' + (add.length - n) : ''));
        draw();
      };
      rd.readAsText(f);
    };
    inp.click();
  };
  // сброс ручной подгонки: базовая привязка приезжает из сборки, и если
  // значки двигали раньше, поверх новой она будет мешать
  const cr = $('body').querySelector('[data-calreset]');
  if (cr) cr.onclick = () => {
    try { localStorage.removeItem('nte-map-cal'); } catch (e) {}
    mapView = { z: 1, x: 0, y: 0 };
    draw();
  };
  const rs = $('body').querySelector('[data-mreset]');
  if (rs) rs.onclick = () => {
    try { localStorage.removeItem('nte-map-found'); } catch (e) {}
    draw();
  };
  const sdN = sdbPts().length;
  foot('Из файлов игры — ' + M.pts.length + ' точек: переходы, магазины и службы. ' +
       (sdN ? 'Ещё ' + sdN + ' — сундуки, находки, еженедельные точки и противники — ' +
              'со StarDB (nte.stardb.gg), с разрешения разработчика; ' +
              'привязка карты тоже их. ' : '') +
       'Свои находки можно отмечать самому: Shift + клик. Тяни мышью, колесо приближает; ' +
       'Alt + перетаскивание двигает значки, если они не совпали с картой.');
}
// Перетаскивание и зум. Колесо над картой не должно прокручивать страницу,
// поэтому слушатель ставим неленивым (passive: false) и гасим событие.
function bindMapDrag() {
  const wrap = $('mapWrap');
  if (!wrap) return;
  let drag = null;
  // С зажатым Alt тянется не карта, а слой значков: так привязку подгоняешь
  // глазами за пару секунд вместо вбивания чисел в поля. Alt + колесо меняет
  // масштаб расстановки. Привязки мировых координат к картинке в файлах игры
  // нет вовсе, поэтому подгонка руками — единственный способ попасть точно.
  wrap.onmousedown = e => {
    if (e.button !== 0) return;
    if (e.altKey) {
      const c = mapCal();
      drag = { alt: 1, sx: e.clientX, sy: e.clientY, dx: c.dx, dy: c.dy,
               w: wrap.clientWidth };
      wrap.classList.add('grab');
      return;
    }
    drag = { sx: e.clientX, sy: e.clientY, x: mapView.x, y: mapView.y };
    wrap.classList.add('grab');
  };
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    if (drag.alt) {
      // пиксели в проценты от стороны полотна — а она равна стороне окна,
      // помноженной на приближение
      const k = 100 / (mapSide0() * mapView.z);
      const c = mapCal();
      c.dx = Math.round((drag.dx + (e.clientX - drag.sx) * k) * 100) / 100;
      c.dy = Math.round((drag.dy + (e.clientY - drag.sy) * k) * 100) / 100;
      mapCalSave(c);
      mapMarksMove(c);
      return;
    }
    mapView.x = drag.x + (e.clientX - drag.sx);
    mapView.y = drag.y + (e.clientY - drag.sy);
    mapApply();
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const wasAlt = drag.alt;
    drag = null;
    wrap.classList.remove('grab');
    if (wasAlt) draw();          // перерисовываем, чтобы обновились поля привязки
  });
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.altKey) {
      const c = mapCal();
      c.k = Math.round(Math.max(0.2, c.k * (e.deltaY < 0 ? 1.02 : 1 / 1.02)) * 1000) / 1000;
      mapCalSave(c);
      draw();
      return;
    }
    // точка под курсором должна остаться на месте — с той же поправкой на
    // масштаб страницы, иначе при зуме карта уползает в сторону
    const m = mapScale(wrap);
    const cx = (e.clientX - m.r.left) / m.kx, cy = (e.clientY - m.r.top) / m.ky;
    const k = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const z2 = Math.min(MAP_ZMAX, Math.max(1, mapView.z * k));
    const real = z2 / mapView.z;
    mapView.x = cx - (cx - mapView.x) * real;
    mapView.y = cy - (cy - mapView.y) * real;
    mapView.z = z2;
    mapApply();
  }, { passive: false });
  $('body').querySelectorAll('[data-mz]').forEach(b => b.onclick = () => {
    const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
    if (b.dataset.mz === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (wrap.requestFullscreen) wrap.requestFullscreen();
      return;
    }
    if (b.dataset.mz === '0') { mapHome(); mapApply(); return; }
    const k = b.dataset.mz === '+' ? 1.4 : 1 / 1.4;
    const z2 = Math.min(MAP_ZMAX, Math.max(1, mapView.z * k)), real = z2 / mapView.z;
    mapView.x = cx - (cx - mapView.x) * real;
    mapView.y = cy - (cy - mapView.y) * real;
    mapView.z = z2;
    mapApply();
  });
}

// ── коды активации ─────────────────────────────────────────────────────────
// Список лежит в nte-guide.json как запасной, а свежий приезжает от воркера:
// он раз в 12 часов сам ходит на страницу кодов. Если воркер молчит — просто
// показываем запасной и честно пишем дату.
const CODES_API = ['/api/nte/codes',
                   'https://api.alextask.ru/api/nte/codes',
                   'https://alextask.ru/api/nte/codes',
                   'https://alextask-push.12dogswog76.workers.dev/api/nte/codes']
  .filter((b, i) => i === 0 || b.indexOf('//' + location.host + '/') < 0);
let codesLive = null;

// Пометка приходит по-английски и коротким набором — переводим знакомые.
const CODE_NOTE = { 'Launch code':'код запуска', 'Stream code':'со стрима',
                    'VTuber code':'VTuber-акция', 'Anniversary code':'к годовщине',
                    'still works':'срок вышел, но код ещё работает' };
// Повод к коду с ntebuild приходит по-английски: «Zankou banner (Version 1.3)»,
// «Version 1.1 preview livestream». Переводим знакомые куски, остальное как есть.
function codeWhy(s) {
  return String(s || '')
    .replace(/\bpreview livestream\b/gi, 'стрим-превью')
    .replace(/\blivestream\b/gi, 'стрим')
    .replace(/\bbanner\b/gi, 'баннер')
    .replace(/\bVersion\b/gi, 'версия')
    .replace(/\blaunch\b/gi, 'запуск');
}
function codeNote(s) { return CODE_NOTE[s] || codeWhy(s); }
// Даты в кодах приходят в ISO, а на странице «18/May/2026» — трогаем только ISO.
function ruDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? m[3] + '.' + m[2] + '.' + m[1] : s;
}
// Какие коды уже введены — держим в браузере. У каждого свои: кто открыл сайт,
// тот и отмечает, чужие галочки не мешают.
function codesUsed() {
  try { return JSON.parse(localStorage.getItem('nte-codes-used')) || {}; }
  catch (e) { return {}; }
}
function codeToggle(code) {
  const u = codesUsed();
  if (u[code]) delete u[code]; else u[code] = Date.now();
  try { localStorage.setItem('nte-codes-used', JSON.stringify(u)); } catch (e) {}
  drawCodes();
}
function codeRedeemHint() {
  return 'Где вводить: в игре нажми <b>Esc</b> (на геймпаде — Start), открой телефон, ' +
         'значок с тремя нотами рядом с профилем, дальше кнопка <b>Redeem Code</b>.';
}
function drawCodes() {
  const fallback = GUIDE.codes || { list: [] };
  // Живой список главнее: в нём появляются новые коды и пропадают закрытые.
  // Но если воркер крутится старой версии и не отдал дату с пометкой — берём
  // их из своего файла, чтобы карточка не обеднела.
  const src = (codesLive && codesLive.list && codesLive.list.length)
    ? { updated: codesLive.updated || fallback.updated,
        list: codesLive.list.map(c => {
          const old = (fallback.list || []).filter(x => x.code === c.code)[0] || {};
          return { code: c.code, rew: c.rew || old.rew || '',
                   note: c.note || old.note || '', date: c.date || old.date || '',
                   until: c.until || old.until || '' };
        }) }
    : fallback;
  const q = state.q.trim().toLowerCase();
  const used = codesUsed();
  const list = (src.list || []).filter(c => !q ||
    (c.code + ' ' + (c.rew || '')).toLowerCase().indexOf(q) >= 0)
    // введённые уезжают вниз: сверху то, что ещё можно забрать
    .slice().sort((x, y) => (used[x.code] ? 1 : 0) - (used[y.code] ? 1 : 0));
  const left = list.filter(c => !used[c.code]).length;
  const when = src.updated || '';
  $('filters').innerHTML = '<div class="fgrp"><u>список</u>' +
    '<button class="fb" id="codesUpd" title="запросить у воркера свежий список, ' +
    'минуя его двенадцатичасовой кэш">обновить сейчас</button></div>' +
    '<span class="fcnt">не введено ' + left + ' из ' + list.length +
    (codesLive ? ' · обновлено с сервера' : '') + '</span>';
  $('body').innerHTML =
    '<div class="box">' + codeRedeemHint() +
      (when ? '<div class="hint">Список актуален на ' + esc(when) + '.</div>' : '') +
    '</div>' +
    (list.length
      ? '<div class="codes">' + list.map(c => {
          const rew = rewHtml(c.rew || '');
          const when2 = [c.date ? 'с ' + ruDate(c.date) : '',
                         c.until ? 'до ' + ruDate(c.until) : '',
                         c.note ? codeNote(c.note) : ''].filter(Boolean).join(' · ');
          return '<div class="code' + (used[c.code] ? ' done-c' : '') + '">' +
            '<div class="code-t">' +
              '<label class="ck" title="отметить, что уже ввёл">' +
                '<input type="checkbox" data-u="' + esc(c.code) + '"' +
                (used[c.code] ? ' checked' : '') + '><span></span></label>' +
              '<b>' + esc(c.code) + '</b>' +
              '<button data-c="' + esc(c.code) + '">копировать</button>' +
            '</div>' +
            (rew ? '<div class="code-r">' + rew + '</div>'
                 : '<div class="hint" style="margin:0">Состав награды не указан.</div>') +
            (when2 ? '<div class="code-d">' + esc(when2) + '</div>' : '') +
          '</div>';
        }).join('') + '</div>'
      : '<div class="empty">Кодов нет.</div>') +
    '<div class="hint">Коды не бессрочные: часть из них рано или поздно закроют. ' +
    'Если игра пишет, что код недействителен — значит, срок вышел.</div>';
  $('body').querySelectorAll('input[data-u]').forEach(x =>
    x.onchange = () => codeToggle(x.dataset.u));
  $('body').querySelectorAll('.code button').forEach(b => b.onclick = () => {
    const t = b.dataset.c;
    const done = () => { b.textContent = 'скопировано'; b.classList.add('done');
      setTimeout(() => { b.textContent = 'копировать'; b.classList.remove('done'); }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => {});
    else {
      const el = document.createElement('textarea');
      el.value = t; document.body.appendChild(el); el.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(el);
    }
  });
  // источник приходит вместе со списком: воркер сначала пробует ntebuild
  // (там состав награды расписан по предметам), при осечке — prydwen
  const from = (codesLive && codesLive.src || '').indexOf('ntebuild') >= 0
    ? 'ntebuild.com' : (codesLive ? 'prydwen.gg' : 'запасной список в файле');
  foot('Коды с ' + from + ', обновление тянет воркер alextask. ' +
       'Отметки «уже ввёл» хранятся в этом браузере.');
  if ($('codesUpd')) $('codesUpd').onclick = () => {
    $('codesUpd').textContent = 'обновляю…';
    refreshCodes(true).then(() => { if (state.tab === 'codes') drawCodes(); });
  };
  if (!codesLive) refreshCodes();
}
// Версия воркера — рядом с версией страницы: без неё непонятно, залит ли
// свежий воркер, и почему, например, не работает распознавание скриншотов.
async function workerVer() {
  for (const b of API_BASES) {
    try {
      const r = await fetch(b + '/api/zzz/ping', { cache: 'no-store' });
      const j = await r.json();
      if (j && j.v) {
        $('ver').textContent = APP_VER + ' · воркер ' + j.v;
        $('ver').title = 'версия страницы и версия Cloudflare Worker';
        return;
      }
    } catch (e) {}
  }
  $('ver').textContent = APP_VER + ' · воркер не отвечает';
}

// force — обойти кэш воркера. Он держит снимок двенадцать часов, и после
// смены источника список ещё полдня приезжает старый; кнопкой это лечится
// за секунду, а сама вкладка по-прежнему не дёргает чужие сайты лишний раз.
async function refreshCodes(force) {
  const one = u => fetch(u + (force ? '?fresh=1' : ''), { cache: 'no-store' })
    .then(r => r.json())
    .then(j => (j && j.list && j.list.length) ? j : Promise.reject(new Error('пусто')));
  try {
    codesLive = await Promise.any(CODES_API.map(one));
    if (state.tab === 'codes') drawCodes();
  } catch (e) { codesLive = null; }
}

// ── механики ───────────────────────────────────────────────────────────────
// Реакции циклов — из игры и с гайда prydwen. Русские имена ставлю только там,
// где они подтверждены локализацией игры (в статах есть «урон цветения»,
// «урон ожога», «урон новы»); у остальных оставляю оригинал, чтобы не выдумать
// перевода, которого в игре нет.
const CYCLES = [
  { els:['Cosmos','Lakshana'], en:'Remora', ru:'',
    t:'Цель на 5 с замедляется — и движение, и скорость атаки. Эффект слабеет со временем, ' +
      'а если вешать его подряд, длительность будет короче.' },
  { els:['Anima','Cosmos'], en:'Blossom', ru:'Цветение',
    t:'Рядом с целью вырастает бутон и раскрывается 5 пестиками. Пестики летят по целям ' +
      'в радиусе и взрываются каждые 2 с, урон по площади. Одновременно на поле до 3 бутонов.' },
  { els:['Anima','Incantation'], en:'Hexed', ru:'',
    t:'12 с цель получает добавочный удар в размере 20% от всего урона Анимы и Заклинания, ' +
      'который она за это время съела.' },
  { els:['Chaos','Psyche'], en:'Nova', ru:'Нова',
    t:'Метка на 5 с. Когда она гаснет, цель получает крупный ментальный урон.' },
  { els:['Chaos','Incantation'], en:'Scorch', ru:'Ожог',
    t:'Поджиг на 15 с: урон тикает всё это время.' },
  { els:['Lakshana','Psyche'], en:'Stain', ru:'',
    t:'12 с цель получает на 20% больше урона Психики и Лакшаны. Чистое усиление под ДД.' },
  { els:['Anima','Cosmos','Lakshana'], en:'Charge', ru:'',
    t:'Тройной. Пока Lebenblume бьёт по цели под Remora, активный эспер получает +10 энергии ульты. ' +
      'Ради этого и собирают «зарядные» команды: ульта откатывается заметно быстрее.' },
  { els:['Chaos','Incantation','Psyche'], en:'Discord', ru:'',
    t:'Тройной. Если на цели одновременно висят Nova и Scorch, у неё срезается часть шкалы разрушения.' }
];

// Механики — простыня на пять экранов, а нужен обычно один кусок. Разделы
// сворачиваются, и браузер помнит, какие ты держишь открытыми.
function mfoldOpen() {
  try { return JSON.parse(localStorage.getItem('nte-mech-open')) || {}; }
  catch (e) { return {}; }
}
function mfold(title, def, html) {
  const st = mfoldOpen();
  const on = st[title] == null ? def : !!st[title];
  return '<details class="mfold"' + (on ? ' open' : '') + ' data-m="' + esc(title) + '">' +
    '<summary><b>' + esc(title) + '</b></summary>' +
    '<div class="mfold-in">' + html + '</div></details>';
}
function drawMech() {
  $('filters').innerHTML = '';
  const cyc = CYCLES.map(c =>
    '<tr><td><div class="els">' + c.els.map(e =>
        '<img src="' + elIcon(e) + '" title="' + esc(EL_RU[e] || e) + '" alt="">').join('') +
      '</div></td>' +
    '<td><b>' + esc(c.en) + '</b>' + (c.ru ? '<br><span style="font-size:11px;color:var(--tx3)">' +
      esc(c.ru) + '</span>' : '') + '</td>' +
    '<td>' + esc(c.els.map(e => EL_RU[e] || e).join(' + ')) + '</td>' +
    '<td>' + esc(c.t) + '</td></tr>').join('');

  $('body').innerHTML = '<div class="doc">' +
    // Первый раздел открыт по умолчанию: иначе страница встречает голым
    // списком заголовков и непонятно, что внутри.
    mfold('Что такое цикл эспера', true,
    '<p>Цикл — это реакция стихий, ровно как в других играх, только запускается она ' +
    '<b>сменой персонажа</b>, а не самим ударом. Схема такая:</p>' +
    '<ul>' +
      '<li>Бьёшь врага — копится шкала цикла (быстрее всего от парирований и удачных уклонений).</li>' +
      '<li>Когда шкала полная, у тех, кем можно продолжить цикл, <b>подсвечивается портрет</b>.</li>' +
      '<li>Переключаешься на такого эспера — он входит через intro-удар, и вместе с ним ' +
      'срабатывает цикл.</li>' +
      '<li>Реакция получается только у <b>соседних стихий</b> на колесе. Переключился на того, ' +
      'с кем реакции нет — обычная смена, без intro и без цикла.</li>' +
    '</ul>' +
    '<div class="box"><b>Тройные циклы</b>' +
      'Сначала запускаешь двойной, потом переключаешься на третью стихию. В один заход ' +
      'тройной не собрать. Именно поэтому <b>Charge</b> и <b>Discord</b> требуют ' +
      'выстроенной ротации, а не просто трёх нужных эсперов в составе.</div>' +
    '<div class="box"><b>Что качать под цикл</b>' +
      'Урон цикла считается от <b>Интенсивности цикла</b> тех, кто в нём участвовал. ' +
      'Стоять на поле при этом должен не обязательно тот, у кого её больше — вклад ' +
      'засчитывается всем участникам. Поэтому Интенсивность цикла обычно набивают ' +
      'поддержке, а не главному ДД.</div>') +
    mfold('Реакции целиком', false,
    '<table class="tbl"><tr><th>стихии</th><th>реакция</th><th>пара</th><th>что делает</th></tr>' +
      cyc + '</table>' +
    '<p class="hint" style="margin-top:0">У каждого эспера есть ещё и личная реакция на ' +
    'конкретный цикл — она прописана в его пассивке. Смотри карточку эспера, блок с бонусами.</p>') +
    mfold('Разрушение', false,
    '<p>У врагов есть шкала <b>разрушения</b> (Break). Пока она цела, урон по врагу режется; ' +
    'как только выбил её в ноль — открывается окно, в котором и наносится основная часть урона. ' +
    'Всё эндгейм-время строится вокруг этого окна.</p>' +
    '<table class="tbl">' +
      '<tr><th>стат</th><th>по-английски</th><th>что делает</th></tr>' +
      '<tr><td><b>Интенсивность разрушения</b></td><td>Break Intensity</td>' +
        '<td>Усиливает урон, который ты наносишь по шкале разрушения. Чем выше — тем быстрее ' +
        'сбиваешь врага в брейк. Это <b>плоское</b> число, не проценты: картридж S даёт до 180, ' +
        'сабстат — 60.</td></tr>' +
      '<tr><td><b>Пробой стойкости</b></td><td>Tenacity Break</td>' +
        '<td>Сколько стойкости снимает конкретный удар. У разных навыков разное значение.</td></tr>' +
      '<tr><td><b>Стойкость</b></td><td>Tenacity</td>' +
        '<td>Сопротивление врага сбиванию. Высокая стойкость — дольше выбивать брейк.</td></tr>' +
      '<tr><td><b>Интенсивность цикла</b></td><td>Cycle Intensity</td>' +
        '<td>Множитель урона циклов. Тоже плоское число: картридж S до 180, сабстат 60.</td></tr>' +
    '</table>' +
    '<div class="box"><b>Кому что нужно</b>' +
      'Break-составы (Zankou, Daffodil) качают Интенсивность разрушения — им важно сбить ' +
      'врага быстрее и чаще. Составы вокруг реакций качают Интенсивность цикла ' +
      'поддержке. Чистому ДД обычно не нужно ни то, ни другое — ему в приоритете крит ' +
      'и проценты урона.</div>') +
    mfold('Модули и картриджи', false,
    '<table class="tbl">' +
      '<tr><th></th><th>Картридж</th><th>Модуль</th></tr>' +
      '<tr><td>главных статов</td><td>1, выпадает случайно</td>' +
        '<td>2, всегда одни и те же: плоская атака и плоское HP</td></tr>' +
      '<tr><td>дополнительных</td><td colspan="2">по 4 у обоих, видны сразу, значения не растут</td></tr>' +
      '<tr><td>прокачка</td><td colspan="2">до +20, каждые 5 уровней включается один ' +
        'из дополнительных статов (+5, +10, +15, +20). Уровень поднимает <b>только главный</b> стат</td></tr>' +
      '<tr><td>редкость</td><td colspan="2">B (синий), A (розовый), S (оранжевый) — выше редкость, ' +
        'выше и главный, и дополнительные</td></tr>' +
      '<tr><td>разброс значений</td><td>выше, чем у модулей</td>' +
        '<td>ниже; зато у модулей есть <b>тип</b> II / III / IV — чем больше частей, ' +
        'тем крупнее статы</td></tr>' +
    '</table>' +
    '<p>Тип модуля — это сколько клеток он занимает на сетке Console, форма — как эти клетки ' +
    'расставлены. Многие эсперы дают бонус за <b>количество модулей своего типа</b> ' +
    '(«+16% крит. урона за каждый модуль типа III»), поэтому набор типов важнее формы. ' +
    'Что во что влезает — смотри во вкладке Console.</p>') +
    mfold('Бой, коротко', false,
    '<ul>' +
      '<li><b>Парирование важнее уклонения.</b> Атаки с красным кольцом лучше парировать: ' +
      'это и окно на ответку, и быстрый набор шкалы цикла.</li>' +
      '<li><b>Критическое уклонение</b> открывает усиленные удары — у многих эсперов ' +
      'на нём завязана часть кита.</li>' +
      '<li><b>Не мешай стихии в кучу.</b> Анима реагирует только с Заклинанием и Космосом. ' +
      'Пока собираешь одну реакцию, предыдущая успевает свалиться, и в итоге не работает ' +
      'ни одна. Состав собирается вокруг одной-двух реакций, а не «побольше разных».</li>' +
    '</ul>') +
    // Раздел появился из вопроса «что такое ментальная картина»: в игре есть
    // «Ментальная карта», и найти её в интерфейсе непросто — это одно из
    // шести испытаний внутри «Кроличьей норы», а не отдельная система.
    mfold('Подземелья и «Ментальная карта»', false,
    '<p>Подземелья в NTE называются <b>клонами</b> и делятся по тому, что с них падает. ' +
    'Из таблицы <code>DT_CloneOverviewRow</code>:</p>' +
    '<table class="tbl"><thead><tr><th>Режим</th><th>Что даёт</th></tr></thead><tbody>' +
      '<tr><td>EXP &amp; Beetle Coins</td><td>опыт эсперов и монеты</td></tr>' +
      '<tr><td>Ability Upgrade</td><td>материалы на способности</td></tr>' +
      '<tr><td>Arc Ascension</td><td>материалы на прорывы оружия</td></tr>' +
      '<tr><td>Console</td><td>картриджи и модули на сетку</td></tr>' +
      '<tr><td>Anomaly Pilgrimage</td><td>еженедельные боссы, высшие материалы</td></tr>' +
      '<tr><td>Beyond the Rails</td><td>материалы на пробуждение эсперов</td></tr>' +
      '<tr><td>Anomaly Hunt</td><td>мировые боссы</td></tr>' +
    '</tbody></table>' +
    '<div class="box" style="margin-top:10px"><b>«Кроличья нора»</b>' +
    '<div class="hint" style="margin:6px 0 0">Подземелье на снаряжение из DLC. Внутри ' +
    'шесть испытаний, у каждого шесть уровней сложности и свой именной сундук в награду:</div>' +
    '<ol style="margin:8px 0 0;padding-left:20px;color:var(--tx2);font-size:12px;line-height:1.7">' +
      '<li>Фокусы с часами <i style="color:var(--tx3)">— Clock Tricks</i></li>' +
      '<li>Галерея скульптур <i style="color:var(--tx3)">— Sculpture Gallery</i></li>' +
      '<li>Ткацкий станок широты <i style="color:var(--tx3)">— Latitude Loom</i></li>' +
      '<li>Защита редиса <i style="color:var(--tx3)">— Defend the Radish</i></li>' +
      '<li><b style="color:var(--gold)">Ментальная карта</b> ' +
        '<i style="color:var(--tx3)">— Mental Map</i></li>' +
      '<li>Ночь на рельсах <i style="color:var(--tx3)">— Night of the Rails</i></li>' +
    '</ol>' +
    '<div class="hint" style="margin:8px 0 0">Про «Ментальную карту» в игре сказано так: ' +
    '«Пиксели загораются по очереди. На краю реальности проступает силуэт кролика…». ' +
    'Сундук с неё называется «Сундук «Ментальная карта» (сложность 1–6)» — по нему её ' +
    'проще всего опознать в инвентаре.</div></div>') +
  '</div>';
  $('body').querySelectorAll('.mfold').forEach(d => d.ontoggle = () => {
    const st = mfoldOpen(); st[d.dataset.m] = d.open;
    try { localStorage.setItem('nte-mech-open', JSON.stringify(st)); } catch (e) {}
  });
  foot('Механики — из игры и гайдов prydwen, значения статов из таблиц модулей.');
}

// ── калькулятор отдачи статов ──────────────────────────────────────────────
// Смысл: у любого стата отдача падает по мере роста — 10-й процент крит-шанса
// стоит дороже первого. Считаем не «сколько стата», а сколько урона добавит
// ОДИН реальный сабстат S-редкости. Как только один стат начинает давать
// меньше другого — качать его дальше невыгодно.
//
// Урон = ATK × (1 + CR×CD) × (1 + сумма процентов урона).
// Прирост от добавки Δ считается как производная этого произведения:
//   ATK%  → Δ × базовая_атака / итоговая_атака
//   CR    → Δ × CD / (1 + CR×CD)
//   CD    → Δ × CR / (1 + CR×CD)
//   DMG%  → Δ / (1 + сумма процентов)
// Отсюда и «каппа»: крит-шанс и крит-урон уравниваются, когда CD = 2×CR,
// потому что сабстат даёт 10% шанса против 20% урона. Дальше выгоднее второе.
const SUB_S = { cr:10, cd:20, atkp:12.5, dmg:10, atk:80 };   // сабстат S-картриджа
const calc = { atk:2000, base:1000, cr:65, cd:160, dmg:80 };

function calcRows() {
  const cr = Math.min(100, Math.max(0, calc.cr)) / 100;
  const cd = Math.max(0, calc.cd) / 100;
  const dmg = Math.max(0, calc.dmg) / 100;
  const atk = Math.max(1, calc.atk), base = Math.max(1, calc.base);
  const critM = 1 + cr * cd;
  const room = Math.max(0, 1 - cr);                       // сколько крит-шанса ещё влезет
  const rows = [
    { k:'cr',   n:'Шанс крита',  add:'+' + SUB_S.cr + '%',
      g: Math.min(SUB_S.cr / 100, room) * cd / critM },
    { k:'cd',   n:'Крит. урон',  add:'+' + SUB_S.cd + '%',
      g: (SUB_S.cd / 100) * cr / critM },
    { k:'atkp', n:'Атака %',     add:'+' + SUB_S.atkp + '%',
      g: (SUB_S.atkp / 100) * base / atk },
    { k:'dmg',  n:'Урон %',      add:'+' + SUB_S.dmg + '%',
      g: (SUB_S.dmg / 100) / (1 + dmg) },
    { k:'atk',  n:'Атака плоская', add:'+' + SUB_S.atk,
      g: SUB_S.atk / atk }
  ];
  return rows.sort((a, b) => b.g - a.g);
}
function calcVerdict() {
  const cr = calc.cr, cd = calc.cd;
  const want = Math.round(cr * 2);                        // равновесие: CD = 2 × CR
  if (cr >= 99) return 'Крит-шанс упёрся в потолок — <b>дальше только крит. урон</b>. ' +
    'Всё, что сверх 100%, пропадает впустую; если часть шанса даёт бафф от команды или сет, ' +
    'своих статов держи ровно столько, чтобы с баффом выходило 100.';
  if (cd < want - 12) return 'Крит. урон отстаёт: при шансе ' + cr + '% равновесие примерно на ' +
    '<b>' + want + '% крит. урона</b>. Сейчас ' + cd + '% — <b>качай крит. урон</b>.';
  if (cd > want + 40) return 'Крит. урон убежал вперёд: при ' + cd + '% крит. урона выгоднее ' +
    'добирать <b>шанс крита</b> — равновесие для него около <b>' + Math.round(cd / 2) + '%</b>.';
  return 'Крит сбалансирован: <b>' + cr + '% / ' + cd + '%</b> близко к правилу ' +
    '<b>крит. урон = 2 × шанс крита</b>. Дальше смотри на таблицу ниже — там видно, ' +
    'какой стат сейчас даёт больше.';
}
// Считаем для конкретного эспера: поля сразу заполняются его целями из гайда,
// а вопрос «что качать дальше» имеет смысл только применительно к нему.
// Считаем для конкретного эспера. Числа берём из того, что вписано во вкладке
// «Сейчас»; если там пусто — из целей гайда, и об этом честно пишем.
function calcFill(slug) {
  const my = myStats(slug);
  const G = ((GUIDE.agents || {})[slug] || {}).goals || {};
  const pick = (k, g) => (my[k] != null ? my[k] : (G[g] ? G[g][0] : null));
  calc.atk = pick('atk', 'atk') || 2000;
  calc.cr  = pick('cr', 'cr')   || 50;
  calc.cd  = pick('cd', 'cd')   || 100;
  const dmg = my.dmg != null ? my.dmg : ((G.dmg ? G.dmg[0] : 0) + (G.elem ? G.elem[0] : 0));
  calc.dmg = dmg || 0;
  // Базовая атака — та, от которой считаются проценты: сам эспер плюс оружие,
  // без плоской прибавки с модулей. В игре её отдельно не показывают, поэтому
  // берём половину итоговой: у собранного персонажа это близко к правде и
  // спрашивать лишнее число не приходится.
  calc.base = Math.max(500, Math.round(calc.atk * 0.5));
  calc.fromMe = my.atk != null || my.cr != null || my.cd != null;
}
function calcTable() {
  const rows = calcRows(), top = rows[0].g;
  return '<tr><th>стат</th><th>один сабстат S</th><th>даст урона</th><th>отдача</th></tr>' +
    rows.map((r, i) =>
      '<tr' + (i === 0 ? ' class="top"' : '') + '><td><b>' + esc(r.n) + '</b></td><td>' +
      esc(r.add) + '</td><td class="num">+' + (r.g * 100).toFixed(2) + '%</td>' +
      '<td><div class="bar"><i style="width:' + Math.max(2, Math.round(r.g / (top || 1) * 100)) +
      '%"></i></div></td></tr>').join('');
}
function calcHtml() {
  const F = ['atk','cr','cd','dmg'];
  const LBL = { atk:'Атака', cr:'Шанс крита, %', cd:'Крит. урон, %',
                dmg:'Сумма процентов урона, %' };
  return '<div class="hint" style="margin:0 0 8px">' +
      (calc.fromMe ? 'Числа взяты из твоих характеристик выше.'
                   : 'Числа взяты из целей гайда — впиши свои выше, и расчёт пойдёт по ним.') +
    '</div>' +
    '<div class="inp">' + F.map(k =>
      '<div><label>' + esc(LBL[k]) + '</label>' +
      '<input type="number" step="any" data-k="' + k + '" value="' + calc[k] + '"></div>').join('') +
    '</div>' +
    '<div class="verdict">' + calcVerdict() + '</div>' +
    '<table class="tbl">' + calcTable() + '</table>' +
    '<div class="hint">Показано, сколько процентов урона добавит <b>один</b> дополнительный ' +
    'стат S-картриджа. Верхняя строка — то, что выгоднее всего добирать сейчас. ' +
    'Правило: <b>крит. урон = 2 × шанс крита</b> (сабстат даёт 10% шанса или 20% урона), ' +
    'шанс крита выше 100% пропадает, а проценты урона складываются в один множитель — ' +
    'чем их больше, тем дешевле стоит следующий.</div>';
}
function bindCalc() {
  const box = $('calcBox');
  if (!box) return;
  box.querySelectorAll('input[data-k]').forEach(inp => inp.oninput = () => {
    const v = parseFloat(inp.value);
    calc[inp.dataset.k] = isFinite(v) ? v : 0;
    // обновляем только выводы, чтобы не терять фокус в поле
    const vd = box.querySelector('.verdict'), tbl = box.querySelector('.tbl');
    if (vd) vd.innerHTML = calcVerdict();
    if (tbl) tbl.innerHTML = calcTable();
  });
}

// ── что даст замена ────────────────────────────────────────────────────────
// Вопрос, который встаёт каждый раз, когда с подземелья падает картридж:
// ставить или оставить старый. На глаз не решается — крит-урон и атака
// складываются по-разному, и «+20% крит. урона» у одного эспера сильнее
// «+12,5% атаки», а у другого слабее.
//
// Считаем по той же модели, что и калькулятор отдачи выше:
//     урон = ATK × (1 + CR×CD) × (1 + сумма процентов урона)
// Берём твои числа как «сейчас», прикладываем прибавку — и смотрим отношение.
// Это прикидка по множителям, а не точный урон: коэффициенты умений, реакции
// стихий и защита цели сюда не входят. Зато для выбора «этот или тот» их и не
// нужно — они одинаково умножают оба варианта и в отношении сокращаются.
function dmgOf(s) {
  const cr = Math.min(100, Math.max(0, +s.cr || 0)) / 100;
  const cd = Math.max(0, +s.cd || 0) / 100;
  const dm = Math.max(0, +s.dmg || 0) / 100;
  return Math.max(1, +s.atk || 1) * (1 + cr * cd) * (1 + dm);
}
// Готовые прибавки: строки главного стата и наборы сабстатов S-картриджа.
// Числа те же, что в SUB_S, — один источник на оба калькулятора.
const SWAP_PRESETS = [
  { n: 'крит. шанс +' + SUB_S.cr + '%',  d: { cr: SUB_S.cr } },
  { n: 'крит. урон +' + SUB_S.cd + '%',  d: { cd: SUB_S.cd } },
  { n: 'атака +' + SUB_S.atkp + '%',     d: { atkp: SUB_S.atkp } },
  { n: 'урон стихии +' + SUB_S.dmg + '%',d: { dmg: SUB_S.dmg } },
  { n: 'атака +' + SUB_S.atk,            d: { atk: SUB_S.atk } }
];
const swap = { atk: 0, cr: 0, cd: 0, dmg: 0, atkp: 0 };
function swapNow(slug) {
  const my = myStats(slug);
  const G = ((GUIDE.agents || {})[slug] || {}).goals || {};
  const v = (k, g) => (my[k] != null ? my[k] : (G[g] ? G[g][0] : 0));
  return { atk: v('atk', 'atk') || 2000, cr: v('cr', 'cr') || 50,
           cd: v('cd', 'cd') || 100,
           dmg: (my.dmg != null ? my.dmg : ((G.elem ? G.elem[0] : 0) + (G.dmg ? G.dmg[0] : 0))) || 0,
           mine: my.atk != null || my.cr != null || my.cd != null };
}
// Проценты атаки считаем от базовой — от неё же их считает игра. Базовую
// берём как половину итоговой: у собранного эспера это близко к правде, а
// спрашивать лишнее число ради прикидки незачем.
function swapAfter(now) {
  const base = Math.max(500, Math.round(now.atk * 0.5));
  return { atk: now.atk + (+swap.atk || 0) + base * (+swap.atkp || 0) / 100,
           cr:  now.cr + (+swap.cr || 0),
           cd:  now.cd + (+swap.cd || 0),
           dmg: now.dmg + (+swap.dmg || 0) };
}
function swapHtml(slug) {
  const now = swapNow(slug), after = swapAfter(now);
  const было = dmgOf(now), стало = dmgOf(after);
  const рост = (стало / было - 1) * 100;
  const поле = (k, n, шаг) => '<div><label>' + esc(n) + '</label>' +
    '<input type="number" step="' + шаг + '" data-sw="' + k + '" value="' + swap[k] + '"></div>';
  const потолок = now.cr + (+swap.cr || 0) > 100
    ? '<div class="hint" style="color:#fbbf24;margin-top:6px">Крит-шанс перевалил за 100% — ' +
      'лишнее в расчёт не идёт и в игре пропадает.</div>' : '';
  return '<div class="hint" style="margin:0 0 8px">' +
      (now.mine ? 'Сейчас: атака ' + Math.round(now.atk) + ', крит ' + now.cr + '% / ' + now.cd +
                  '%, урон +' + Math.round(now.dmg) + '%.'
                : 'Своих чисел нет — считаю от целей гайда. Вставь скрин выше, и пойдёт по твоим.') +
    '</div>' +
    '<div class="mapbar">' + SWAP_PRESETS.map((p, i) =>
      '<button class="fb" data-swp="' + i + '">+ ' + esc(p.n) + '</button>').join('') +
      '<button class="fb" data-swclr>сбросить</button>' +
    '</div>' +
    '<div class="inp" style="margin-top:9px">' +
      поле('atk', 'атака, плоская', '1') + поле('atkp', 'атака, %', '0.1') +
      поле('cr', 'шанс крита, %', '0.1') + поле('cd', 'крит. урон, %', '0.1') +
      поле('dmg', 'урон стихии, %', '0.1') +
    '</div>' +
    '<div class="verdict" id="swVerdict">' + swapVerdict(рост, now, after) + '</div>' + потолок +
    '<div class="hint">Прикидка по множителям: атака × крит × проценты урона. ' +
    'Коэффициенты умений и защита цели одинаково умножают оба варианта, поэтому ' +
    'на сравнение не влияют. Минус ставь со знаком «−», если старый картридж ' +
    'что-то отдаёт: тогда увидишь итог замены целиком.</div>';
}
function swapVerdict(рост, now, after) {
  if (!рост) return 'Ничего не добавлено — выбери прибавку кнопкой или впиши числа.';
  const знак = рост > 0 ? '+' : '';
  return 'Урон <b>' + знак + рост.toFixed(1) + '%</b> · атака ' + Math.round(now.atk) +
    ' → <b>' + Math.round(after.atk) + '</b> · крит ' + now.cr + '/' + now.cd +
    ' → <b>' + Math.round(after.cr * 10) / 10 + '/' + Math.round(after.cd * 10) / 10 + '</b>';
}
function bindSwap(slug) {
  const box = $('swapBox');
  if (!box) return;
  const пере = () => { box.innerHTML = swapHtml(slug); bindSwap(slug); };
  box.querySelectorAll('[data-swp]').forEach(b => b.onclick = () => {
    const d = SWAP_PRESETS[+b.dataset.swp].d;
    Object.keys(d).forEach(k => { swap[k] = Math.round((swap[k] + d[k]) * 10) / 10; });
    пере();
  });
  const clr = box.querySelector('[data-swclr]');
  if (clr) clr.onclick = () => { Object.keys(swap).forEach(k => { swap[k] = 0; }); пере(); };
  box.querySelectorAll('input[data-sw]').forEach(inp => inp.oninput = () => {
    const v = parseFloat(inp.value);
    swap[inp.dataset.sw] = isFinite(v) ? v : 0;
    // перерисовываем только вывод — иначе поле теряет фокус на каждой цифре
    const now = swapNow(slug), after = swapAfter(now);
    const el = box.querySelector('#swVerdict');
    if (el) el.innerHTML = swapVerdict((dmgOf(after) / dmgOf(now) - 1) * 100, now, after);
  });
}

// ── карточка эспера ────────────────────────────────────────────────────────
function prioHtml(s) {
  if (!s) return '';
  return esc(prioRu(s)).replace(/(&gt;&gt;|&gt;|=)/g, '<span class="gt">$1</span>');
}
// Значки характеристик — родные игровые, из UI_Icon/Attribute. Качает их
// build-nte-db.ps1; пока картинок нет, подписи просто остаются без значка.
const STAT_ICON = {
  hp:   'icon_attri_shengming.png',
  atk:  'icon_attri_gongji.png',
  def:  'icon_attri_fangyu.png',
  cr:   'icon_attri_baoji.png',
  cd:   'icon_attri_baojishanghai.png',
  brk:  'Icon_TenacityDestroyEfficiency.png',
  cyc:  'Icon_attri_count_up.png',
  dmg:  'Icon_DamageUp_white.png',
  elem: 'Icon_DamageUp_yellow.png',
  heal: 'Icon_HealUp.png',
  er:   'Icon_CostGainEfficiency.png'
};
function statIco(k) {
  const f = STAT_ICON[k];
  return f ? '<img class="sti" src="img/stat/' + esc(f) + '" alt="" loading="lazy">' : '';
}
function goalsHtml(g, a) {
  const G = g.goals || {}, N = g.goalNotes || {};
  const keys = Object.keys(G);
  if (!keys.length) return '';
  return '<div class="goals">' + keys.map(k => {
    const lo = G[k][0], hi = G[k][1];
    const val = (lo === hi ? lo : lo + ' – ' + hi) + (STAT_PCT[k] ? '%' : '');
    const note = tr(N[k] || '');
    return '<div class="goal' + (note ? ' note' : '') + '"' +
      (note ? ' title="' + esc(note) + '"' : '') + '>' + statIco(k) +
      '<span>' + esc(statName(k, a)) + (note ? ' <u>?</u>' : '') + '</span>' +
      '<b>' + esc(val) + '</b></div>';
  }).join('') + '</div>';
}
// Что показать, если вещь раскрыть. У оружия — описание, атака на максимуме
// и что дают прорывы; у картриджа — бонусы набора, формы модулей и, если это
// набор из гайда, его особенность для этого эспера. Раньше набор был отдельным
// блоком ниже по карточке и повторял строку списка слово в слово.
function pickInner(x, kind, g) {
  const it = kind === 'arc' ? arcOf(x.n) : suitOf(x.n);
  if (!it) return '<div class="hint" style="margin:0">В таблицах игры этой вещи нет — ' +
    'скорее всего, она новая, и сборщик её ещё не видел.</div>';
  const out = [];
  if (it.desc) out.push('<div class="hint" style="margin:0 0 7px">' + esc(it.desc) + '</div>');

  if (kind === 'arc') {
    const top = (it.lv || [])[(it.lv || []).length - 1];
    if (top) out.push('<div class="geo"><span class="gsh">атака на ' + top.lv +
      ' уровне <b>' + top.atk + '</b></span>' +
      (it.rar ? '<span class="gsh">ранг ' + esc(it.rar) + '</span>' : '') + '</div>');
    // прорывы: что прибавляется к характеристикам на каждой ступени
    const bt = (it.bt || []).filter(b => b.n > 0 && (b.mods || []).length);
    if (bt.length) out.push('<div class="pick-bt">' + bt.map(b =>
      '<span class="gsh">' + b.n + ' прорыв: ' +
      b.mods.map(m => esc(m.ru) + ' +' + m.v + (m.pct ? '%' : '')).join(', ') +
      '</span>').join('') + '</div>');
  } else {
    (it.bonuses || []).forEach(b =>
      out.push('<div class="set-b"><i>' + b.n + '</i>' + esc(tr(b.text)) + '</div>'));
    if ((it.geo || []).length) out.push('<div class="geo" style="margin-top:7px">' +
      '<span class="hint" style="margin:0">формы модулей:</span>' +
      it.geo.map(gg => '<span class="gsh">' + shapeMini(gg) +
        (shapeType(gg) ? 'тип ' + shapeType(gg) : '') + '</span>').join('') + '</div>');
    // особенность эспера действует только с его набором
    if (g && g.set && g.set.n === x.n) {
      if ((g.pieces || []).length) out.push('<div class="pieces">' +
        '<span class="hint" style="margin:0">нужны модули:</span>' +
        g.pieces.map(p => '<span class="pc">' + esc(p) + '</span>').join('') + '</div>');
      if (g.trait) out.push('<div class="trait"><i>бонус эспера за модули</i>' +
        esc(tr(g.trait)) + '</div>');
    }
  }
  return out.join('');
}
function picksHtml(list, kind, g) {
  if (!list || !list.length) return '<div class="hint" style="margin:0">Данных пока нет.</div>';
  return '<div class="rows">' + list.map((x, i) => {
    // Картинка вещи из игры: у оружия — своя, у набора картриджей — значок
    // набора. Ранг для цвета имени берём из таблиц, если prydwen его не дал:
    // там он проставлен не у всех строк.
    const it = kind === 'arc' ? arcOf(x.n) : suitOf(x.n);
    const pic = it && it.icon
      ? (kind === 'arc' ? 'img/arcs/' : 'img/suits/') + it.icon : '';
    const rar = x.r || (it && it.rar) || '';
    return '<details class="pick"><summary class="row' + (i === 0 ? ' best' : '') + '">' +
      '<u>' + (i + 1) + '</u>' +
      (pic ? '<img src="' + esc(pic) + '" alt="" loading="lazy">' : '') +
      '<b class="' + (rar ? 'r-' + esc(rar) : '') + '" title="' + esc(x.n) + '">' +
        esc(ruName(kind === 'arc' ? 'arcs' : 'carts', x.n)) + '</b>' +
      (x.m ? '<span class="m">' + esc(x.m) + '</span>' : '') +
      (x.pct != null ? '<span class="pct">' + x.pct + '%</span>' : '') +
    '</summary><div class="pick-in">' + pickInner(x, kind, g) + '</div></details>';
  }).join('') + '</div>';
}

// ── карточка эспера: четыре вкладки ────────────────────────────────────────
// Раньше всё лежало одной простынёй: сборка, составы, синергии, сетка и
// калькулятор подряд — до сетки нужно было пролистать метр текста. Разложено
// так же, как в трекере ZZZ.
const SH_TABS = [['guide','Гайд'], ['awk','Пробуждения'], ['now','Сейчас'],
                 ['team','Команды'], ['con','Консоль']];
let shTab = 'guide';
let shSlug = '';

// Три быстрых факта в шапке: с чем ходить и что качать. Всё это есть во
// вкладке «Гайд», но там до них надо долистать, а вопрос при открытии
// карточки почти всегда один и тот же.
// Оружие ищем по английскому имени с prydwen: в таблицах игры оно лежит
// в поле en, русское — рядом.
function arcOf(name) {
  if (!GEAR || !name) return null;
  const n = String(name).toLowerCase();
  return (GEAR.arcs || []).filter(x => String(x.en || '').toLowerCase() === n ||
                                       String(x.ru || '').toLowerCase() === n)[0] || null;
}
// Главная характеристика приходит строкой вроде «DEF % > DEF > Break Intensity».
// Берём первую и подбираем к ней родной игровой значок.
const MAIN_ICO = [
  [/crit\s*d/i, 'cd'], [/crit/i, 'cr'], [/break/i, 'brk'], [/cycle/i, 'cyc'],
  [/heal/i, 'heal'], [/energy|charge/i, 'er'], [/\batk|attack/i, 'atk'],
  [/\bdef/i, 'def'], [/\bhp|health/i, 'hp'], [/dmg|damage/i, 'dmg']
];
function factsHtml(g) {
  const out = [];
  const arc = (g.arcs || [])[0];
  if (arc && arc.n) {
    const it = arcOf(arc.n);
    out.push(fact(it && it.icon ? 'img/arcs/' + it.icon : '', 'оружие',
      ruName('arcs', arc.n), arc.m || ''));
  }
  if (g.set && g.set.n) {
    const st = suitOf(g.set.n);
    out.push(fact(st && st.icon ? 'img/suits/' + st.icon : '', 'набор',
      ruName('carts', g.set.n), ''));
  }
  const main = String(g.main || '').split(/\s*(?:>>|>|=)\s*/)[0].trim();
  if (main) {
    const hit = MAIN_ICO.filter(x => x[0].test(main))[0];
    const k = hit ? hit[1] : '';
    out.push(fact(k && STAT_ICON[k] ? 'img/stat/' + STAT_ICON[k] : '', 'главная',
      prioRu(main), ''));
  }
  return out.length ? '<div class="sh-facts">' + out.join('') + '</div>' : '';
}
function fact(pic, cap, name, note) {
  return '<div class="fact" title="' + esc(name) + '">' +
    (pic ? '<img src="' + esc(pic) + '" alt="" loading="lazy">' : '') +
    '<span><i>' + esc(cap) + '</i><b>' + esc(name) +
      (note ? ' <span style="color:var(--tx3)">' + esc(note) + '</span>' : '') + '</b></span>' +
  '</div>';
}
function open(slug) {
  lookIdx = 0;
  const a = agentBy(slug);
  if (!a) return;
  if (shSlug !== slug) shTab = 'guide';
  shSlug = slug;
  const g = (GUIDE.agents || {})[slug] || {};

  plan = { cells: {}, pick: null, rot: 0, next: 1, slug: slug };
  calcFill(slug);

  const tags =
    (a.tier ? '<span class="tag tier" style="' + tierStyle(a.tier) + '">' + esc(a.tier) + '</span>' : '') +
    (a.el ? '<span class="tag"><img src="' + elIcon(a.el) + '" alt="">' +
      esc(EL_RU[a.el] || a.el) + '</span>' : '') +
    (a.role ? '<span class="tag"><img src="' + roleIcon(a.role) + '" alt="">' +
      esc(ROLE_RU[a.role] || a.role) + '</span>' : '');
  // Вкладка «Пробуждения» показывается и когда игровых таблиц ещё нет: у
  // свежих эсперов список ступеней строится по названиям из разбора.
  const hasAwk = (AWK[slug] || []).length || ((NB[slug] || {}).nodes || []).length;
  const shown = SH_TABS.filter(t => (t[0] !== 'con' || gridOf(slug)) &&
                                    (t[0] !== 'awk' || hasAwk));
  const facts = factsHtml(g);

  сброситьПанель(); $('sheetIn').innerHTML =
    '<div class="sh-head" style="' + elStyle(a.el) + ';--capc:var(--' + esc(a.el) + ')">' +
      '<div class="sh-art">' + lookHtml(a) + '</div>' +
      '<div class="sh-body">' +
        '<div class="sh-title">' +
          '<h2>' + esc(a.ru) + '<i>' + esc(a.en) + '</i>' +
            '<div class="sh-tags">' + tags + '</div>' +
          '</h2>' +
          '<div style="margin-left:auto;display:flex;gap:7px;align-items:center">' +
            '<a class="x" href="https://www.prydwen.gg/neverness-to-everness/characters/' +
              esc(slug) + '" target="_blank" rel="noopener" ' +
              'title="Полный гайд по эсперу на prydwen.gg: разбор кита, ротации, расчёты" ' +
              'style="text-decoration:none">prydwen ↗</a>' +
            '<button class="x" id="close">✕ закрыть</button>' +
          '</div>' +
          facts +
        '</div>' +
        '<div class="htabs">' + shown.map(t =>
          '<button class="htab' + (shTab === t[0] ? ' on' : '') + '" data-h="' + t[0] + '">' +
          esc(t[1]) + '</button>').join('') + '</div>' +
        '<div id="shBody">' + shBody(slug, g, a) + '</div>' +
      '</div>' +
    '</div>';

  $('sheet').classList.add('on');
  $('sheet').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if ($('close')) $('close').onclick = close;
  bindLooks(a);
  $('sheetIn').querySelectorAll('.htab').forEach(b => b.onclick = () => {
    shTab = b.dataset.h;
    $('sheetIn').querySelectorAll('.htab').forEach(x => x.classList.toggle('on', x.dataset.h === shTab));
    $('shBody').innerHTML = shBody(slug, g, a);
    bindShBody();
  });
  bindShBody();
}
function bindShBody() {
  bindPlan();
  bindCalc();
  bindSwap(shSlug);
  bindAwk(shSlug);
  bindMy(shSlug);
  bindCharPlan(shSlug);
  $('shBody').querySelectorAll('[data-slug]').forEach(c =>
    c.onclick = () => open(c.dataset.slug));
}

// Арт с переключением обликов: стрелки по краям и ряд миниатюр справа
// сверху — как на ntebuild. Если скинов нет, ни стрелок, ни миниатюр.
function lookHtml(a) {
  const all = looks(a);
  if (lookIdx >= all.length) lookIdx = 0;
  const cur = all[lookIdx];
  return '<img src="' + esc(cur.pic) + '" alt="' + esc(a.ru) + '" id="lookImg">' +
    (all.length > 1
      ? '<button class="lk-a l" data-look="-1" title="предыдущий облик">‹</button>' +
        '<button class="lk-a r" data-look="1" title="следующий облик">›</button>' +
        '<div class="lk-num">' + (lookIdx + 1) + ' / ' + all.length + '</div>' +
        '<div class="lk-name">' + esc(cur.ru) + (cur.rar ? ' ' + rarPill(cur.rar) : '') +
          (cur.src ? '<i>' + esc(cur.src) + '</i>' : '') + '</div>'
      : '');
}
function bindLooks(a) {
  const box = $('sheetIn') && $('sheetIn').querySelector('.sh-art');
  if (!box) return;
  const all = looks(a);
  const go = i => {
    lookIdx = (i + all.length) % all.length;
    box.innerHTML = lookHtml(a);
    bindLooks(a);
  };
  box.querySelectorAll('[data-look]').forEach(b2 =>
    b2.onclick = () => go(lookIdx + (+b2.dataset.look)));
}
function shBody(slug, g, a) {
  // margin-top тут не сбрасываем: раньше inline-стиль стоял на каждом заголовке
  // и перебивал отступ из CSS, поэтому разделы шли впритык друг к другу.
  // Первому заголовку отступ снимает правило .cap:first-child.
  const cap = (t, note) => '<div class="cap"><b>' + esc(t) + '</b><span></span>' +
    (note ? '<em>' + esc(note) + '</em>' : '') + '</div>';
  const has = g.arcs && g.arcs.length;

  if (shTab === 'con') return planHtml(slug);
  if (shTab === 'awk') return awkHtml(slug, g, cap);

  if (shTab === 'team') {
    const t = teamsFor(slug, cap), syn = synergyFor(g, cap);
    return (t || syn) ? t + syn :
      '<div class="empty">Составов для этого эспера на prydwen пока нет.</div>';
  }

  if (shTab === 'now') return nowHtml(slug, g, a, cap);

  if (!has) return '<div class="empty">Сборки для этого эспера ещё нет — на prydwen ' +
    'её добавят ближе к выходу.</div>';
  // Списки раскрываются по клику: внутри строки — описание вещи, её цифры и,
  // у набора эспера, бонусы 2 и 4 предметов. Отдельного блока «Набор модулей»
  // больше нет — он повторял первую строку картриджей слово в слово.
  return cap('Оружие', 'нажми, чтобы раскрыть') + picksHtml(g.arcs, 'arc', g) +
    cap('Картриджи', 'нажми, чтобы раскрыть') + picksHtml(g.carts, 'cart', g) +
    (g.main || g.subs ?
      cap('Приоритет характеристик') +
      '<div class="prio">' +
        (g.main ? '<b>Главные:</b> ' + prioHtml(g.main) + '<br>' : '') +
        (g.subs ? '<b>Дополнительные:</b> ' + prioHtml(g.subs) : '') +
      '</div>' +
      (g.statNote ? '<div class="hint">' + esc(tr(g.statNote)) + '</div>' : '') : '') +
    (g.goals && Object.keys(g.goals).length ?
      cap('Куда стремиться', 'уровень 60') + goalsHtml(g, a) : '') +
    (g.skills ? cap('Порядок прокачки') + '<div class="prio">' + prioHtml(g.skills) + '</div>' +
      (g.skillNote ? '<div class="hint">' + esc(g.skillNote) + '</div>' : '') : '');
}

// ── пробуждения ─────────────────────────────────────────────────────────────
// Дубликаты эспера с баннера идут в пробуждения A1…A6 — по сути созвездия.
// Тексты из таблиц игры, сколько у тебя открыто — хранит браузер. Плюс отметка,
// до какого пробуждения эспера имеет смысл вести: её берём из оценки prydwen
// («A6», «A1»), это подсказка, а не приговор.
// В этой игре пробуждения не идут по порядку, как созвездия в соседних играх.
// Каждый дубликат эспера даёт одну ступень на выбор: выбил первую повторку —
// можешь взять хоть A1, хоть A6. Выбил вторую — берёшь вторую из оставшихся.
// Поэтому храним не «докуда дошёл», а список того, что выбрано.
function awkHave(slug) {
  const raw = localStorage.getItem('nte-awk-' + slug) || '';
  // старый формат — просто число «докуда открыто»; разворачиваем в список
  if (/^\d$/.test(raw)) {
    const n = +raw, out = {};
    for (let i = 1; i <= n; i++) out[i] = 1;
    return out;
  }
  const out = {};
  raw.split(',').forEach(s => { const n = parseInt(s, 10); if (n >= 1 && n <= 6) out[n] = 1; });
  return out;
}
function awkSave(slug, obj) {
  const list = Object.keys(obj).filter(k => obj[k]).sort();
  try { localStorage.setItem('nte-awk-' + slug, list.join(',')); } catch (e) {}
}
function awkHtml(slug, g, cap) {
  let list = AWK[slug] || [];
  const nbAll = (NB[slug] || {}).nodes || [];
  // Свежих эсперов в дамп игры выкладывают не сразу: таблицы Character/Awaken
  // у них нет, и вкладка не появлялась вовсе. Названия ступеней при этом
  // известны из разбора — строим список по ним, без описаний. Как только
  // таблицы появятся, сборщик подставит настоящие тексты.
  let fromNb = false;
  if (!list.length && nbAll.length) {
    list = nbAll.map(x => ({ n: x.n, en: x.en, ru: '', desc: '' }));
    fromNb = true;
  }
  if (!list.length) return '<div class="empty">Для этого эспера таблицы пробуждений ' +
    'в игре ещё нет.</div>';
  const have = awkHave(slug);
  const n = Object.keys(have).length;
  const want = ((g.ratings || {}).awk || '').replace(/[^\d]/g, '');
  const eff = list.filter(x => !x.res), res = list.filter(x => x.res);
  // Какие ступени советуют брать первыми — с разбора ntebuild. В файлах игры
  // такого нет и быть не может: все шесть по игре равноправны, а порядок —
  // оценка тех, кто в эспера играл.
  const nb = NB[slug] || {};
  const top = {};
  (nb.awk || []).forEach(x => { top[x.n] = x.en || 1; });
  const card = x =>
    '<div class="awk' + (!x.res && have[x.n] ? ' on' : '') +
      (x.res && n >= x.n ? ' on' : '') + (!x.res && top[x.n] ? ' want' : '') + '"' +
      (x.res ? '' : ' data-awk="' + x.n + '" title="нажми, если оно у тебя выбрано"') + '>' +
      '<div class="awk-h">' +
        (x.pic ? '<img src="img/awk/' + esc(x.pic) + '" alt="" loading="lazy">' : '') +
        '<u>' + (x.res ? 'резонанс ' : 'A') + x.n + '</u>' +
        '<b>' + esc(x.ru || x.en || '') + '</b>' +
        (!x.res && top[x.n] ? '<span class="m top">★ берут первым</span>' : '') +
        (!x.res && have[x.n] ? '<span class="m">выбрано</span>' : '') +
      '</div>' +
      (x.desc ? '<div class="awk-d">' + esc(x.desc).replace(/\n/g, '<br>') + '</div>' : '') +
    '</div>';
  const topList = Object.keys(top).sort().map(k => 'A' + k);
  return cap('Сколько у тебя', n ? 'выбрано ' + n + ' из 6' : 'пока ни одного') +
    '<div class="hint">Пробуждения тут не идут по порядку, как созвездия в ' +
    'соседних играх. Каждый дубликат эспера даёт <b>одну ступень на выбор</b>: с ' +
    'первой повторки можно взять хоть A1, хоть A6. Отмечай ниже те, что взял ' +
    'себе — карточки нажимаются.' +
    (want ? ' По оценке prydwen эспер заметно прибавляет, когда ступеней ' +
      'набирается <b>' + esc(want) + '</b>.' : '') + '</div>' +
    (topList.length
      ? '<div class="box" style="margin-bottom:10px"><b>Что брать первым</b>' +
        'По разбору ntebuild самые полезные ступени у этого эспера — <b>' +
        topList.join(', ') + '</b>. Ниже они отмечены звёздочкой. Это не правило ' +
        'игры, а оценка тех, кто в него играл: ' +
        (nb.url ? '<a href="' + esc(nb.url) + '" target="_blank" rel="noopener">' +
          'разбор целиком ↗</a>' : 'смотри разбор на ntebuild') + '.</div>'
      : '') +
    cap('Пробуждения', eff.length + ' ступеней на выбор') +
    '<div class="awks">' + eff.map(card).join('') + '</div>' +
    (res.length ? cap('Резонансы', 'за количество, а не за номер') +
      '<div class="awks">' + res.map(card).join('') + '</div>' +
      '<div class="hint">Резонанс даётся за <b>число</b> открытых ступеней, а не ' +
      'за конкретные: первый — когда их три, второй — когда все шесть. Какие ' +
      'именно выбраны, тут не важно.</div>' : '') +
    (fromNb
      ? '<div class="hint">Описаний пока нет: этого эспера ещё не выложили в ' +
        'общий дамп игры, так что названия ступеней взяты из разбора' +
        (nb.url ? ' — <a href="' + esc(nb.url) + '" target="_blank" rel="noopener">' +
          'что они делают ↗</a>' : '') +
        '. Появятся в игре — подтянутся сами.</div>'
      : '<div class="hint">Тексты — из таблиц игры. Что ты выбрал, помнит этот ' +
        'браузер.</div>');
}
function bindAwk(slug) {
  const box = $('shBody');
  if (!box) return;
  box.querySelectorAll('[data-awk]').forEach(b => b.onclick = () => {
    const have = awkHave(slug), k = b.dataset.awk;
    if (have[k]) delete have[k]; else have[k] = 1;
    awkSave(slug, have);
    const g = (GUIDE.agents || {})[slug] || {};
    box.innerHTML = awkHtml(slug, g, (t, note) =>
      '<div class="cap"><b>' + esc(t) + '</b><span></span>' +
      (note ? '<em>' + esc(note) + '</em>' : '') + '</div>');
    bindShBody();
  });
}

// ── мои характеристики ─────────────────────────────────────────────────────
// Переносить их из игры автоматически нечем: у NTE нет ни витрины профиля, ни
// открытого API — эти цифры видны только на экране персонажа. Поэтому вписываем
// руками один раз, а браузер их запоминает: дальше карточка сама показывает,
// чего не хватает до целей гайда, и калькулятор считает по твоим числам.
const MY_KEYS = [
  ['hp',  'ОЗ',                 'hp',   0],
  ['atk', 'Атака',              'atk',  0],
  ['def', 'Защита',             'def',  0],
  ['cr',  'Шанс крита, %',      'cr',   1],
  ['cd',  'Крит. урон, %',      'cd',   1],
  ['dmg', 'Урон стихии, %',     'elem', 1],
  ['cyc', 'Инт. цикла',         'cyc',  0],
  ['brk', 'Инт. разрушения',    'brk',  0]
];
function myStats(slug) {
  try { return JSON.parse(localStorage.getItem('nte-my-' + slug)) || {}; }
  catch (e) { return {}; }
}
function myStatsSave(slug, obj) {
  try { localStorage.setItem('nte-my-' + slug, JSON.stringify(obj)); } catch (e) {}
}
// Числа перед записью: только известные ключи и только положительные. Разбор
// идёт с картинки, в него запросто прилетает мусор, а сохраняется это в
// браузер и потом участвует в расчётах.
const OCR_KEYS = ['cr', 'cd', 'cyc', 'brk', 'hp', 'atk', 'def', 'dmg'];
// Числа одного эспера: только знакомые ключи и только положительные числа.
function ocrPick(o) {
  const got = {};
  if (!o || typeof o !== 'object') return got;
  OCR_KEYS.forEach(k => {
    const v = parseFloat(o[k]);
    if (isFinite(v) && v > 0) got[k] = Math.round(v * 10) / 10;
  });
  return got;
}
function myHtml(slug, g) {
  const my = myStats(slug), G = g.goals || {};
  return '<div class="inp">' + MY_KEYS.map(k => {
    const goal = G[k[2]] ? G[k[2]][0] : null;
    const have = my[k[0]];
    const ok = goal != null && have != null && have >= goal;
    const miss = goal != null && have != null && have < goal;
    return '<div>' +
      '<label>' + statIco(k[0]) + esc(k[1]) +
        (goal != null ? ' <span style="color:var(--tx3)">цель ' + goal + (k[3] ? '%' : '') + '</span>' : '') +
      '</label>' +
      '<input type="number" step="any" data-my="' + k[0] + '" value="' + (have != null ? have : '') + '" ' +
        'style="' + (ok ? 'border-color:#4ade8066' : miss ? 'border-color:#fbbf2466' : '') + '">' +
      (miss ? '<div class="hint" style="margin:3px 0 0">не хватает ' +
        Math.round((goal - have) * 10) / 10 + (k[3] ? '%' : '') + '</div>' : '') +
    '</div>';
  }).join('') + '</div>' +
  '<div class="ocr">' +
    '<button class="fb" id="ocrBulkBtn">скрины скопом — на всех сразу</button>' +
    '<span class="hint" id="ocrSay" style="margin:0">или вставь скрин этого эспера ' +
    'из буфера — Ctrl+V</span>' +
  '</div>' +
  '<div class="hint">Числа лежат в этом браузере. Витрины профиля и API у NTE ' +
  'нет, поэтому сами они не подтянутся. Сними экран характеристик — <b>Win+Shift+S</b> — ' +
  'и вставь сюда по <b>Ctrl+V</b>: снимок разберётся прямо здесь, никуда не уходя. ' +
  'На всех сразу — <b>скрины скопом</b>.</div>';
}
// ── скрины скопом: распознавание прямо в браузере ───────────────────────────
// Скрипт на PowerShell читает точнее всех, но до него надо дойти: скачать файл,
// завести отдельную папку, переименовать в ней каждый скрин именем эспера,
// вписать верный путь в команду. Ради восьми чисел на эспера — перебор.
//
// Поэтому то же самое делает сама страница: кидаешь пачку снимков в окно, и
// они разбираются на месте. Движок распознавания — Tesseract, собранный в
// wasm; лежит в папке ocr рядом со страницей, никуда ничего не уходит.
// Первый заход тянет 6,6 МБ (ядро и русская модель), дальше браузер берёт их
// из своего кэша.
//
// Кто на скрине, определяем сами: сперва ищем имя эспера в распознанном
// тексте — на экране характеристик оно есть, — потом по имени файла. Если не
// вышло, у карточки остаётся выпадающий список: ткнуть мышью быстрее, чем
// переименовывать файлы.
const OCR_DIR  = new URL('ocr/', location.href).href;
// Проверка на wasm SIMD: без неё браузер молча получит 404 на другое ядро.
// Байты — минимальный модуль с инструкцией v128, обычная проба на эту фичу.
const OCR_SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
  3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
let ocrEng = null, ocrEngWait = null, ocrJobs = [], ocrBusy = false, ocrShow = -1;

function ocrSimdOk() {
  try { return WebAssembly.validate(OCR_SIMD_TEST); } catch (e) { return false; }
}
function scriptOnce(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[data-once="' + src + '"]')) return res();
    const s = document.createElement('script');
    s.src = src; s.dataset.once = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error('не загрузился ' + src));
    document.head.appendChild(s);
  });
}
const OCR_STEPS = {
  'loading tesseract core': 'загружаю движок',
  'initializing tesseract': 'завожу движок',
  'loading language traineddata': 'загружаю русскую модель',
  'initializing api': 'готовлю распознавание',
  'recognizing text': 'читаю'
};
// Движок один на страницу: каждый новый — это ещё сотня мегабайт памяти и
// заново прочитанная модель.
async function ocrEngine(say) {
  if (ocrEng) return ocrEng;
  if (!ocrEngWait) ocrEngWait = (async () => {
    if (!ocrSimdOk()) throw new Error('браузер не умеет wasm simd — тут распознавание не пойдёт');
    await scriptOnce(OCR_DIR + 'tesseract.min.js');
    if (typeof Tesseract === 'undefined') throw new Error('движок не загрузился');
    const w = await Tesseract.createWorker('rus', 1, {
      workerPath: OCR_DIR + 'worker.min.js',
      corePath:   OCR_DIR + 'tesseract-core-simd-lstm.wasm.js',
      langPath:   OCR_DIR,
      workerBlobURL: false,        // свой worker по адресу — не через blob, так спокойнее с CSP
      gzip: true,
      logger: m => {
        if (!say || !m || !m.status) return;
        const t = OCR_STEPS[m.status];
        if (t) say(t + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '…'));
      }
    });
    ocrEng = w;
    return w;
  })();
  try { return await ocrEngWait; }
  catch (e) { ocrEngWait = null; throw e; }
}

// Подготовка снимка — та же, что в nte-ocr.ps1: серый с растяжкой контраста.
// Тонкие светлые цифры на полупрозрачной подложке читаются заметно вернее,
// а блики и рамки уходят в чёрное. Размер держим в разумных пределах: на
// снимке 2K распознавание идёт втрое дольше без выигрыша в точности.
function ocrPrep(img) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  // Уменьшать полноэкранный снимок нельзя: подписи в игре и так мелкие, после
  // сжатия они рассыпаются. Поэтому крупное оставляем как есть, обрезанные
  // кусочки, наоборот, увеличиваем — распознавателю нужна высота буквы
  // хотя бы пикселей двадцать.
  let k = 1;
  if (w0 < 1100) k = Math.min(2, 1100 / w0);
  if (w0 * k > 2600) k = 2600 / w0;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w0 * k));
  cv.height = Math.max(1, Math.round(h0 * k));
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, 0, 0, cv.width, cv.height);
  const d = cx.getImageData(0, 0, cv.width, cv.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let v = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) | 0;
    v = v < 60 ? 0 : (v > 190 ? 255 : (((v - 60) * 255 / 130) | 0));
    p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
  }
  cx.putImageData(d, 0, 0);
  return cv;
}
function ocrLoadImg(file) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('это не картинка'));
    im.src = URL.createObjectURL(file);
  });
}
// Один эспер: вставка из буфера в его карточке. Тот же движок, что и у пачки,
// только результат сразу ложится этому эсперу — кто на снимке, спрашивать не
// надо, карточка уже открыта.
async function ocrOne(file, slug, say) {
  let eng;
  try { eng = await ocrEngine(t => say(t)); }
  catch (e) { say('не вышло: ' + e.message, 1); return; }
  say('читаю…');
  try {
    const img = await ocrLoadImg(file);
    const cv = ocrPrep(img);
    URL.revokeObjectURL(img.src);
    const r = await eng.recognize(cv);
    const got = ocrPick(ocrStatsFromText(((r || {}).data || {}).text || ''));
    const n = Object.keys(got).length;
    if (!n) { say('ничего не прочиталось — сними экран характеристик покрупнее', 1); return; }
    const my = myStats(slug);
    Object.keys(got).forEach(k => { my[k] = got[k]; });
    myStatsSave(slug, my);
    say('распознано значений: ' + n + ' — проверь глазами');
    calcFill(slug);
    const box = $('shBody');
    if (box) {
      const g = (GUIDE.agents || {})[slug] || {};
      box.innerHTML = nowHtml(slug, g, agentBy(slug), (t, note) =>
        '<div class="cap"><b>' + esc(t) + '</b><span></span>' +
        (note ? '<em>' + esc(note) + '</em>' : '') + '</div>');
      bindShBody();
    }
  } catch (e) { say('не вышло: ' + e.message, 1); }
}
function ocrThumb(img) {
  const k = 260 / Math.max(1, img.naturalWidth || img.width);
  const cv = document.createElement('canvas');
  cv.width = 260; cv.height = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  try { return cv.toDataURL('image/jpeg', 0.6); } catch (e) { return ''; }
}

// Подписи и разбор строк — те же правила, что в скрипте и в воркере. Порядок
// важен: «Крит. урон» должен проверяться раньше «Урона», иначе первое
// совпадёт со вторым.
const OCR_FIELDS = [
  ['cr',  /(шанс\s*крит|crit\s*rate)/i],
  ['cd',  /(крит\.?\s*урон|crit\s*d[mм]g)/i],
  ['cyc', /(интенсивност\S*\s*цик|cycle\s*intens)/i],
  ['brk', /(интенсивност\S*\s*разр|break\s*intens)/i],
  ['hp',  /(^|[\s|])([оo0][зz3]|hp|health|очки\s*здоров)([\s|:]|$)/i],
  ['atk', /(^|[\s|])(атака|attack|atk)([\s|:]|$)/i],
  ['def', /(^|[\s|])(защита|def(ense)?)([\s|:]|$)/i],
  ['dmg', /(бонус\s*к\s*урону|universal\s*d[mм]g|d[mм]g\s*bonus)/i]
];
// Правдоподобные границы. Нужны не для придирок, а против мусора: у
// распознавателя «2 480» иногда превращается в «2 48», а строка описания
// подсовывает свои проценты. Всё, что не лезет в эти рамки, — не та строка.
const OCR_SANE = { hp: [3000, 300000], atk: [300, 30000], def: [100, 20000],
  cr: [3, 100], cd: [40, 900], dmg: [0.5, 400], cyc: [1, 2000], brk: [1, 2000] };
function ocrSane(k, v) {
  const r = OCR_SANE[k];
  return !r || (v >= r[0] && v <= r[1]);
}
// «11418 + 6028» — база и прибавка со снаряжения показаны в игре раздельно, а
// нужен итог. Пробелы внутри числа — разделитель тысяч.
function ocrLineValue(line) {
  const tail = String(line).replace(/^[^:]*:/, '');
  const nums = [];
  (tail.match(/\d[\d\s.,]*/g) || []).forEach(t => {
    const s = t.replace(/\s/g, '').replace(/,(\d{3})\b/g, '$1').replace(',', '.').replace(/[.,]+$/, '');
    const v = parseFloat(s);
    if (isFinite(v) && v > 0) nums.push(v);
  });
  if (!nums.length) return null;
  if (nums.length === 2 && /\+/.test(tail)) return Math.round((nums[0] + nums[1]) * 10) / 10;
  return Math.round(nums[0] * 10) / 10;
}
function ocrStatsFromText(text) {
  const out = {}, flat = [];
  String(text || '').split(/\r?\n/).forEach(l => {
    flat.push(l);
    // две колонки в строке («Атака 2 480    Защита 940») — режем по большим пробелам
    if (/\d.*\S.*\d/.test(l)) Array.prototype.push.apply(flat, l.split(/\s{3,}/));
  });
  let первыйПлюс = null;
  flat.forEach(raw => {
    const line = String(raw).trim();
    if (!line || !/\d/.test(line)) return;
    const head = line.split(':')[0];      // подпись слева от числа, иначе «до 6 стаков» уедет в ОЗ
    let попал = false;
    OCR_FIELDS.forEach(f => {
      if (out[f[0]] != null) return;
      const m = head.match(f[1]);
      // Подпись должна открывать строку. На полном снимке экрана в кадр
      // попадают и описания умений («…увеличивает атаку на 30%»), и они
      // подставляли в характеристики свои проценты. В таблице подпись всегда
      // первая, максимум со значком перед ней.
      if (!m || m.index > 4) return;
      const v = ocrLineValue(line);
      if (v == null || !ocrSane(f[0], v)) return;
      out[f[0]] = v; попал = true;
    });
    // «ОЗ» — две буквы, и на них распознаватель спотыкается чаще всего:
    // выходит то «О3», то вовсе мусор. Зато строка узнаётся по виду: она
    // первая сверху с прибавкой через плюс и с самым большим числом на
    // экране. Берём её, только если подпись ни с чем не совпала.
    if (!попал && первыйПлюс === null && /\+/.test(line)) {
      const v = ocrLineValue(line);
      if (v != null && v >= 3000) первыйПлюс = v;
    }
  });
  if (out.hp == null && первыйПлюс != null) out.hp = первыйПлюс;
  return out;
}
function ocrPlain(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{Nd}]/gu, '');
}
// Кто на снимке. Сперва ищем имя в самом тексте — на экране характеристик оно
// написано, и это надёжнее любых договорённостей об именах файлов. Короткие
// куски не берём: «ноль» встретится и в описании умения.
function ocrWho(text, fileName) {
  const list = DB.agents || [];
  const t = ocrPlain(text);
  let best = null, len = 0;
  list.forEach(a => {
    [a.ru, a.en, a.slug].forEach(n => {
      const p = ocrPlain(n);
      if (p.length >= 4 && p.length > len && t.indexOf(p) >= 0) { best = a; len = p.length; }
    });
  });
  if (best) return { a: best, how: 'имя на скрине' };
  const f = ocrPlain(String(fileName || '').replace(/\.[a-z0-9]+$/i, ''));
  if (f) {
    for (const точно of [true, false]) {
      for (const a of list) {
        for (const n of [a.slug, a.ru, a.en]) {
          const p = ocrPlain(n);
          if (!p) continue;
          if (точно ? (f === p) : (f.indexOf(p) === 0 || p.indexOf(f) === 0))
            return { a: a, how: 'имя файла' };
        }
      }
    }
  }
  return null;
}

function ocrBulkHtml() {
  const список = (DB.agents || []).slice().sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
  const выбор = (j, i) => '<select data-who="' + i + '">' +
    '<option value="">— чей это скрин? —</option>' +
    список.map(a => '<option value="' + esc(a.slug) + '"' +
      (a.slug === j.slug ? ' selected' : '') + '>' + esc(a.ru) + '</option>').join('') +
    '</select>';
  const числа = j => {
    const k = Object.keys(j.stats || {});
    if (!k.length) return '<div class="hint" style="margin:0">ничего не прочиталось</div>';
    return '<div class="st">' + MY_KEYS.filter(m => j.stats[m[0]] != null).map(m =>
      '<i>' + esc(m[1].replace(', %', '')) + '</i><b>' + j.stats[m[0]] + '</b>').join('') + '</div>';
  };
  const карточки = ocrJobs.map((j, i) =>
    '<div class="ocrc' + (j.work ? ' work' : '') +
      (!j.work && (!j.slug || !Object.keys(j.stats || {}).length) ? ' bad' : '') + '" data-i="' + i + '">' +
      (j.thumb ? '<img src="' + j.thumb + '" alt="">' : '') +
      выбор(j, i) +
      числа(j) +
      '<div class="row"><em>' + esc(j.work ? (j.step || 'в очереди') :
        (j.how || 'выбери вручную')) + '</em>' +
        '<button class="fb" data-txt="' + i + '">текст</button></div>' +
    '</div>').join('');
  const готовых = ocrJobs.filter(j => !j.work && j.slug && Object.keys(j.stats || {}).length).length;
  const текст = ocrShow >= 0 && ocrJobs[ocrShow]
    ? '<div class="ocrtxt">' + esc(ocrJobs[ocrShow].name) + '\n\n' +
      esc(ocrJobs[ocrShow].text || 'пусто') + '</div>' : '';
  return '<div class="sh-body">' +
    '<div class="sh-title"><h2>Скрины скопом<i>распознаю прямо здесь</i></h2>' +
      '<div style="margin-left:auto"><button class="x" id="close">✕ закрыть</button></div>' +
    '</div>' +
    '<div class="drop" id="ocrDrop"><b>Перетащи сюда скриншоты</b>' +
      '<span>или нажми и выбери файлы · можно вставить из буфера, Ctrl+V</span></div>' +
    '<input type="file" id="ocrFiles" accept="image/*" multiple style="display:none">' +
    '<div class="ocrbar">' +
      '<span class="hint" id="ocrBulkSay" style="margin:0">' +
        (ocrJobs.length ? 'разобрано: ' + готовых + ' из ' + ocrJobs.length : 'файлы никуда не уходят — всё считается в браузере') +
      '</span>' +
      '<div class="ocrpb"><i id="ocrBulkPb"></i></div>' +
      '<button class="fb" id="ocrApply"' + (готовых ? '' : ' disabled') + '>записать всем</button>' +
      (ocrJobs.length ? '<button class="fb" id="ocrClear">очистить</button>' : '') +
    '</div>' +
    (ocrJobs.length
      ? '<div class="ocrwrap' + (текст ? ' with-txt' : '') + '">' +
          '<div class="ocrg">' + карточки + '</div>' + текст + '</div>'
      : '') +
    '<div class="hint">Имена файлов и папка значения не имеют: эспер определяется ' +
    'по имени на самом скрине, а если не вышло — ставь его выпадающим списком. ' +
    'Снимай экран характеристик целиком, вместе с именем эспера.<br>' +
    'Первый заход подгружает движок распознавания — 6,6 МБ, дальше он берётся ' +
    'из кэша браузера. Всё считается на твоём компьютере, снимки никуда не отправляются.<br>' +
    'Если числа прочитались криво — рядом остался прежний путь: скрипт ' +
    'nte-ocr.ps1 на встроенном распознавателе Windows, он точнее.</div>' +
  '</div>';
}
function ocrBulkDraw() {
  const s = $('sheetIn');
  if (!s || !s.querySelector('#ocrDrop')) return;   // панель закрыли — рисовать некуда
  s.innerHTML = ocrBulkHtml();
  bindOcrBulk();
}
function showOcrBulk() {
  сброситьПанель(); $('sheetIn').innerHTML = ocrBulkHtml();
  $('sheet').classList.add('on');
  bindOcrBulk();
}
function bindOcrBulk() {
  const c = $('close');
  if (c) c.onclick = () => $('sheet').classList.remove('on');
  const drop = $('ocrDrop'), inp = $('ocrFiles');
  if (drop && inp) {
    drop.onclick = () => inp.click();
    inp.onchange = () => { ocrAdd(Array.from(inp.files || [])); inp.value = ''; };
    ['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => {
      ev.preventDefault(); drop.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => {
      ev.preventDefault(); drop.classList.remove('over');
    }));
    drop.addEventListener('drop', ev => {
      const fs = Array.from((ev.dataTransfer && ev.dataTransfer.files) || [])
        .filter(f => /^image\//.test(f.type));
      if (fs.length) ocrAdd(fs);
    });
  }
  $('sheetIn').querySelectorAll('[data-who]').forEach(sel => sel.onchange = () => {
    const j = ocrJobs[+sel.dataset.who];
    if (j) j.slug = sel.value;
    ocrBulkDraw();
  });
  $('sheetIn').querySelectorAll('[data-txt]').forEach(b => b.onclick = () => {
    const i = +b.dataset.txt;
    ocrShow = (ocrShow === i ? -1 : i);
    ocrBulkDraw();
  });
  // Ctrl+V прямо в панели: Win+Shift+S кладёт снимок в буфер, и его не надо
  // никуда сохранять. Обработчик один на документ, ставим его однажды.
  if (!window.__ocrPaste) {
    window.__ocrPaste = e => {
      if (!$('ocrDrop')) return;                 // панель закрыта — не мешаем
      const cd = e.clipboardData;
      if (!cd) return;
      const fs = [...(cd.items || [])]
        .filter(x => x.type && x.type.indexOf('image') === 0)
        .map(x => x.getAsFile()).filter(Boolean);
      if (!fs.length) return;
      e.preventDefault();
      ocrAdd(fs);
    };
    document.addEventListener('paste', window.__ocrPaste);
  }
  const ap = $('ocrApply');
  if (ap) ap.onclick = ocrApplyAll;
  const cl = $('ocrClear');
  if (cl) cl.onclick = () => { ocrJobs = []; ocrShow = -1; ocrBulkDraw(); };
}
function ocrSayBulk(t) {
  const el = $('ocrBulkSay');
  if (el) el.textContent = t;
}
function ocrPb(v) {
  const el = $('ocrBulkPb');
  if (el) el.style.width = Math.max(0, Math.min(100, v)) + '%';
}
function ocrAdd(files) {
  const свежие = files.filter(f => /^image\//.test(f.type));
  if (!свежие.length) return;
  свежие.forEach(f => ocrJobs.push({ name: f.name || 'из буфера', file: f, work: true, stats: {}, text: '' }));
  ocrBulkDraw();
  ocrRun();
}
// Разбираем по одному: движок всё равно однопоточный, а несколько сразу —
// это несколько копий модели в памяти.
async function ocrRun() {
  if (ocrBusy) return;
  ocrBusy = true;
  try {
    let eng;
    try { eng = await ocrEngine(t => ocrSayBulk(t)); }
    catch (e) { ocrSayBulk('не вышло: ' + e.message); ocrJobs.forEach(j => { j.work = false; }); ocrBulkDraw(); return; }
    for (;;) {
      const i = ocrJobs.findIndex(j => j.work);
      if (i < 0) break;
      const j = ocrJobs[i];
      const всего = ocrJobs.length, номер = i + 1;
      ocrSayBulk('читаю ' + номер + ' из ' + всего + ': ' + j.name);
      try {
        const img = await ocrLoadImg(j.file);
        j.thumb = ocrThumb(img);
        const cv = ocrPrep(img);
        URL.revokeObjectURL(img.src);
        const r = await eng.recognize(cv);
        j.text = (r && r.data && r.data.text) || '';
        j.stats = ocrStatsFromText(j.text);
        const кто = ocrWho(j.text, j.name);
        if (кто) { j.slug = кто.a.slug; j.how = кто.how; }
      } catch (e) {
        j.text = 'сбой: ' + e.message;
      }
      j.work = false; j.file = null;
      ocrPb(номер * 100 / всего);
      ocrBulkDraw();
    }
    const готовых = ocrJobs.filter(j => j.slug && Object.keys(j.stats || {}).length).length;
    ocrSayBulk('готово: ' + готовых + ' из ' + ocrJobs.length +
      (готовых < ocrJobs.length ? ' — остальным поставь эспера вручную' : ''));
    ocrPb(100);
  } finally { ocrBusy = false; }
}
function ocrApplyAll() {
  let людей = 0, чисел = 0;
  ocrJobs.forEach(j => {
    if (!j.slug || !agentBy(j.slug)) return;
    const got = ocrPick(j.stats);
    const n = Object.keys(got).length;
    if (!n) return;
    const my = myStats(j.slug);
    Object.keys(got).forEach(k => { my[k] = got[k]; });
    myStatsSave(j.slug, my);
    людей++; чисел += n;
  });
  if (!людей) { ocrSayBulk('записывать нечего'); return; }
  ocrSayBulk('записано: ' + людей + ' ' + plural(людей, 'эспер', 'эспера', 'эсперов') +
    ', ' + чисел + ' ' + plural(чисел, 'значение', 'значения', 'значений') +
    ' — проверь числа глазами');
  // Карточку эспера перерисовывать не нужно: она живёт в этой же панели и
  // сейчас закрыта нами. Числа лежат в localStorage — карточка возьмёт их,
  // когда откроется снова.
}

// «Сейчас» — что с эспером сегодня: баннер, место в мете, твои характеристики
// и что выгоднее качать дальше.
// ── планировщик прокачки эспера ────────────────────────────────────────────
// В игре не видно, во что обойдётся довести эспера до нужного уровня: опыт
// показан числом, материалы прорывов разбросаны по экранам. Считаем сами:
// сколько книг, монет и материалов нужно от текущего уровня до целевого.
function charLv(slug) {
  try { return JSON.parse(localStorage.getItem('nte-lv-' + slug)) || { from: 1, to: 80 }; }
  catch (e) { return { from: 1, to: 80 }; }
}
function charLvSave(slug, v) {
  try { localStorage.setItem('nte-lv-' + slug, JSON.stringify(v)); } catch (e) {}
}
// Ступень прорыва i снимает предел, поставленный ступенью i-1. Значит она
// нужна, когда цель выше её предела-предшественника, а мы этот предел ещё
// не прошли.
function charCost(slug, from, to) {
  const exp = (GEAR.charExp || []).slice(Math.max(0, from - 1), Math.max(0, to - 1))
    .reduce((n, x) => n + (x || 0), 0);
  const ups = (GEAR.charUp || {})[slug] || [];
  const items = {}, add = list => (list || []).forEach(it => {
    if (!items[it.id]) items[it.id] = { ru: it.ru, icon: it.icon, rar: it.rar, n: 0 };
    items[it.id].n += it.n;
  });
  let gold = 0, steps = 0;
  ups.forEach((u, i) => {
    if (!i) return;                       // нулевая ступень ничего не стоит
    const prev = ups[i - 1].maxLv || 0;
    if (to > prev && from <= prev) { add(u.need); gold += u.gold || 0; steps++; }
  });
  return { exp: exp, gold: gold, steps: steps, items: Object.values(items) };
}
function charPlanHtml(slug) {
  const ups = (GEAR.charUp || {})[slug] || [];
  if (!ups.length) return '';
  const v = charLv(slug);
  const c = charCost(slug, v.from, v.to);
  const mats = goldMat(c.gold)
    .concat(expMats(c.exp, GEAR.expChar))
    .concat(c.items);
  return '<div class="lvpair">' +
      '<label>сейчас<input type="number" min="1" max="80" value="' + v.from + '" data-lv="from"></label>' +
      '<label>цель<input type="number" min="1" max="80" value="' + v.to + '" data-lv="to"></label>' +
      '<span class="hint" style="margin:0">' + (c.steps ? c.steps + ' прорывов' : 'без прорывов') + '</span>' +
    '</div>' +
    (mats.length ? matHtml(mats)
      : '<div class="hint">Уже на целевом уровне — качать нечего.</div>');
}
function bindCharPlan(slug) {
  const box = $('lvPlan');
  if (!box) return;
  box.querySelectorAll('input[data-lv]').forEach(inp => inp.onchange = () => {
    const v = charLv(slug);
    const n = Math.max(1, Math.min(80, Math.round(+inp.value) || 1));
    v[inp.dataset.lv] = n;
    if (v.to < v.from) v.to = v.from;
    charLvSave(slug, v);
    box.innerHTML = charPlanHtml(slug);
    bindCharPlan(slug);
  });
}
// Роль эспера в составе — с разбора ntebuild. Их формулировка на английском
// и короткая: «S-rank Anima Main DPS / Follow-up Attack». Переводим знакомые
// куски, остальное оставляем как есть: новые роли появятся с патчами, и
// английский ярлык лучше пропуска.
const TEAMROLE_RU = {
  'main dps': 'основной урон', 'sub-dps': 'второй номер по урону',
  'sub dps': 'второй номер по урону', 'burst dps': 'урон по всплеску',
  'support': 'поддержка', 'buffer': 'усиливает команду',
  'healer': 'лечение', 'healer / buffer': 'лечение и усиление',
  'follow-up attack': 'добивающие удары', 'on-field': 'бьёт сам, на поле',
  'off-field': 'бьёт из-за спины', 'breaker': 'ломает защиту',
  'debuffer': 'ослабляет врагов', 'shielder': 'щиты',
  'anomaly': 'аномалии', 'hybrid': 'универсал'
};
function roleRu(s) {
  return String(s || '').split('/').map(p => {
    const t = p.trim().replace(/\s+/g, ' ');
    // ранг и стихия в начале строки у нас и так показаны в шапке — убираем
    const cut = t.replace(/^[SAB]-rank\s+/i, '')
                 .replace(/^(Anima|Cosmos|Chaos|Plasma|Lakshana|Incantation)\s+/i, '');
    return TEAMROLE_RU[cut.toLowerCase()] || cut;
  }).filter(Boolean).join(' · ');
}
function roleHtml(slug) {
  const nb = NB[slug] || {};
  const lines = BRIEF[slug] || [];
  if (!nb.role && !lines.length) return '';
  // Роль одной строкой, под ней — что эспер делает для остальных. Тексты
  // игровые: первое предложение каждой его пассивки. Полные описания умений
  // сюда не тащим — за ответом «зачем он нужен» никто не полезет читать
  // стену текста.
  return '<div class="why">' +
    (nb.role ? '<b>' + esc(roleRu(nb.role)) + '</b>' : '') +
    (lines.length ? '<ul>' + lines.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
    '<i>по описаниям умений из игры' +
      (nb.url ? ' · <a href="' + esc(nb.url) + '" target="_blank" rel="noopener">' +
        'разбор на ntebuild ↗</a>' : '') + '</i>' +
  '</div>';
}
// ── что собирать и где потолок ─────────────────────────────────────────────
// Числовые цели («крит 90%») приезжают с prydwen и отвечают на вопрос «сколько».
// Но перед ним стоит другой: какой главный стат ставить на модуль и какие
// доп. статы ловить. Это разбор с ntebuild, собирает build-nte-build.ps1.
// Названия статов там английские — переводим теми же словами, что в игре.
const STAT_EN_RU = {
  'CRIT Rate': 'шанс крита', 'CRIT DMG': 'крит. урон',
  'ATK%': 'атака, %', 'ATK': 'атака', 'DEF%': 'защита, %', 'DEF': 'защита',
  'HP%': 'ОЗ, %', 'HP': 'ОЗ',
  'Break Intensity': 'инт. разрушения', 'Cycle Intensity': 'инт. цикла',
  'Universal DMG': 'общий урон', 'DMG%': 'урон, %', 'Healing Bonus': 'лечение',
  'Anima DMG': 'урон анимы', 'Chaos DMG': 'урон хаоса', 'Cosmos DMG': 'урон космоса',
  'Incantation DMG': 'урон заклинания', 'Lakshana DMG': 'урон лакшаны',
  'Psyche DMG': 'урон психики',
  'Skill': 'умение', 'Ultimate': 'ультимейт', 'Basic': 'обычная атака',
  'Basic Attack': 'обычная атака', 'QTE': 'QTE'
};
function statEnRu(t) {
  const k = String(t || '').trim();
  if (STAT_EN_RU[k]) return STAT_EN_RU[k];
  // «Cycle Intensity / CRIT Rate» — на ntebuild так помечают равнозначные
  if (k.indexOf('/') > 0) return k.split('/').map(x => statEnRu(x)).join(' или ');
  return k;
}
// Бонус сетки Консоли приходит строкой вида «+8% CRIT Rate per Type III Module
// equipped». Переводим шаблоном: смысл у неё всегда один.
function gridRu(t) {
  const m = String(t || '').match(/^([+\-]?[\d.]+%?)\s*(.+?)\s*per\s*Type\s*([IVX\d]+)\s*Module/i);
  if (!m) return String(t || '');
  return m[1] + ' ' + statEnRu(m[2]) + ' за каждый модуль типа ' + m[3];
}
// Потолки. Жёсткий в игре один — крит-шанс: всё, что выше 100%, пропадает.
// Остальные «пределы» — это сколько даёт главный стат одного модуля S на
// двадцатом уровне; из таблиц игры, лежат в nte-gear.json.
const CAP_HARD = { cr: 100 };
const CAP_P = { hp:'HPMaxUp', atk:'AtkUp', def:'DefUp', cr:'CritBase', cd:'CritDamageBase' };
function capOne(k) {
  const p = CAP_P[k];
  if (!p) return null;
  const st = (GEAR.modStats || []).filter(x => x.p === p)[0];
  return st && st.val && st.val.S ? st.val.S.max : null;
}
// Заметка к целям крита. Цели с prydwen — это пороги («добери шанс до 90%»), а
// не равновесие. Правило равновесия другое: сабстат даёт 10% шанса против 20%
// урона, значит выгодно держать крит. урон вдвое выше шанса. Где цели этому
// заметно противоречат, честнее сказать об этом прямо, чем молча показывать
// цифру, дотянув до которой игрок остановится.
function critNote(g) {
  const G = g.goals || {};
  const cr = G.cr ? G.cr[0] : null, cd = G.cd ? G.cd[0] : null;
  if (cr == null || cd == null || cr < 20) return '';
  if (cd >= cr * 2 - 30) return '';
  return 'Цель по крит. урону тут — <b>порог, а не равновесие</b>: при шансе ' + cr +
    '% сабстаты выгоднее лить в крит. урон примерно до <b>' + (cr * 2) + '%</b>. ' +
    'Дотянув до ' + cd + '%, останавливаться рано.';
}
function buildHtml(slug, g) {
  const nb = NB[slug] || {};
  const ms = nb.mainStats || [], ss = nb.subStats || [];
  if (!ms.length && !ss.length && !nb.grid && !(nb.skillOrder || []).length) return '';
  const ряд = (список, звёзд) => '<ol class="pri">' + список.map((t, i) =>
    '<li' + (i < звёзд ? ' class="top"' : '') + '><u>' + (i + 1) + '</u>' +
    esc(statEnRu(t)) + '</li>').join('') + '</ol>';
  const пределы = ['cr', 'cd', 'atk', 'hp', 'def'].map(k => {
    const v = capOne(k);
    if (v == null) return '';
    const имя = { cr:'Шанс крита', cd:'Крит. урон', atk:'Атака, %', hp:'ОЗ, %', def:'Защита, %' }[k];
    return '<tr><td>' + statIco(k) + esc(имя) + '</td><td class="num">' + v + '%</td>' +
      '<td>' + (CAP_HARD[k] ? 'потолок ' + CAP_HARD[k] + '%' : '—') + '</td></tr>';
  }).join('');
  return '<div class="bld">' +
    (ms.length ? '<div class="box"><b>Главные статы модулей</b>' + ряд(ms, 1) + '</div>' : '') +
    (ss.length ? '<div class="box"><b>Доп. статы, по важности</b>' + ряд(ss, 2) + '</div>' : '') +
    ((nb.skillOrder || []).length
      ? '<div class="box"><b>Порядок прокачки умений</b>' + ряд(nb.skillOrder, 1) + '</div>' : '') +
    (nb.grid ? '<div class="box"><b>Бонус сетки Консоли</b>' +
      '<div class="verdict" style="margin:7px 0 0">' + esc(gridRu(nb.grid)) + '</div></div>' : '') +
    '<div class="box"><b>Сколько даёт один модуль S</b>' +
      '<table class="tbl" style="margin-top:7px"><tr><th>стат</th><th>главный стат, макс</th>' +
      '<th>потолок в игре</th></tr>' + пределы + '</table>' +
      '<div class="hint" style="margin-top:6px">Значения из таблиц игры: главный стат ' +
      'модуля S на 20-м уровне. Крит-шанс выше 100% не работает — лишнее пропадает, ' +
      'и если часть шанса даёт бафф команды, своих статов держи ровно столько, ' +
      'чтобы с баффом выходило 100.</div>' +
    '</div>' +
    (critNote(g) ? '<div class="box" style="grid-column:1/-1"><div class="verdict">' +
      critNote(g) + '</div></div>' : '') +
  '</div>' +
  '<div class="hint">Порядок статов и умений — разбор с ntebuild' +
    (nb.url ? ' (<a href="' + esc(nb.url) + '" target="_blank" rel="noopener">страница эспера ↗</a>)' : '') +
    '. Числовые цели выше — с prydwen. Пределы — из таблиц игры.</div>';
}
function nowHtml(slug, g, a, cap) {
  const bans = (GUIDE.banners || []).filter(b => b.slug === slug);
  const live = bans.filter(b => /current|сейчас/i.test(b.key + ' ' + b.group))[0];
  const next = bans.filter(b => b !== live)[0];
  const inTeams = (GUIDE.teams || []).filter(t => t.slots.some(x => x.indexOf(slug) >= 0));
  const asCore = inTeams.filter(t => (t.slots[0] || []).indexOf(slug) >= 0).length;
  const rat = g.ratings || {};

  const tiles = '<div class="stat">' +
      (a.tier ? '<div class="st"><b>' + esc(a.tier) + '</b>место в тир-листе</div>' : '') +
      (rat.awk ? '<div class="st"><b>' + esc(rat.awk) + '</b>оценка при пробуждениях</div>' : '') +
      '<div class="st' + (inTeams.length ? ' ok' : '') + '"><b>' + inTeams.length + '</b>мета-составов</div>' +
      (asCore ? '<div class="st" title="Составы, где он стоит первым номером: вся команда ' +
        'работает на него, остальные подают ресурс и баффы">' +
        '<b>' + asCore + '</b>из них он главный</div>' : '') +
    '</div>' +
    // Чем эспер занят в составе. Игра пишет только роль-ярлык («Урон»), а
    // полезно другое: он сам бьёт или разгоняет чужой урон, держит ресурс,
    // ломает защиту. Это оценка разборщиков, из файлов игры её не достать.
    roleHtml(slug);
  const banner = live
    ? '<div class="verdict">Баннер <b>идёт прямо сейчас</b>: ' + esc(banDates(live) + banLeft(live)) +
      (live.patch ? ' · ' + esc(live.patch) : '') + '</div>'
    : next
      ? '<div class="box"><b>Ближайший баннер</b>' + esc(next.group) + ': ' + esc(banDates(next) + banLeft(next)) +
        (next.patch ? ' · ' + esc(next.patch) : '') + '</div>'
      : '<div class="hint">Баннера в расписании нет — либо он уже прошёл, либо ещё не объявлен.</div>';
  const cal = (g.goals && (g.goals.cr || g.goals.cd))
    ? cap('Что качать дальше', 'отдача одного сабстата') + '<div id="calcBox">' + calcHtml() + '</div>' +
      cap('Что даст замена', 'прикидка прироста урона') + '<div id="swapBox">' + swapHtml(slug) + '</div>'
    : '';
  const plan = ((GEAR && GEAR.charUp) || {})[slug]
    ? cap('Во что обойдётся прокачка', 'книги, монеты, материалы прорывов') +
      '<div id="lvPlan">' + charPlanHtml(slug) + '</div>'
    : '';
  return tiles + banner +
    (rat.mode ? '<div class="hint">Оценка prydwen: ' + esc(RATE_RU[rat.role] || rat.role || '') +
      ', режим ' + esc(RATE_RU[rat.mode] || rat.mode) + '.</div>' : '') +
    plan +
    (buildHtml(slug, g)
      ? cap('Что собирать', 'главные статы, доп. статы, пределы') + buildHtml(slug, g)
      : '') +
    cap('Мои характеристики', 'из игры, вручную') + myHtml(slug, g) +
    cal;
}
function bindMy(slug) {
  const box = $('shBody');
  if (!box) return;
  const say = (t, bad) => {
    const el = $('ocrSay');
    if (el) { el.textContent = t; el.style.color = bad ? '#fbbf24' : 'var(--acc)'; }
  };
  if ($('ocrBulkBtn')) $('ocrBulkBtn').onclick = showOcrBulk;
  // Один эспер — вставкой из буфера: Win+Shift+S и сразу Ctrl+V, файл сохранять
  // не надо. Читает тот же движок, что и «скрины скопом», прямо здесь.
  box.onpaste = e => {
    const cd = e.clipboardData;
    if (!cd) return;
    const it = [...(cd.items || [])]
      .filter(x => x.type && x.type.indexOf('image') === 0)[0];
    if (!it) return;
    e.preventDefault();
    ocrOne(it.getAsFile(), slug, say);
  };
  box.querySelectorAll('input[data-my]').forEach(inp => inp.onchange = () => {
    const my = myStats(slug);
    const v = parseFloat(inp.value);
    if (isFinite(v)) my[inp.dataset.my] = v; else delete my[inp.dataset.my];
    myStatsSave(slug, my);
    calcFill(slug);
    const g = (GUIDE.agents || {})[slug] || {};
    const a = agentBy(slug);
    box.innerHTML = nowHtml(slug, g, a, (t, note) =>
      '<div class="cap"><b>' + esc(t) + '</b><span></span>' +
      (note ? '<em>' + esc(note) + '</em>' : '') + '</div>');
    bindShBody();
  });
}

// Составы, где этот эспер есть: со своей страницы гайда (там они расписаны
// под него) плюс из общего тир-листа команд.
//
// Тир есть только у вторых, поэтому раньше половина составов висела без ранга,
// а «Zankou Hyper» показывался дважды — один раз со страницы эспера, другой из
// тир-листа, потому что слоты у них слегка разные. Сводим их по названию:
// совпало — берём слоты с гайда, а ранг из тир-листа.
const teamKey = t => String(t.name || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
function teamsFor(slug, cap) {
  const own = ((GUIDE.agents || {})[slug] || {}).teams || [];
  const glob = (GUIDE.teams || []).filter(t => t.slots.some(s => s.indexOf(slug) >= 0));
  const byName = {};
  glob.forEach(t => { byName[teamKey(t)] = t; });

  const out = [], seen = new Set();
  const push = t => {
    if (t.slots.length < 3) return;
    const k = teamKey(t) || t.slots.map(s => s.slice().sort().join('/')).join('|');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  own.forEach(t => {
    const g = byName[teamKey(t)];
    push(Object.assign({}, t, { tier: (g && g.tier) || '', note: g ? '' : 'состав из гайда' }));
  });
  glob.forEach(t => push(Object.assign({}, t, { note: '' })));
  if (!out.length) return '';
  out.sort((x, y) => {
    const r = t => { const i = TIERS.indexOf(t.tier); return i < 0 ? 99 : i; };
    return r(x) - r(y);
  });
  return cap('Составы с ним', out.length + ' шт.') + teamsHtml(out, true);
}

// «С кем играется»: по блоку на союзника, каждый разворачивается. Раскрытым
// весь список занимал полтора экрана — при девяти-одиннадцати союзниках это
// нечитаемо.
function synergyFor(g, cap) {
  const syn = g.synergy || [];
  if (!syn.length) return '';
  return cap('С кем играется', syn.length + ' союзников') + syn.map(s => {
    const names = s.with.map(w => { const x = agentBy(w); return x ? x.ru : w; }).join(' / ');
    const pics = s.with.map(w => {
      const x = agentBy(w);
      return '<img src="' + (x ? portrait(x) : '') + '" alt="" loading="lazy">';
    }).join('');
    return '<details class="fold"><summary>' + pics +
        '<b>' + esc(names) + '</b>' +
        '<span class="hint" style="margin:0 0 0 auto">' + s.notes.length + '</span>' +
      '</summary>' +
      '<div class="fold-in"><ul style="margin:0;padding-left:18px;color:var(--tx2);' +
        'font-size:12px;line-height:1.6">' +
        s.notes.map(n => '<li>' + esc(tr(n)) + '</li>').join('') +
      '</ul></div></details>';
  }).join('');
}

// ── откуда данные и насколько они свежие ───────────────────────────────────
// Часть данных обновляется сама (коды тянет воркер), а часть живёт ровно до
// следующего прогона сборщика на компьютере. По странице этого не видно, и
// легко принять прошлогодний тир-лист за сегодняшний. Клик по версии в шапке
// показывает, что когда собрано и что придётся обновлять руками.
function daysAgo(s) {
  if (!s) return null;
  const t = Date.parse(String(s).replace(' ', 'T'));
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
function freshRow(name, built, how, note) {
  const d = daysAgo(built);
  const cls = d == null ? '' : d > 30 ? ' old' : d > 10 ? ' warm' : ' ok';
  const when = built ? (d === 0 ? 'сегодня' : d === 1 ? 'вчера'
    : d != null ? d + ' дн. назад' : String(built)) : 'не собиралось';
  return '<tr><td><b>' + esc(name) + '</b><i>' + esc(note) + '</i></td>' +
    '<td><span class="fdot' + cls + '"></span>' + esc(when) +
      (built ? '<i>' + esc(String(built)) + '</i>' : '') + '</td>' +
    '<td>' + esc(how) + '</td></tr>';
}
// ── сводный планировщик прокачки ───────────────────────────────────────────
// В карточке видно, во что обойдётся один эспер. Но качают обычно не одного:
// на баннере набрали троих, у каждого свой уровень и своя цель, а фармить
// приходится общим списком. Здесь всё это складывается: сколько монет, книг
// и материалов прорыва нужно суммарно и у кого именно.
//
// Уровни берутся те же, что стоят в карточках (nte-lv-<слаг>), так что
// планировщик не требует вводить их заново и сам обновляется, когда правишь
// уровень в карточке.
function planTotal() {
  const rows = [];
  const items = {};
  let gold = 0, exp = 0, steps = 0;
  const add = list => (list || []).forEach(it => {
    if (!items[it.id]) items[it.id] = { ru: it.ru, icon: it.icon, rar: it.rar, n: 0 };
    items[it.id].n += it.n;
  });
  ((DB && DB.agents) || []).forEach(a => {
    if (!((GEAR.charUp || {})[a.slug] || []).length) return;
    const v = charLv(a.slug);
    if (!(v.to > v.from)) return;          // цель не задана или уже достигнута
    const c = charCost(a.slug, v.from, v.to);
    gold += c.gold; exp += c.exp; steps += c.steps;
    add(c.items);
    rows.push({ a: a, from: v.from, to: v.to, steps: c.steps });
  });
  return { rows: rows, gold: gold, exp: exp, steps: steps, items: Object.values(items) };
}
function planPanelHtml() {
  const t = planTotal();
  const head =
    '<div class="sh-title"><h2>Планировщик прокачки<i>по всем, у кого задана цель</i></h2>' +
      '<div style="margin-left:auto"><button class="x" id="close">✕ закрыть</button></div>' +
    '</div>';
  if (!t.rows.length) {
    return '<div class="sh-body">' + head +
      '<div class="box"><b>Пока пусто</b>Открой карточку эспера, вкладку ' +
      '«Сейчас», и в блоке «Во что обойдётся прокачка» поставь текущий уровень ' +
      'и цель. Все, у кого цель выше текущего уровня, соберутся здесь общим ' +
      'списком.</div></div>';
  }
  const mats = goldMat(t.gold).concat(expMats(t.exp, GEAR.expChar)).concat(t.items);
  return '<div class="sh-body">' + head +
    '<div class="stat">' +
      '<div class="st"><b>' + t.rows.length + '</b>' +
        plural(t.rows.length, 'эспер в плане', 'эспера в плане', 'эсперов в плане') + '</div>' +
      '<div class="st"><b>' + t.steps + '</b>' +
        plural(t.steps, 'прорыв', 'прорыва', 'прорывов') + '</div>' +
      '<div class="st"><b>' + num(t.gold) + '</b>монет</div>' +
    '</div>' +
    '<div class="cap"><b>Кого качаем</b><span></span><em>уровни из карточек</em></div>' +
    '<div class="plrows">' + t.rows.map(r =>
      '<div class="plrow" data-plan-slug="' + esc(r.a.slug) + '" title="открыть карточку">' +
        '<img src="' + portrait(r.a) + '" alt="" loading="lazy">' +
        '<b>' + esc(r.a.ru) + '</b>' +
        '<u>' + r.from + '<i>→</i>' + r.to + '</u>' +
        (r.steps ? '<em>' + r.steps + '<i>пр.</i></em>' : '') +
      '</div>').join('') + '</div>' +
    '<div class="cap"><b>Что понадобится всего</b><span></span>' +
      '<em>книги, монеты, материалы прорывов</em></div>' +
    matHtml(mats) +
    '<div class="hint">Оружие и умения сюда не входят: их стоимость считается ' +
    'в карточке отдельно, у каждого своя цель. Уровни правятся там же — здесь ' +
    'они только складываются.</div>' +
  '</div>';
}
// ── сравнение двух эсперов ─────────────────────────────────────────────────
// Вопрос «кого качать первым» встаёт, когда оба S+ и оба хороши. Ответ — в
// цифрах, которые уже собраны: место в тир-листе, роль, во что обойдётся
// прокачка, сколько мета-составов, что даёт команде. Просто раньше их надо
// было держать в двух вкладках одновременно.
let cmpA = '', cmpB = '';
function cmpVal(slug) {
  const a = agentBy(slug) || {};
  const g = (GUIDE.agents || {})[slug] || {};
  const r = g.ratings || {};
  const teams = (GUIDE.teams || []).filter(t => t.slots.some(x => x.indexOf(slug) >= 0));
  const core = teams.filter(t => (t.slots[0] || []).indexOf(slug) >= 0).length;
  const v = charLv(slug);
  const c = ((GEAR.charUp || {})[slug] || []).length ? charCost(slug, v.from, v.to) : null;
  const nb = NB[slug] || {};
  return {
    a: a, g: g,
    tier: a.tier || '—',
    el: EL_RU[a.el] || a.el || '—',
    role: nb.role ? roleRu(nb.role) : (ROLE_RU[a.role] || a.role || '—'),
    awk: r.awk || '—',
    teams: teams.length, core: core,
    arc: (g.arcs && g.arcs[0] && (ruName('arcs', g.arcs[0].n || g.arcs[0]) || g.arcs[0].n)) || '—',
    lv: v.from + ' → ' + v.to,
    gold: c ? c.gold : 0,
    brief: BRIEF[slug] || []
  };
}
function cmpRows(x, y) {
  // Строка сравнения: слева одно, справа другое, лучшее подсвечено. «Лучшее»
  // считаем только там, где это объективно — тир, число составов, цена.
  const R = [
    ['Место в тир-листе', x.tier, y.tier, TIERS.indexOf(y.tier) - TIERS.indexOf(x.tier)],
    ['Стихия', x.el, y.el, 0],
    ['Роль в команде', x.role, y.role, 0],
    ['Мета-составов', x.teams, y.teams, x.teams - y.teams],
    ['Из них главный', x.core, y.core, x.core - y.core],
    ['Лучшее оружие', x.arc, y.arc, 0],
    ['Прибавка к', x.awk, y.awk, 0],
    ['Уровень сейчас', x.lv, y.lv, 0],
    ['Прокачка обойдётся', x.gold ? num(x.gold) + ' монет' : '—',
                          y.gold ? num(y.gold) + ' монет' : '—',
                          (y.gold || 0) - (x.gold || 0)]
  ];
  return R.map(r => {
    const л = r[3] > 0 ? ' win' : '', п = r[3] < 0 ? ' win' : '';
    return '<div class="cmp-r"><u>' + esc(r[0]) + '</u>' +
      '<b class="' + л.trim() + '">' + esc(String(r[1])) + '</b>' +
      '<b class="' + п.trim() + '">' + esc(String(r[2])) + '</b></div>';
  }).join('');
}
function cmpHtml() {
  const список = (DB.agents || []).slice().sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
  if (!cmpA) cmpA = (список[0] || {}).slug || '';
  if (!cmpB) cmpB = (список[1] || {}).slug || '';
  const выбор = (кто, знач) => '<select data-cmp="' + кто + '">' +
    список.map(a => '<option value="' + esc(a.slug) + '"' +
      (a.slug === знач ? ' selected' : '') + '>' + esc(a.ru) + '</option>').join('') +
    '</select>';
  const x = cmpVal(cmpA), y = cmpVal(cmpB);
  const голова = (v, кто) =>
    '<div class="cmp-h">' +
      '<img src="' + portrait(v.a) + '" alt="" loading="lazy">' +
      выбор(кто, кто === 'a' ? cmpA : cmpB) +
    '</div>';
  const даёт = v => v.brief.length
    ? '<ul>' + v.brief.slice(0, 2).map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>'
    : '<div class="hint" style="margin:0">данных пока нет</div>';
  return '<div class="sh-body">' +
    '<div class="sh-title"><h2>Кого качать первым<i>два эспера рядом</i></h2>' +
      '<div style="margin-left:auto"><button class="x" id="close">✕ закрыть</button></div>' +
    '</div>' +
    '<div class="cmp">' + голова(x, 'a') + голова(y, 'b') + '</div>' +
    '<div class="cmp-t">' + cmpRows(x, y) + '</div>' +
    '<div class="cap"><b>Что даёт команде</b><span></span><em>из умений в игре</em></div>' +
    '<div class="cmp2"><div class="box">' + даёт(x) + '</div>' +
      '<div class="box">' + даёт(y) + '</div></div>' +
    '<div class="hint">Подсвечено то, что объективно больше: место в тир-листе, ' +
    'число составов и цена прокачки. Остальное — на твой вкус.</div>' +
  '</div>';
}
function showCmp() {
  сброситьПанель(); $('sheetIn').innerHTML = cmpHtml();
  $('sheet').classList.add('on');
  const c = $('close');
  if (c) c.onclick = () => $('sheet').classList.remove('on');
  $('sheetIn').querySelectorAll('[data-cmp]').forEach(sel => sel.onchange = () => {
    if (sel.dataset.cmp === 'a') cmpA = sel.value; else cmpB = sel.value;
    showCmp();
  });
}
function showPlan() {
  сброситьПанель(); $('sheetIn').innerHTML = planPanelHtml();
  $('sheet').classList.add('on');
  const c = $('close');
  if (c) c.onclick = () => $('sheet').classList.remove('on');
  $('sheetIn').querySelectorAll('[data-plan-slug]').forEach(el =>
    el.onclick = () => open(el.dataset.planSlug));
}
// Что приехало с прошлого прогона сборщика. Список готовит build-nte-db.ps1:
// он сравнивает свежие данные со снимком прошлого раза. После патча это первый
// вопрос — что нового, — и раньше на него приходилось отвечать глазами.
function changesHtml() {
  const c = CHANGES;
  if (!c || !(c.list || []).length) return '';
  const цвет = t => t.charAt(0) === '+' ? 'add' : (t.charAt(0) === '-' ? 'gone' : '');
  const строка = t => '<div class="chg ' + цвет(t) + '">' +
    esc(t.replace(/^[+~-]\s*/, '')) + '</div>';
  const список = c.list;
  return '<div class="cap"><b>Что приехало в прошлый прогон</b><span></span>' +
      '<em>' + список.length + ' ' +
      plural(список.length, 'изменение', 'изменения', 'изменений') + '</em></div>' +
    '<div class="box" style="padding-top:10px">' +
      '<div class="chgs">' + список.slice(0, 60).map(строка).join('') + '</div>' +
      (список.length > 60 ? '<div class="hint">…и ещё ' + (список.length - 60) + '</div>' : '') +
      '<div class="hint" style="margin-top:8px">Сравнение с прошлым прогоном ' +
      'сборщика' + (c.built ? ' · собрано ' + esc(c.built) : '') + '.</div>' +
    '</div>';
}
// Меню инструментов: открывается по кнопке, закрывается по выбору, по клику
// мимо и по Esc.
// Список инструментов держим в одном месте: он нужен и выпадающему меню в
// шапке, и колонке внутри открытой панели.
const ИНСТРУМЕНТЫ = [
  { id: 'cloud', имя: 'облако',      под: 'синхронизация между устройствами' },
  { id: 'plan',  имя: 'план',        под: 'материалы на всех, кого качаешь' },
  { id: 'cmp',   имя: 'сравнить',    под: 'кого качать первым' },
  { id: 'ready', имя: 'готовность',  под: 'все эсперы против целей гайда' },
  { id: 'pulls', имя: 'крутки',      под: 'сколько до гаранта и хватит ли' },
  { id: 'bak',   имя: 'мои данные',  под: 'сохранить файлом и восстановить' },
  { id: 'stat',  имя: 'скрины',      под: 'характеристики из снимков экрана' },
];

function открытьИнструмент(t) {
  if (t === 'cloud') showSync();
  else if (t === 'plan') showPlan();
  else if (t === 'cmp') showCmp();
  else if (t === 'ready') showReady();
  else if (t === 'pulls') showPulls();
  else if (t === 'bak') showBak();
  else if (t === 'stat') showOcrBulk();
  else return;
  колонкаИнструментов(t);
}

// Колонку добавляем уже поверх готового содержимого. Узлы не переписываем, а
// переносим: обработчики, навешанные внутри show*(), живут на самих узлах и
// при переносе сохраняются — в отличие от подмены innerHTML.
function сброситьПанель() {
  const in_ = $('sheetIn');
  if (in_) in_.classList.remove('tm');
}

function колонкаИнструментов(активный) {
  const in_ = $('sheetIn');
  if (!in_) return;
  const тело = document.createElement('div');
  тело.className = 'tmbody';
  while (in_.firstChild) тело.appendChild(in_.firstChild);

  const nav = document.createElement('nav');
  nav.className = 'tmnav';
  ИНСТРУМЕНТЫ.forEach(и => {
    const b = document.createElement('button');
    b.className = 'tmi' + (и.id === активный ? ' on' : '');
    b.innerHTML = esc(и.имя) + '<i>' + esc(и.под) + '</i>';
    b.onclick = () => { if (и.id !== активный) открытьИнструмент(и.id); };
    nav.appendChild(b);
  });

  in_.appendChild(nav);
  in_.appendChild(тело);
  in_.classList.add('tm');
}

function bindTools() {
  const box = $('tools'), b = $('toolsBtn');
  if (!box || !b) return;
  const закрыть = () => box.classList.remove('open');
  b.onclick = e => { e.stopPropagation(); box.classList.toggle('open'); };
  box.querySelectorAll('[data-tool]').forEach(el => el.onclick = () => {
    закрыть();
    открытьИнструмент(el.dataset.tool);
  });
  document.addEventListener('click', e => { if (!box.contains(e.target)) закрыть(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') закрыть(); });
}
// Битые картинки убираем одним обработчиком на весь документ. Раньше у каждой
// такой картинки стоял свой onerror прямо в разметке — с ним нельзя запретить
// инлайн-скрипты в политике безопасности, а это главная защита от подстановки
// чужого кода. Событие error не всплывает, поэтому слушаем на перехвате.
document.addEventListener('error', e => {
  const t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.nf) return;
  if (t.dataset.nf === 'drop') t.remove();
  else if (t.parentNode) { t.parentNode.classList.add(t.dataset.nf); t.remove(); }
}, true);

// ── офлайн и установка ─────────────────────────────────────────────────────
// Service worker один на весь домен и лежит в корне. Регистрируем его именно
// оттуда: путь 'sw.js' браузер искал бы в /nte/, где его нет. Со scope '/'
// он обслуживает и трекер, и справочник.
//
// Что это даёт: страница и её данные открываются без сети, картинки оседают в
// отдельном кэше по мере просмотра, а сайт можно поставить как приложение —
// со своей иконкой и окном без адресной строки.
let ставить = null;          // отложенное приглашение браузера
function swStart() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then(reg => {
      const проверить = () => { try { reg.update(); } catch (e) {} };
      проверить();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) проверить(); });
      setInterval(проверить, 30 * 60 * 1000);
    }).catch(() => {});
  // Новая версия страницы приехала — перезагружаемся один раз, иначе в окне
  // останется старый код с новыми данными.
  let было = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (было) return;
    было = true;
    location.reload();
  });
}
// Установку приложением теперь ведёт общий install.js: он одинаково работает
// на всех разделах и сам прячется, когда сайт уже открыт приложением.
function instBind() {
  // Кнопка в меню убрана: установка живёт в общем install.js.
  const b = $('instBtn');
  if (b && b.parentElement) b.parentElement.removeChild(b);
}

// ── напоминания о сроках ───────────────────────────────────────────────────
// Push-часть уже построена для трекера ZZZ: воркер принимает подписку, держит
// задания и рассылает их по расписанию. Здесь только клиент — заводить второй
// механизм незачем, и ключ подписки берём тот же, что у задач: домен один,
// localStorage общий, значит и подписка на телефоне одна на весь сайт.
//
// Напоминаем о двух вещах: о закрытии текущего баннера и о событиях, которые
// вот-вот кончатся и при этом что-то дают. Постоянные активности и события
// без наград не трогаем — иначе это двадцать уведомлений вместо трёх.
const PUSH_API  = 'https://alextask-push.12dogswog76.workers.dev';
const VAPID_PUB = 'BNrmwMyHC1OFDhFuQZtwHAzbjdeqCzgs4kyy-gGRGpgHPTAMjvPRyGRyKgiryVJAykh2q10MwHMzSadX-2Rx150';
const REM_BAN_DAYS = 3;      // за сколько дней предупреждать о баннере
const REM_EV_DAYS  = 2;      // за сколько — о событии
const LS_TODO_KEY  = 'alexey_todo_v1_pushKey';   // общий ключ подписки на весь сайт
let remOn = localStorage.getItem('nte-rem') === '1';
let remSent = {};
try { remSent = JSON.parse(localStorage.getItem('nte-rem-sent') || '{}') || {}; } catch (e) {}
function remSentSave() {
  try { localStorage.setItem('nte-rem-sent', JSON.stringify(remSent)); } catch (e) {}
}
function u8FromB64(s) {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
// Ключ отделяет твои уведомления от чужих: кто его знает, тот может слать тебе
// push. Поэтому системный генератор, а не Math.random.
function remKey(make) {
  let k = localStorage.getItem(LS_TODO_KEY) || '';
  if (!k && make) {
    const b = new Uint8Array(11);
    crypto.getRandomValues(b);
    k = 'pk' + Array.from(b).map(x => x.toString(36)).join('').slice(0, 14);
    localStorage.setItem(LS_TODO_KEY, k);
  }
  return k;
}
function postPush(tail, body) {
  return fetch(PUSH_API + tail, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json().catch(() => ({})));
}
// Что напоминать. Баннеры — по дате закрытия, одной записью на дату: их обычно
// два-три с общим концом фазы. События — только те, что дают что-то ценное.
function remPlan() {
  const now = Date.now(), out = [];
  const по = {};
  (GUIDE.banners || []).forEach(b => {
    if (!b.to || !/current|сейчас/i.test(b.key + ' ' + b.group)) return;
    const кто = b.slug ? (agentBy(b.slug) || {}).ru : banName(b);
    (по[b.to] || (по[b.to] = [])).push(кто || b.name);
  });
  Object.keys(по).forEach(to => {
    const конец = Date.parse(to + 'T23:59:59Z');
    if (!isFinite(конец) || конец <= now) return;
    out.push({
      id: 'nteban:' + to,
      end: конец,
      at: конец - REM_BAN_DAYS * 86400000,
      title: 'NTE: баннер закрывается ' + ruDate(to),
      body: по[to].slice(0, 4).join(', ') + ' — осталось ' + REM_BAN_DAYS + ' ' +
            plural(REM_BAN_DAYS, 'день', 'дня', 'дней'),
      что: по[to].slice(0, 4).join(', ')
    });
  });
  // События тоже группируем по дате: в патче их закрывается по пять штук в
  // один день, и пять отдельных уведомлений подряд — это не напоминание, а
  // спам. Одно на дату со списком названий.
  const поСоб = {};
  ((evLive && evLive.list) || []).forEach(e => {
    if (e.perm || !e.to || !(e.live || e.soon)) return;
    if (!/annulith|fons|dice|аннулит|фонс|кубик/i.test(e.rew || '')) return;  // без награды не дёргаем
    (поСоб[e.to] || (поСоб[e.to] = [])).push(evName(e));
  });
  Object.keys(поСоб).forEach(to => {
    const конец = Date.parse(to + 'T23:59:59Z');
    if (!isFinite(конец) || конец <= now) return;
    const имена = поСоб[to];
    const список = имена.slice(0, 3).join(', ') +
      (имена.length > 3 ? ' и ещё ' + (имена.length - 3) : '');
    out.push({
      id: 'nteev:' + to,
      end: конец,
      at: конец - REM_EV_DAYS * 86400000,
      title: 'NTE: события закрываются ' + ruDate(to),
      body: список + ' — награды ещё висят',
      что: список
    });
  });
  return out.sort((a, b) => a.end - b.end);
}
// Ставим задания воркеру. Перепланируем только то, что сдвинулось: ключ
// сохранённого задания — его время, поэтому лишних запросов не будет.
function remSync(force) {
  if (!remOn) return;
  const key = remKey(false);
  if (!key) return;
  const now = Date.now(), plan = remPlan(), живые = {};
  plan.forEach(r => {
    // Срок предупреждения уже прошёл, а событие ещё идёт — напомним разово
    // через пару минут: лучше так, чем промолчать.
    const at = r.at > now + 60000 ? r.at : now + 120000;
    живые[r.id] = 1;
    if (remSent[r.id] === at && !force) return;
    postPush('/schedule', { pushKey: key, taskId: r.id, at: at,
      title: r.title, body: r.body, url: 'https://alextask.ru/nte/' })
      .then(() => { remSent[r.id] = at; remSentSave(); })
      .catch(() => {});
  });
  Object.keys(remSent).forEach(id => {
    if (живые[id] || id.indexOf('nte') !== 0) return;
    postPush('/cancel', { pushKey: key, taskId: id }).catch(() => {});
    delete remSent[id];
  });
  remSentSave();
}
function remOff() {
  const key = remKey(false);
  Object.keys(remSent).forEach(id => {
    if (key) postPush('/cancel', { pushKey: key, taskId: id }).catch(() => {});
    delete remSent[id];
  });
  remOn = false;
  localStorage.setItem('nte-rem', '');
  remSentSave();
}
async function remToggle(say) {
  if (remOn) { remOff(); say('напоминания выключены, задания сняты'); draw(); return; }
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      say('этот браузер не умеет push', 1); return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { say('уведомления запрещены в настройках браузера', 1); return; }
    // Сам обработчик push живёт в /sw.js — он общий на весь сайт и уже
    // выкладывается вместе с трекером. Регистрируем от корня, иначе браузер
    // будет искать его в /nte/ и не найдёт.
    let reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe(
      { userVisibleOnly: true, applicationServerKey: u8FromB64(VAPID_PUB) });
    const key = remKey(true);
    const r = await postPush('/subscribe', { subscription: sub.toJSON(), pushKey: key });
    if (!r || !r.ok) { say('воркер не принял подписку' + (r && r.error ? ': ' + r.error : ''), 1); return; }
    remOn = true;
    localStorage.setItem('nte-rem', '1');
    remSent = {};
    remSync(true);
    say('напоминания включены');
    draw();
  } catch (e) { say('не вышло: ' + ((e && e.message) || e), 1); }
}
// Кнопка и подпись живут на вкладке «События»: там же, где сами сроки.
function bindRem() {
  const b = $('remBtn');
  if (!b) return;
  const строка = () => {
    let el = $('remSay');
    if (!el) {
      el = document.createElement('div');
      el.className = 'hint';
      el.id = 'remSay';
      $('body').insertAdjacentElement('afterbegin', el);
    }
    el.textContent = remText();
    return el;
  };
  строка();
  const say = (t, bad) => {
    const el = строка();
    el.textContent = t;
    el.style.color = bad ? '#fbbf24' : 'var(--acc)';
  };
  b.onclick = () => remToggle(say);
  // план мог сдвинуться: приехали свежие даты баннеров или список событий
  remSync(false);
}
// Строка под кнопкой: о чём именно предупредим и когда
function remText() {
  if (!remOn) return 'Push за ' + REM_BAN_DAYS + ' дня до закрытия баннера и за ' +
    REM_EV_DAYS + ' — до конца события с наградой. Приходит и при закрытом сайте.';
  const plan = remPlan();
  if (!plan.length) return 'Пока напоминать не о чем: сроки далеко или уже прошли.';
  return plan.slice(0, 4).map(r => ruDate(new Date(r.at).toISOString().slice(0, 10)) +
    ' → ' + r.что).join(' · ');
}

// ── бэкап своих данных ─────────────────────────────────────────────────────
// Всё, что ты вписал — характеристики, уровни, отметки кодов и найденные точки
// карты, — живёт в localStorage этого браузера. Облако его возит между
// устройствами, но не спасает от двух вещей: чистки данных сайта (частая
// операция «почистить кэш» стирает и это) и от самого облака, если в нём
// что-то перетёрлось. Поэтому файл: один клик — и всё лежит у тебя.
const BAK_MARK = 'alextask-nte-backup';
function bakCollect() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.indexOf('nte-') !== 0) continue;
    // ключ облака не выгружаем: это адрес хранилища, то есть ключ доступа.
    // Файл может уйти куда угодно — в переписку, в облачный диск, — и тащить
    // в нём доступ к своим данным незачем.
    if (k === 'nte-sync') continue;
    try { out[k] = JSON.parse(localStorage.getItem(k)); }
    catch (e) { out[k] = localStorage.getItem(k); }
  }
  return out;
}
function bakStats(data) {
  const k = Object.keys(data || {});
  return {
    эсперов: k.filter(x => x.indexOf('nte-my-') === 0).length,
    уровней: k.filter(x => x.indexOf('nte-lv-') === 0).length,
    кодов: Object.keys(data['nte-codes-used'] || {}).length,
    точек: Object.keys(data['nte-map-found'] || {}).length,
    всего: k.length
  };
}
function bakSave(say) {
  const data = bakCollect();
  const файл = { mark: BAK_MARK, ver: APP_VER, at: new Date().toISOString(), data: data };
  const blob = new Blob([JSON.stringify(файл, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  const p2 = n => (n < 10 ? '0' : '') + n;
  a.download = 'nte-мои-данные-' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' +
    p2(d.getDate()) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  const st = bakStats(data);
  say('сохранено: ' + st.эсперов + ' с характеристиками, ' + st.точек + ' точек карты, ' +
      st.кодов + ' отмеченных кодов');
}
// Восстановление дописывает, а не стирает: чужой файл не должен выносить то,
// что уже есть. Отметки кодов и точек складываются, остальное перезаписывается
// из файла — там значения, а не наборы.
function bakLoad(file, say, режим) {
  const rd = new FileReader();
  rd.onload = () => {
    let j = null;
    try { j = JSON.parse(rd.result); } catch (e) {}
    if (!j || j.mark !== BAK_MARK || !j.data) {
      say('это не файл с данными NTE — нужен тот, что скачан кнопкой выше', 1);
      return;
    }
    const data = j.data;
    let взято = 0;
    Object.keys(data).forEach(k => {
      if (k.indexOf('nte-') !== 0 || k === 'nte-sync') return;
      let v = data[k];
      if (режим === 'merge' && SYNC_MERGE.indexOf(k) >= 0 && typeof v === 'object') {
        let было = {};
        try { было = JSON.parse(localStorage.getItem(k)) || {}; } catch (e) {}
        v = Object.assign({}, v, было);
      }
      try { localStorage.setItem(k, JSON.stringify(v)); взято++; } catch (e) {}
    });
    const st = bakStats(data);
    say('принято записей: ' + взято + ' · эсперов с характеристиками ' + st.эсперов +
        ', точек карты ' + st.точек + '. Обнови страницу, чтобы увидеть.');
  };
  rd.onerror = () => say('файл не прочитался', 1);
  rd.readAsText(file);
}
function bakHtml() {
  const st = bakStats(bakCollect());
  return '<div class="sh-body">' +
    '<div class="sh-title"><h2>Мои данные<i>сохранить файлом и восстановить</i></h2>' +
      '<div style="margin-left:auto"><button class="x" id="close">✕ закрыть</button></div>' +
    '</div>' +
    '<div class="stat">' +
      '<div class="st"><b>' + st.эсперов + '</b>' +
        plural(st.эсперов, 'эспер с характеристиками', 'эспера с характеристиками',
               'эсперов с характеристиками') + '</div>' +
      '<div class="st"><b>' + st.точек + '</b>отмечено точек карты</div>' +
      '<div class="st"><b>' + st.кодов + '</b>отмечено кодов</div>' +
      '<div class="st"><b>' + st.уровней + '</b>уровней в планировщике</div>' +
    '</div>' +
    '<div class="mapbar" style="margin-top:10px">' +
      '<button class="fb" id="bakSave">скачать файлом</button>' +
      '<button class="fb" id="bakPick">восстановить из файла</button>' +
      '<input type="file" id="bakFile" accept="application/json,.json" style="display:none">' +
    '</div>' +
    '<div class="hint" id="bakSay" style="min-height:16px"></div>' +
    '<div class="hint">В файл идёт всё, что ты вписал сам: характеристики, уровни ' +
    'прокачки, отметки кодов и точек карты, счётчик круток. <b>Адрес облачного ' +
    'хранилища не идёт</b> — это ключ доступа к твоим данным, ему в пересылаемом ' +
    'файле не место.<br>При восстановлении отметки кодов и точек складываются с тем, ' +
    'что уже есть, остальное перезаписывается из файла. Чужой файл ничего не сотрёт ' +
    'молча: если это не бэкап NTE, страница так и скажет.</div>' +
  '</div>';
}
function showBak() {
  сброситьПанель(); $('sheetIn').innerHTML = bakHtml();
  $('sheet').classList.add('on');
  const c = $('close');
  if (c) c.onclick = () => $('sheet').classList.remove('on');
  const say = (t, bad) => {
    const el = $('bakSay');
    if (el) { el.textContent = t; el.style.color = bad ? '#fbbf24' : 'var(--acc)'; }
  };
  if ($('bakSave')) $('bakSave').onclick = () => bakSave(say);
  if ($('bakPick')) $('bakPick').onclick = () => $('bakFile').click();
  if ($('bakFile')) $('bakFile').onchange = e => {
    const f = e.target.files[0];
    if (f) bakLoad(f, say, 'merge');
    e.target.value = '';
  };
}

// ── крутки и гарант ────────────────────────────────────────────────────────
// Числа не выдуманные и не с гайдов: они лежат в локализации самой игры
// (Localization/ru/game.json, раздел правил лотереи), и это тот же текст,
// который открывается в игре по кнопке «вероятности».
//
// Устройство гачи в NTE отличается от привычного: бросок двигает фигуру по
// доске, и «доска» бывает двух состояний. Пока она базовая, шанс достать
// текущего эксклюзивного эспера — 0,99% за бросок. Если за 70 бросков подряд
// он не выпал, доска становится модифицированной, и шанс поднимается до
// 19,59%. На девяностом броске эспер выдаётся без всякого броска. Среднее по
// всей этой конструкции — 1,87% за бросок, ровно как написано в игре.
//
// Важное отличие от ZZZ: здесь нет 50/50. Гарантируется не «какой-нибудь
// S-ранг», а именно текущий баннерный эспер, поэтому считать нечего —
// девяносто бросков закрывают вопрос.
const PULL = {
  base: 0.0099,     // шанс на базовой доске
  up:   0.1959,     // шанс после 70 бросков без эспера
  soft: 70,         // с какого броска доска становится модифицированной
  hard: 90,         // на каком броске эспера выдают без розыгрыша
  // Оружие («дуги») считается иначе: розыгрыш — это выпуск из десяти дуг.
  arcS: 0.03,       // базовый шанс дуги S-класса
  arcLim: 0.0168,   // из них на текущую ограниченную
  arcAny: 6,        // выпусков до гарантированной дуги S-класса
  arcHard: 8        // выпусков до гарантированной текущей ограниченной
};
function pullsCfg() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem('nte-pulls')) || {}; } catch (e) {}
  return Object.assign({ done: 0, dice: 0, ann: 0, rate: 160, plan: 0, warc: 0 }, v);
}
function pullsSave(v) {
  try { localStorage.setItem('nte-pulls', JSON.stringify(v)); } catch (e) {}
}
// Шанс достать эспера за n бросков, если уже сделано done. Считаем по шагам:
// у каждого броска свой шанс, и «не выпало ни разу» перемножается.
function pullChance(done, n) {
  let alive = 1;
  for (let i = done + 1; i <= done + n; i++) {
    const p = i >= PULL.hard ? 1 : (i > PULL.soft ? PULL.up : PULL.base);
    alive *= (1 - p);
    if (alive <= 0) return 1;
  }
  return 1 - alive;
}
function pullsHtml() {
  const c = pullsCfg();
  const done = Math.max(0, Math.min(PULL.hard - 1, +c.done || 0));
  const изАнн = Math.floor(Math.max(0, +c.ann || 0) / Math.max(1, +c.rate || 160));
  const есть = Math.max(0, +c.dice || 0) + изАнн + Math.max(0, +c.plan || 0);
  const доГаранта = PULL.hard - done;
  const доРазгона = Math.max(0, PULL.soft - done);
  const шанс = pullChance(done, есть);
  const хватает = есть >= доГаранта;
  // Ближайший срок: до конца текущего баннера эспера
  const live = (GUIDE.banners || []).filter(b =>
    b.slug && b.to && /current|сейчас/i.test(b.key + ' ' + b.group))[0];
  const дней = live ? Math.ceil((Date.parse(live.to + 'T23:59:59Z') - Date.now()) / 86400000) : null;
  const поле = (k, n, подпись) => '<div><label>' + esc(n) + '</label>' +
    '<input type="number" min="0" step="1" data-pull="' + k + '" value="' + (+c[k] || 0) + '">' +
    (подпись ? '<div class="hint" style="margin:3px 0 0">' + подпись + '</div>' : '') + '</div>';
  // Шкалу показываем целиком: строки выше гаранта тоже полезны — по ним
  // видно, на каком броске шанс становится стопроцентным.
  const шкала = [10, 20, 30, 50, 70, 90].map(n => {
      const p = pullChance(done, n);
      return '<tr' + (n === есть ? ' class="top"' : '') + '><td>' + n + '</td>' +
        '<td class="num">' + (p * 100).toFixed(1) + '%</td>' +
        '<td><div class="bar"><i style="width:' + Math.round(p * 100) + '%"></i></div></td></tr>';
    }).join('');
  return '<div class="sh-body">' +
    '<div class="sh-title"><h2>Крутки<i>сколько до гаранта и хватит ли</i></h2>' +
      '<div style="margin-left:auto"><button class="x" id="close">✕ закрыть</button></div>' +
    '</div>' +
    '<div class="stat">' +
      '<div class="st"><b>' + done + '</b>бросков с прошлого эспера</div>' +
      '<div class="st"><b>' + доГаранта + '</b>до гаранта</div>' +
      '<div class="st' + (хватает ? ' ok' : '') + '"><b>' + есть + '</b>бросков на руках</div>' +
      '<div class="st"><b>' + Math.round(шанс * 100) + '%</b>шанс достать эспера</div>' +
    '</div>' +
    '<div class="verdict">' +
      (хватает
        ? 'Гарант закрыт: ' + есть + ' ' + plural(есть, 'бросок', 'броска', 'бросков') +
          ' при ' + доГаранта + ' до предела — эспер твой при любом раскладе.'
        : 'Шанс достать эспера этими бросками — <b>' + Math.round(шанс * 100) + '%</b>. ' +
          'До гаранта не хватает <b>' + (доГаранта - есть) + '</b> ' +
          plural(доГаранта - есть, 'броска', 'бросков', 'бросков') + ' — это ' +
          num((доГаранта - есть) * Math.max(1, +c.rate || 160)) + ' аннулита.') +
      (дней != null && дней >= 0
        ? ' Текущий баннер закрывается через ' + дней + ' ' +
          plural(дней, 'день', 'дня', 'дней') + '.' : '') +
    '</div>' +
    '<div class="inp" style="margin-top:10px">' +
      поле('done', 'бросков с прошлого эспера', 'счётчик в игре, 0–89') +
      поле('dice', 'кубиков на руках', '') +
      поле('ann', 'аннулита на руках', '') +
      поле('rate', 'аннулита за бросок', 'проверь в игре, обычно 160') +
      поле('plan', 'ещё накопится', 'события, коды, пропуск — прикинь сам') +
    '</div>' +
    (доРазгона
      ? '<div class="hint">До <b>разгона</b> ещё ' + доРазгона + ' ' +
        plural(доРазгона, 'бросок', 'броска', 'бросков') + ': пока доска базовая, ' +
        'шанс 0,99% за бросок. После 70-го он поднимается до 19,59% — там эспер ' +
        'выпадает быстро.</div>'
      : '<div class="hint" style="color:var(--acc)">Доска уже разогнана: шанс 19,59% ' +
        'за бросок вместо 0,99%.</div>') +
    '<div class="cap"><b>Шанс по числу бросков</b><span></span><em>от текущего счётчика</em></div>' +
    '<table class="tbl"><tr><th>бросков</th><th>шанс</th><th></th></tr>' + шкала + '</table>' +
    '<div class="cap"><b>Оружие</b><span></span><em>другие правила</em></div>' +
    '<div class="box">' +
      '<div class="inp"><div><label>выпусков с прошлой ограниченной дуги</label>' +
        '<input type="number" min="0" step="1" data-pull="warc" value="' + (+c.warc || 0) + '"></div></div>' +
      '<div class="hint">Розыгрыш на оружейном баннере — это выпуск сразу из десяти дуг. ' +
      'Шанс дуги S-класса — 3% за штуку, из них 1,68% приходится на текущую ограниченную. ' +
      'Любая дуга S-класса гарантирована за <b>' + PULL.arcAny + '</b> ' +
      plural(PULL.arcAny, 'выпуск', 'выпуска', 'выпусков') + ', текущая ограниченная — за <b>' +
      PULL.arcHard + '</b>. Счётчик не сбрасывается между баннерами: осталось <b>' +
      Math.max(0, PULL.arcHard - Math.max(0, +c.warc || 0)) + '</b> ' +
      plural(Math.max(0, PULL.arcHard - Math.max(0, +c.warc || 0)), 'выпуск', 'выпуска', 'выпусков') +
      '.</div>' +
    '</div>' +
    '<div class="hint">Все числа — из правил лотереи в самой игре (те же, что в игре ' +
    'по кнопке «вероятности»), а не из гайдов. <b>50/50 тут нет</b>: гарантируется не ' +
    '«какой-нибудь S-ранг», а именно баннерный эспер, поэтому девяносто бросков ' +
    'закрывают вопрос полностью. Что вписал — лежит в браузере и едет через облако.</div>' +
  '</div>';
}
function showPulls() {
  сброситьПанель(); $('sheetIn').innerHTML = pullsHtml();
  $('sheet').classList.add('on');
  const c = $('close');
  if (c) c.onclick = () => $('sheet').classList.remove('on');
  $('sheetIn').querySelectorAll('input[data-pull]').forEach(inp => inp.onchange = () => {
    const cfg = pullsCfg();
    const v = parseInt(inp.value, 10);
    cfg[inp.dataset.pull] = isFinite(v) && v > 0 ? v : 0;
    pullsSave(cfg);
    showPulls();
  });
}

// ── моя готовность ─────────────────────────────────────────────────────────
// Пока характеристики вписывались руками, смотреть их можно было только по
// одному — в карточке. Теперь они заливаются пачкой, и появляется вопрос
// покрупнее: кто из двадцати четырёх дотянут до целей гайда, а кто просел и
// на сколько. Одна таблица отвечает на него целиком.
let readyAll = false;      // показывать ли тех, по кому чисел ещё нет
function readyOne(slug) {
  const G = ((GUIDE.agents || {})[slug] || {}).goals || {};
  const my = myStats(slug);
  const rows = [];
  MY_KEYS.forEach(k => {
    const цель = G[k[2]] ? G[k[2]][0] : null;
    if (цель == null || !цель) return;
    const есть = my[k[0]];
    rows.push({ k: k[0], n: k[1].replace(', %', ''), pct: !!k[3], цель: цель, есть: есть,
                доля: есть == null ? null : Math.min(1, есть / цель) });
  });
  const счит = rows.filter(r => r.доля != null);
  return { slug: slug, rows: rows, знаем: счит.length, всего: rows.length,
           // готовность — среднее по тем целям, для которых число известно;
           // недостающие не портят картину, но и не засчитываются: сколько
           // заполнено, видно рядом отдельной подписью
           готов: счит.length ? счит.reduce((n, r) => n + r.доля, 0) / счит.length : null };
}
function readyHtml() {
  const список = (DB.agents || []).map(a => {
    const r = readyOne(a.slug);
    r.a = a;
    return r;
  }).filter(r => r.всего);                 // без целей гайда сравнивать не с чем
  const свои = список.filter(r => r.готов != null);
  const пусто = список.filter(r => r.готов == null);
  // Сверху то, что дальше всего от цели: именно туда идут следующие картриджи.
  свои.sort((x, y) => x.готов - y.готов);
  const цвет = д => д >= 1 ? 'var(--ok)' : (д >= 0.9 ? 'var(--gold)' : '#f87171');
  const карточка = r => {
    const отстают = r.rows.filter(x => x.доля != null && x.доля < 1)
      .sort((x, y) => x.доля - y.доля).slice(0, 4);
    const нет = r.rows.filter(x => x.доля == null).length;
    return '<div class="rdy" data-slug="' + esc(r.slug) + '">' +
      '<img src="' + portrait(r.a) + '" alt="" loading="lazy">' +
      '<div class="rdy-b">' +
        '<div class="rdy-t"><b>' + esc(r.a.ru) + '</b>' +
          (r.a.tier ? '<u style="' + tierStyle(r.a.tier) + '">' + esc(r.a.tier) + '</u>' : '') +
          '<i style="color:' + цвет(r.готов) + '">' + Math.round(r.готов * 100) + '%</i></div>' +
        '<div class="rdy-p"><i style="width:' + Math.round(r.готов * 100) + '%;' +
          'background:' + цвет(r.готов) + '"></i></div>' +
        (отстают.length
          ? '<div class="rdy-s">' + отстают.map(x =>
              '<span>' + statIco(x.k) + esc(x.n) + ' <b>' +
              (Math.round((x.цель - x.есть) * 10) / 10) + (x.pct ? '%' : '') + '</b></span>').join('') +
            '</div>'
          : '<div class="rdy-s ok"><span>все цели закрыты</span></div>') +
        '<div class="hint" style="margin:4px 0 0">знаем ' + r.знаем + ' из ' + r.всего +
          ' целей' + (нет ? ' · нет чисел: ' + нет : '') + '</div>' +
      '</div>' +
    '</div>';
  };
  const средне = свои.length
    ? Math.round(свои.reduce((n, r) => n + r.готов, 0) / свои.length * 100) : 0;
  return '<div class="sh-body">' +
    '<div class="sh-title"><h2>Моя готовность<i>твои числа против целей гайда</i></h2>' +
      '<div style="margin-left:auto"><button class="x" id="close">✕ закрыть</button></div>' +
    '</div>' +
    (свои.length
      ? '<div class="stat">' +
          '<div class="st"><b>' + свои.length + '</b>' +
            plural(свои.length, 'эспер заполнен', 'эспера заполнено', 'эсперов заполнено') + '</div>' +
          (() => { const n = свои.filter(r => r.готов >= 1).length;
            return '<div class="st' + (n ? ' ok' : '') + '"><b>' + n + '</b>' +
              plural(n, 'дотянут до целей', 'дотянуты до целей', 'дотянуто до целей') + '</div>'; })() +
          '<div class="st"><b>' + средне + '%</b>средняя готовность</div>' +
        '</div>' +
        '<div class="rdyg">' + свои.map(карточка).join('') + '</div>'
      : '<div class="box"><div class="hint" style="margin:0">Чисел пока нет ни по кому. ' +
        'Открой «инструменты → скрины» и кинь туда снимки экрана характеристик — ' +
        'дальше эта страница заполнится сама.</div></div>') +
    (пусто.length
      ? '<div class="cap"><b>Без чисел</b><span></span><em>' + пусто.length + '</em></div>' +
        (readyAll
          ? '<div class="rdyg">' + пусто.map(r =>
              '<div class="rdy pale" data-slug="' + esc(r.slug) + '">' +
                '<img src="' + portrait(r.a) + '" alt="" loading="lazy">' +
                '<div class="rdy-b"><div class="rdy-t"><b>' + esc(r.a.ru) + '</b></div>' +
                '<div class="hint" style="margin:4px 0 0">характеристики не вписаны</div></div>' +
              '</div>').join('') + '</div>'
          : '') +
        '<div class="mapbar" style="margin-top:8px">' +
          '<button class="fb" id="rdyAll">' + (readyAll ? 'спрятать' : 'показать список') + '</button>' +
        '</div>'
      : '') +
    '<div class="hint">Готовность — среднее по тем целям гайда, для которых число ' +
    'известно. Цель «закрыта», когда значение дотянуло до нижней границы из ' +
    'карточки эспера. Проценты перевыполнения не учитываются: 200% крит. урона ' +
    'при цели 180 считаются как 100%, иначе один стат прятал бы провал остальных.</div>' +
  '</div>';
}
function showReady() {
  сброситьПанель(); $('sheetIn').innerHTML = readyHtml();
  $('sheet').classList.add('on');
  const c = $('close');
  if (c) c.onclick = () => $('sheet').classList.remove('on');
  const b = $('rdyAll');
  if (b) b.onclick = () => { readyAll = !readyAll; showReady(); };
  $('sheetIn').querySelectorAll('.rdy[data-slug]').forEach(el =>
    el.onclick = () => open(el.dataset.slug));
}
function showFresh() {
  // Здесь нужна дата нашего запроса, а не та, что написана на чужой странице:
  // раньше после «обновить сейчас» в окне оставалось «4 дня назад» — это была
  // дата правки источника, и выглядело как будто кнопка не работает.
  const codes = (codesLive && codesLive.t)
    ? new Date(codesLive.t).toISOString().slice(0, 16).replace('T', ' ')
    : ((GUIDE && GUIDE.codes && GUIDE.codes.updated) || '');
  сброситьПанель(); $('sheetIn').innerHTML =
    '<div class="sh-body">' +
      '<div class="sh-title"><h2>Откуда данные<i>и когда собирались</i></h2>' +
        '<div style="margin-left:auto"><button class="x" id="close">✕ закрыть</button></div>' +
      '</div>' +
      '<div class="box">' +
      '<div class="mtab"><table><thead><tr><th>раздел</th><th>собрано</th><th>как обновляется</th></tr></thead><tbody>' +
      freshRow('Эсперы, картинки', DB && DB.built, 'build-nte-db.ps1', 'имена и арты из игры') +
      freshRow('Оружие, картриджи, модули', GEAR && GEAR.built, 'build-nte-db.ps1', 'таблицы игры') +
      freshRow('Тир-лист, сборки, команды', GUIDE && GUIDE.built, 'nte-pryd.js в браузере', 'с prydwen.gg') +
      freshRow('Баннеры', GUIDE && GUIDE.built, 'nte-pryd.js в браузере', 'с prydwen.gg') +
      freshRow('Коды', codes,
        codesLive ? (codesLive.cached ? 'воркер, из кэша' : 'воркер, только что') : 'воркер не ответил',
        'список кодов' + (codesLive && codesLive.updated ? ' · на источнике: ' + codesLive.updated : '')) +
      '</tbody></table></div>' +
      '<div class="hint">Автоматически обновляются только коды. Всё остальное — ровно то, ' +
      'что собрано в последний прогон: после патча запусти <b>обновить-nte.ps1</b> ' +
      'в папке сайта — он прогонит все сборщики и выложит результат.</div>' +
    '</div>' +
    changesHtml() +
    '</div>';
  $('sheet').classList.add('on');
  $('sheet').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if ($('close')) $('close').onclick = close;
}
// ── синхронизация отметок между устройствами ───────────────────────────────
// Всё, что ты отмечаешь на сайте — свои характеристики, уровни для планировщика,
// введённые коды, найденные точки на карте — лежит в браузере. На телефоне это
// уже другой браузер и другие отметки. Поэтому кладём всё в маленькое хранилище
// npoint и синхронизируем по коду подключения.
//
// Адрес хранилища — он же ключ доступа: кто знает адрес, тот может и читать, и
// перезаписывать. Поэтому код подключения нигде не показывается сам собой, его
// нужно нажать «показать», и делиться им нельзя.
const SYNC_PREFIX = 'nte-';
// эти ключи объединяем, а не заменяем: отметки с двух устройств должны сложиться
const SYNC_MERGE = ['nte-map-found', 'nte-codes-used'];
// служебное, чужому устройству не нужно
const SYNC_SKIP = ['nte-sync', 'nte-mech-open', 'nte-map-cal'];
function syncCfg() {
  try { return JSON.parse(localStorage.getItem('nte-sync')) || {}; }
  catch (e) { return {}; }
}
function syncCfgSave(v) {
  try { localStorage.setItem('nte-sync', JSON.stringify(v)); } catch (e) {}
}
function syncCollect() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.indexOf(SYNC_PREFIX) !== 0 || SYNC_SKIP.indexOf(k) >= 0) continue;
    try { out[k] = JSON.parse(localStorage.getItem(k)); }
    catch (e) { out[k] = localStorage.getItem(k); }
  }
  return out;
}
function syncApply(data, at) {
  const mine = syncCollect();
  Object.keys(data || {}).forEach(k => {
    let v = data[k];
    if (SYNC_MERGE.indexOf(k) >= 0 && mine[k] && typeof mine[k] === 'object' && typeof v === 'object') {
      v = Object.assign({}, v, mine[k]);   // отметки складываем
    } else if (at < (syncCfg().at || 0)) {
      return;                              // наше свежее — облачное не берём
    }
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  });
}
// npoint не отдаёт CORS-заголовки на запись, поэтому идём через свой воркер —
// тот же путь, что у трекера ZZZ. Прямой запрос пробуем первым: если сеть
// позволяет, лишнего посредника не будет.
function syncUrls(id, write) {
  const via = API_BASES.map(b => b + '/api/cloud/' + id);
  // На запись npoint не отдаёт CORS-заголовки, прямой запрос из браузера
  // заведомо не пройдёт — сразу идём через свой воркер. На чтение прямой
  // работает и он быстрее.
  return write ? via : ['https://api.npoint.io/' + id].concat(via);
}
async function syncTry(id, opt) {
  let last = null;
  for (const u of syncUrls(id, !!(opt && opt.method === 'POST'))) {
    try {
      const r = await fetch(u, Object.assign({ cache: 'no-store' }, opt || {}));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) { last = e; }
  }
  throw last || new Error('нет связи');
}
// Из ссылки «https://api.npoint.io/abc123» или кода подключения достаём id
function syncId(raw) {
  const t = String(raw || '').trim();
  const m = t.match(/npoint\.io\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{8,40}$/.test(t)) return t;
  return '';
}
async function syncNow(say) {
  const cfg = syncCfg();
  if (!cfg.np) { say('Сначала подключи хранилище', 1); return; }
  say('синхронизирую…');
  try {
    let cloud = null;
    try {
      const r = await syncTry(cfg.np);
      cloud = await r.json();
    } catch (e) { cloud = null; }        // пустое хранилище — это нормально
    if (cloud && cloud.data) syncApply(cloud.data, +cloud.at || 0);
    const body = JSON.stringify({ v: 1, at: Date.now(), data: syncCollect() });
    await syncTry(cfg.np, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body });
    cfg.at = Date.now();
    syncCfgSave(cfg);
    say('готово: отметки сведены ' + new Date(cfg.at).toLocaleString('ru'));
    draw();
  } catch (e) {
    say('не вышло: ' + (e && e.message ? e.message : e) +
        '. Мешать может VPN или блокировщик.', 1);
  }
}
function showSync() {
  const cfg = syncCfg();
  const on = !!cfg.np;
  сброситьПанель(); $('sheetIn').innerHTML =
    '<div class="sh-body">' +
      '<div class="sh-title"><h2>Облако<i>отметки на всех устройствах</i></h2>' +
        '<div style="margin-left:auto"><button class="x" id="close">✕ закрыть</button></div>' +
      '</div>' +
      '<div class="box">' +
        (on ? '<div class="verdict">Подключено ✓ последняя сверка: ' +
                (cfg.at ? new Date(cfg.at).toLocaleString('ru') : 'ещё не было') + '</div>'
            : '<div class="hint">Хранилище бесплатное и своё: зайди на ' +
              '<a href="https://www.npoint.io/" target="_blank" rel="noopener">npoint.io</a>, ' +
              'нажми «Create JSON bin», сохрани — и скопируй ссылку вида ' +
              '<b>api.npoint.io/xxxxxxxx</b>. Вставь её сюда. На втором устройстве ' +
              'вставь тот же адрес — отметки сойдутся.</div>') +
        '<div class="inp" style="margin-top:9px"><div>' +
          '<label>ссылка на хранилище или код подключения</label>' +
          '<input id="syncKey" type="text" autocomplete="off" placeholder="api.npoint.io/…">' +
        '</div></div>' +
        '<div class="mapbar" style="margin-top:10px">' +
          '<button id="syncOn">' + (on ? 'заменить' : 'подключить') + '</button>' +
          (on ? '<button id="syncGo">синхронизировать</button>' +
                '<button id="syncShow">показать код</button>' +
                '<button id="syncOff">отключить</button>' : '') +
        '</div>' +
        '<div class="hint" id="syncMsg" style="margin-top:8px"></div>' +
        '<div class="hint">Едут: твои характеристики, уровни для планировщика, ' +
        'введённые коды и найденные точки на карте. Отметки с двух устройств ' +
        'складываются, а не затирают друг друга.</div>' +
        '<div class="hint" style="color:#fbbf24">Адрес хранилища — это и есть ключ: ' +
        'кто его знает, тот может читать и перезаписывать твои отметки. Никому не показывай.</div>' +
      '</div>' +
    '</div>';
  $('sheet').classList.add('on');
  $('sheet').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if ($('close')) $('close').onclick = close;
  const say = (t, bad) => {
    const el = $('syncMsg');
    if (el) { el.textContent = t; el.style.color = bad ? '#ff5a5a' : 'var(--acc)'; }
  };
  if ($('syncOn')) $('syncOn').onclick = () => {
    const id = syncId($('syncKey').value);
    if (!id) { say('Не разобрал адрес. Нужна ссылка вида api.npoint.io/xxxxxxxx', 1); return; }
    syncCfgSave({ np: id, at: 0 });
    say('подключено, свожу отметки…');
    syncNow(say).then(() => showSync());
  };
  if ($('syncGo')) $('syncGo').onclick = () => syncNow(say);
  if ($('syncShow')) $('syncShow').onclick = () => {
    $('syncKey').value = 'https://api.npoint.io/' + syncCfg().np;
    say('код в поле выше — скопируй и вставь на другом устройстве');
  };
  if ($('syncOff')) $('syncOff').onclick = () => {
    syncCfgSave({});
    showSync();
  };
}
function close() {
  $('sheet').classList.remove('on');
  document.body.style.overflow = '';
}
function foot(t) {
  $('foot').innerHTML = esc(t) + ' Источники: ' +
    '<a href="https://www.prydwen.gg/neverness-to-everness/" target="_blank" rel="noopener">prydwen.gg</a>, ' +
    '<a href="https://neverness-to-everness.fandom.com/" target="_blank" rel="noopener">вики NTE</a>.';
}
$('sheet').onclick = e => { if (e.target === $('sheet')) close(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
$('q').oninput = () => { state.q = $('q').value; draw(); };

load().catch(e => {
  $('body').innerHTML = '<div class="empty">Не удалось загрузить данные: ' + esc(e.message) +
    '<br>Проверь, что рядом лежат nte-db.json и nte-guide.json.</div>';
});
