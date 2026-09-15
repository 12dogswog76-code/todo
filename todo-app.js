// список дел — весь код страницы.
//
// Вынесен из index.html отдельным файлом: пока скрипт лежал внутри страницы,
// политике безопасности приходилось разрешать инлайн-скрипты, а это
// ровно та лазейка, через которую работает подстановка чужого кода.
// Загружается с defer — к моменту выполнения разметка уже разобрана.

const LS = 'alexey_todo_v1';
// жизненный цикл выполненной задачи (настраивается, в минутах; arc: -1 = никогда)
let life = { down: 150, arc: 10080 };
try { Object.assign(life, JSON.parse(localStorage.getItem(LS + '_life')) || {}); } catch(e) {}
function lifeDownMs() { return life.down * 60000; }
function lifeArcMs() { return life.arc < 0 ? -1 : life.arc * 60000; }

let tasks = [];
try { tasks = JSON.parse(localStorage.getItem(LS)) || []; } catch(e) {}
tasks.forEach(t => { if (t.cat === 'Дом') t.cat = 'Купить'; });

// миграция: ручной порядок (pos)
if (tasks.some(t => t.pos === undefined)) {
  const legacy = tasks.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (b.created || 0) - (a.created || 0);
  });
  legacy.forEach((t, i) => { if (t.pos === undefined) t.pos = i; });
}

let state = { showDone: true, sort: 'manual', catsOpen: false, fCats: [], fSubs: [], fArchive: false, fDone: false, colors: [], view: '' };
try { Object.assign(state, JSON.parse(localStorage.getItem(LS+'_ui')) || {}); } catch(e) {}
// миграция старых одиночных фильтров на множественные
if (state.filter) {
  if (state.filter === 'архив') state.fArchive = true;
  else if (state.filter !== 'все') state.fCats = [state.filter === 'Дом' ? 'Купить' : state.filter];
  delete state.filter;
}
if (state.colorF) { state.colors = [state.colorF]; delete state.colorF; }
if (state.sortColor) { state.sort = 'color-asc'; delete state.sortColor; }
if (!Array.isArray(state.fCats)) state.fCats = [];
if (!Array.isArray(state.fSubs)) state.fSubs = [];
if (!Array.isArray(state.colors)) state.colors = [];
if (!state.sort) state.sort = 'manual';

let searchQ = '';
let selMode = false;
let selIds = new Set();

// облачная синхронизация (jsonbin.io)
let sync = null;
try { sync = JSON.parse(localStorage.getItem(LS+'_sync')); } catch(e) {}
let tombstones = []; // память об удалённых задачах, чтобы они не «воскресали» при слиянии
try { tombstones = JSON.parse(localStorage.getItem(LS+'_tomb')) || []; } catch(e) {}

const SYNERGY_LOGO = '<svg viewBox="0 0 100 100" width="19" height="19" style="display:block"><rect width="100" height="100" fill="#ec1c24"/><rect x="15" y="15" width="70" height="70" fill="#0b0b0d"/><polygon points="63,19 29,50 63,81 63,62 50,50 63,38" fill="#ec1c24"/></svg>';
const SYNERGY_MINI = '<svg viewBox="0 0 100 100" width="12" height="12" style="vertical-align:-1px"><rect width="100" height="100" fill="#ec1c24"/><rect x="15" y="15" width="70" height="70" fill="#0b0b0d"/><polygon points="63,19 29,50 63,81 63,62 50,50 63,38" fill="#ec1c24"/></svg>';
const CLAUDE_LOGO = '<svg viewBox="0 0 100 100" width="19" height="19" style="display:block"><g fill="none" stroke="#D97757" stroke-width="9" stroke-linecap="round"><line x1="57" y1="50" x2="94" y2="50"/><line x1="56.1" y1="53.5" x2="78.6" y2="66.5"/><line x1="53.5" y1="56.1" x2="72" y2="88.1"/><line x1="50" y1="57" x2="50" y2="83"/><line x1="46.5" y1="56.1" x2="28" y2="88.1"/><line x1="43.9" y1="53.5" x2="21.4" y2="66.5"/><line x1="43" y1="50" x2="6" y2="50"/><line x1="43.9" y1="46.5" x2="21.4" y2="33.5"/><line x1="46.5" y1="43.9" x2="28" y2="11.9"/><line x1="50" y1="43" x2="50" y2="17"/><line x1="53.5" y1="43.9" x2="72" y2="11.9"/><line x1="56.1" y1="46.5" x2="78.6" y2="33.5"/></g></svg>';
const CLAUDE_MINI = '<svg viewBox="0 0 100 100" width="12" height="12" style="vertical-align:-1px"><g fill="none" stroke="#D97757" stroke-width="10" stroke-linecap="round"><line x1="57" y1="50" x2="94" y2="50"/><line x1="56.1" y1="53.5" x2="78.6" y2="66.5"/><line x1="53.5" y1="56.1" x2="72" y2="88.1"/><line x1="50" y1="57" x2="50" y2="83"/><line x1="46.5" y1="56.1" x2="28" y2="88.1"/><line x1="43.9" y1="53.5" x2="21.4" y2="66.5"/><line x1="43" y1="50" x2="6" y2="50"/><line x1="43.9" y1="46.5" x2="21.4" y2="33.5"/><line x1="46.5" y1="43.9" x2="28" y2="11.9"/><line x1="50" y1="43" x2="50" y2="17"/><line x1="53.5" y1="43.9" x2="72" y2="11.9"/><line x1="56.1" y1="46.5" x2="78.6" y2="33.5"/></g></svg>';
// категории: редактируемый список, синхронизируется через облако
const DEFAULT_CATS = [
  { n: 'Работа', e: '💼', c: '#ff6b6b' },
  { n: 'Личное', e: '😊', c: '#7fb8ff' },
  { n: 'Купить', e: '🛒', c: '#8fd6a8' }
];
let catList = null;
try { catList = JSON.parse(localStorage.getItem(LS + '_cats')); } catch(e) {}
if (!Array.isArray(catList) || !catList.length) catList = DEFAULT_CATS.slice();
let catsMod = parseInt(localStorage.getItem(LS + '_catsMod') || '0', 10);

function topCats() { return catList.filter(c => !c.parent); }
function subsOf(name) { return catList.filter(c => c.parent === name); }
function subEntry(parent, sub) { return catList.find(c => c.parent === parent && c.n === sub); }
function allCatNames() { return topCats().map(c => c.n); }
const DEV_CDN = 'https://cdn.jsdelivr.net/gh/xandemon/developer-icons@v7.0.1/icons/';
function emojiHTMLof(c, mini) {
  if (!c || !c.e) return '';
  if (c.e === '__syn') return mini ? SYNERGY_MINI : SYNERGY_LOGO;
  if (c.e === '__claude') return mini ? CLAUDE_MINI : CLAUDE_LOGO;
  if (c.e.indexOf('dev:') === 0) {
    const s = mini ? 13 : 19;
    return '<img src="' + DEV_CDN + c.e.slice(4) + '.svg" alt="" style="width:' + s + 'px;height:' + s + 'px;vertical-align:' + (mini ? '-2px' : 'middle') + '">';
  }
  return c.e;
}
function catEmojiHTML(n, mini) {
  return emojiHTMLof(catList.find(x => x.n === n && !x.parent) || catList.find(x => x.n === n), mini);
}
function subEmojiHTML(parent, sub, mini) { return emojiHTMLof(subEntry(parent, sub), mini); }
function catChipHTML(n) {
  const e = catEmojiHTML(n, true);
  return (e ? e + ' ' : '') + esc(n);
}
function subChipHTML(parent, sub) {
  const e = subEmojiHTML(parent, sub, true);
  return (e ? e + ' ' : '') + esc(sub);
}
function saveCats() {
  catsMod = Date.now();
  localStorage.setItem(LS + '_cats', JSON.stringify(catList));
  localStorage.setItem(LS + '_catsMod', String(catsMod));
  scheduleSync();
}

const CAT_COLOR = { 'Работа': '#ff6b6b', 'Личное': '#7fb8ff', 'Купить': '#8fd6a8', 'ПК': '#7fb8ff' };
// палитра: 10 цветов, порядок = «от красного к белому»
const COLORS = [
  ['#ff6b6b', 'Красный'], ['#ffa94d', 'Оранжевый'], ['#ffd95e', 'Жёлтый'],
  ['#8fd6a8', 'Зелёный'], ['#66d9e8', 'Бирюзовый'], ['#7fb8ff', 'Голубой'],
  ['#b197fc', 'Фиолетовый'], ['#ff8fce', 'Розовый'], ['#a3a8b8', 'Серый'], ['#ffffff', 'Белый']
];
const PALETTE = [null].concat(COLORS.map(c => c[0]));
const COLOR_ORDER = COLORS.map(c => c[0]);
// светлая тема: тёмные версии цветов, чтобы текст оставался читаемым (белый → почти чёрный)
const LIGHT_TEXT = {
  '#ffffff': '#1c1e24', '#ffd95e': '#b8860b', '#ff6b6b': '#d32f2f',
  '#7fb8ff': '#1e6fd9', '#8fd6a8': '#2e8f5e', '#ffa94d': '#d9730d',
  '#66d9e8': '#0b9aa8', '#b197fc': '#7048c8', '#ff8fce': '#d6336c', '#a3a8b8': '#5f6673'
};
let theme = localStorage.getItem(LS + '_theme') || 'dark';
function isLight() { return theme === 'light'; }
function themedColor(c) {
  if (!c) return c;
  return isLight() ? (LIGHT_TEXT[c.toLowerCase()] || c) : c;
}
const REP_NAME = { d: 'каждый день', w: 'каждую неделю', m: 'каждый месяц' };
function repName(r) {
  if (!r) return '';
  if (REP_NAME[r]) return REP_NAME[r];
  if (r.indexOf('c:') === 0) return 'каждые ' + r.slice(2) + ' дн.';
  return r;
}
function catColorOf(n) {
  if (!n) return null;
  const c = catList.find(x => x.n === n && !x.parent) || catList.find(x => x.n === n);
  if (c && c.c) return c.c; // свой цвет категории
  return CAT_COLOR[n] || null;
}
function subColorOf(parent, sub) { const e = subEntry(parent, sub); return (e && e.c) || null; }
function catSumOn(name) { if (!name) return false; const c = catList.find(x => x.n === name && !x.parent) || catList.find(x => x.n === name); return !!(c && c.sum); }
function fmtMoney(n) { return Math.round(n).toLocaleString('ru-RU'); }
function effColor(t) {
  return t.color || (t.sub ? subColorOf(t.cat, t.sub) : null) || catColorOf(t.cat) || '#ffffff';
}
function colorRank(t) {
  const i = COLOR_ORDER.indexOf(effColor(t));
  return i === -1 ? COLOR_ORDER.length : i;
}

let pickedCat = null;
let pickedSub = null;
const $ = id => document.getElementById(id);

function closePalettes() {
  document.querySelectorAll('.palette').forEach(p => p.remove());
}
document.addEventListener('click', closePalettes);

function save() {
  localStorage.setItem(LS, JSON.stringify(tasks));
  localStorage.setItem(LS+'_ui', JSON.stringify(state));
  localStorage.setItem(LS+'_tomb', JSON.stringify(tombstones));
  scheduleSync();
  schedulePushRem();
}
function bumpTop(t) { const mp = tasks.length ? Math.min(...tasks.map(x => x.pos || 0)) : 0; t.pos = mp - 1; t.mod = Date.now(); }
function todayStr() {
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
const MONTHS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
let dateFmt = localStorage.getItem(LS + '_dateFmt') || 'name';
function fmtD(ts) {
  const d = new Date(ts);
  if (dateFmt === 'name') return d.getDate() + ' ' + MONTHS[d.getMonth()];
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
}
function fmtDT(ts) {
  const d = new Date(ts);
  return fmtD(ts) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function linkify(s) {
  let h = esc(s);
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/(^|[^"'>=])(https?:\/\/[^\s<]+)/g, (m, pre, url) => {
    const host = url.replace(/^https?:\/\//, '').split(/[\/?#]/)[0];
    return pre + '<a href="' + url + '" target="_blank" rel="noopener">' + host + ' ↗</a>';
  });
  return h;
}
function attachLinkPaste(input) {
  input.addEventListener('paste', e => {
    const txt = ((e.clipboardData || window.clipboardData).getData('text') || '').trim();
    if (!/^https?:\/\/\S+$/.test(txt)) return;
    const s = input.selectionStart, en = input.selectionEnd;
    if (s === en) return;
    e.preventDefault();
    const md = '[' + input.value.slice(s, en) + '](' + txt + ')';
    input.value = input.value.slice(0, s) + md + input.value.slice(en);
    input.setSelectionRange(s + md.length, s + md.length);
  });
}
function deadlineOf(t) {
  if (!t.due) return null;
  return new Date(t.due + 'T' + (t.dueTime || '23:59'));
}
function dueClass(t) {
  if (!t.due || t.done) return '';
  const dl = deadlineOf(t);
  if (dl - new Date() < 0) return 'overdue';
  if (t.due === todayStr()) return 'today';
  return '';
}
function countdown(t) {
  const dl = deadlineOf(t);
  let diff = dl - new Date();
  const past = diff < 0;
  diff = Math.abs(diff);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff % 86400000 / 3600000);
  const m = Math.floor(diff % 3600000 / 60000);
  let parts = [];
  if (d) parts.push(d + 'д');
  if (h) parts.push(h + 'ч');
  if (m || parts.length === 0) parts.push(m + 'м');
  const s = parts.join(' ');
  return past ? 'просрочено на ' + s : 'осталось ' + s;
}
function isParked(t) {
  return t.done && t.completedAt && (Date.now() - t.completedAt >= lifeDownMs());
}
function isArchived(t) {
  if (!t.done) return false;
  if (t.arc) return true; // отправлена в архив вручную
  const a = lifeArcMs();
  return a >= 0 && t.completedAt && (Date.now() - t.completedAt >= a);
}
function cmp(a, b) {
  const pa = isParked(a), pb = isParked(b);
  if (pa !== pb) return pa ? 1 : -1;
  if (pa && pb) return (b.completedAt || 0) - (a.completedAt || 0);
  const na = !!a.pinned, nb = !!b.pinned;
  if (na !== nb) return na ? -1 : 1;
  // задачи с таймером (дедлайном) поднимаются выше остальных (но не выше закреплённых), срочные первыми
  const ta = !!(a.due && !a.done), tb = !!(b.due && !b.done);
  if (ta !== tb) return ta ? -1 : 1;
  if (ta && tb) { const dd = deadlineOf(a) - deadlineOf(b); if (dd) return dd; }
  const s = state.sort || 'manual';
  if (s === 'color-asc' || s === 'color-desc') {
    const d = colorRank(a) - colorRank(b);
    if (d) return s === 'color-asc' ? d : -d;
  } else if (s === 'date-asc' || s === 'date-desc') {
    const d = (a.created || 0) - (b.created || 0);
    if (d) return s === 'date-asc' ? d : -d;
  } else if (s === 'alpha-asc' || s === 'alpha-desc') {
    // localeCompare сортирует кириллицу и латиницу одновременно
    const d = (a.title || '').localeCompare(b.title || '', ['ru', 'en'], { sensitivity: 'base' });
    if (d) return s === 'alpha-asc' ? d : -d;
  }
  return (a.pos || 0) - (b.pos || 0);
}
// следующая дата для повторяющейся задачи
function nextDue(due, rep) {
  const d = new Date(due + 'T00:00');
  const today = new Date(todayStr() + 'T00:00');
  do {
    if (rep === 'd') d.setDate(d.getDate() + 1);
    else if (rep === 'w') d.setDate(d.getDate() + 7);
    else if (rep && rep.indexOf('c:') === 0) d.setDate(d.getDate() + (parseInt(rep.slice(2), 10) || 1));
    else d.setMonth(d.getMonth() + 1);
  } while (d <= today);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function spawnRepeat(t) {
  if (!t.repeat || !t.due) return;
  const minPos = tasks.length ? Math.min(...tasks.map(x => x.pos || 0)) : 0;
  tasks.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    title: t.title,
    cat: t.cat,
    sub: t.sub,
    stage: t.stage, stageAt: t.stageAt,
    due: nextDue(t.due, t.repeat),
    dueTime: t.dueTime,
    repeat: t.repeat,
    checks: (t.checks || []).map(c => ({ t: c.t, d: false })),
    color: t.color,
    pinned: t.pinned,
    done: false,
    created: Date.now(),
    updatedAt: null,
    mod: Date.now(),
    pos: minPos - 1
  });
}

function addTask() {
  const text = $('taskInput').value.trim();
  if (!text) return;
  const minPos = tasks.length ? Math.min(...tasks.map(t => t.pos || 0)) : 0;
  tasks.push({
    id: Date.now(),
    title: text,
    cat: pickedCat,
    sub: pickedSub,
    checks: $('noteInput').value.trim() ? [{ t: $('noteInput').value.trim(), d: false }] : undefined,
    due: $('dateInput').value || ($('timeInput').value ? todayStr() : null), // время без даты = сегодня
    dueTime: $('timeInput').value || null,
    repeat: $('repInput').value === 'c' ? 'c:' + addRepN : ($('repInput').value || null),
    done: false,
    created: Date.now(),
    updatedAt: null,
    mod: Date.now(),
    pos: minPos - 1
  });
  ['taskInput','noteInput','dateInput','timeInput','repInput'].forEach(i => {
    $(i).value = '';
    $(i).classList.remove('on');
    if ($(i).parentElement && $(i).parentElement.classList.contains('ico')) {
      $(i).parentElement.classList.remove('on');
    }
  });
  const rco = [...$('repInput').options].find(o => o.value === 'c');
  if (rco) rco.text = '🔁 свой период…';
  pickedCat = null; pickedSub = null;
  renderCatChips();
  save(); render();
  $('taskInput').focus();
}

function moveTask(t, dir, shown) {
  const movable = shown.filter(x => !isParked(x) && !!x.pinned === !!t.pinned);
  const i = movable.indexOf(t);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= movable.length) return;
  const other = movable[j];
  const tmp = t.pos; t.pos = other.pos; other.pos = tmp;
  t.mod = Date.now(); other.mod = Date.now();
  save(); render();
}

// перетаскивание за ⠿
function startDrag(e, t, row, shown) {
  e.preventDefault();
  const group = shown.filter(x => !isParked(x) && !!x.pinned === !!t.pinned);
  if (group.length < 2) return;
  const rows = group.map(x => document.querySelector('.task[data-id="' + x.id + '"]')).filter(Boolean);
  const centers = rows.map(r => { const rc = r.getBoundingClientRect(); return rc.top + rc.height / 2; });
  const myIdx = group.indexOf(t);
  const startY = e.clientY;
  row.classList.add('dragging');
  const move = ev => {
    row.style.transition = 'none';
    row.style.transform = 'translateY(' + (ev.clientY - startY) + 'px)';
  };
  const up = ev => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    row.classList.remove('dragging');
    row.style.transform = ''; row.style.transition = '';
    const myCenter = centers[myIdx] + (ev.clientY - startY);
    let target = 0;
    centers.forEach((c, i) => { if (i !== myIdx && myCenter > c) target++; });
    if (target !== myIdx) {
      const order = group.slice();
      order.splice(myIdx, 1);
      order.splice(target, 0, t);
      const poss = group.map(x => x.pos).sort((a, b) => a - b);
      order.forEach((x, i) => {
        if (x.pos !== poss[i]) { x.pos = poss[i]; x.mod = Date.now(); }
      });
      // перетащил при включённой сортировке — видимый порядок запекается и сортировка становится ручной
      if ((state.sort || 'manual') !== 'manual') state.sort = 'manual';
      save();
    }
    render();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

function matchSearch(t) {
  const q = searchQ.trim().toLowerCase();
  if (!q) return true;
  if (t.title.toLowerCase().includes(q)) return true;
  if (t.stage && t.stage.toLowerCase().includes(q)) return true;
  if (t.checks && t.checks.some(c => c.t.toLowerCase().includes(q))) return true;
  return false;
}

let undoTimer = null;
function shortTitle(s) { s = s || ''; return s.length > 32 ? s.slice(0, 32) + '…' : s; }
function showUndo(text, undoFn) {
  let el = document.getElementById('undoBar');
  if (!el) { el = document.createElement('div'); el.id = 'undoBar'; document.body.appendChild(el); }
  el.innerHTML = '';
  const sp = document.createElement('span'); sp.textContent = text;
  const btn = document.createElement('button'); btn.textContent = 'Отменить';
  btn.onclick = () => { clearTimeout(undoTimer); el.classList.remove('show'); undoFn(); };
  el.append(sp, btn);
  el.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => el.classList.remove('show'), 6000);
}
function render() {
  // запоминаем позиции для анимации перемещения (FLIP)
  const oldPos = {};
  document.querySelectorAll('#list .task').forEach(el => {
    oldPos[el.dataset.id] = el.getBoundingClientRect().top;
  });
  const hadAny = Object.keys(oldPos).length > 0;

  const active = tasks.filter(t => !t.done).length;
  const od = tasks.filter(t => dueClass(t) === 'overdue').length;
  const base = (active === 0 && tasks.length > 0)
    ? 'Всё сделано 🎉'
    : 'Активных: ' + active + (od ? ' · просрочено: ' + od : '');
  // сумма — только по выбранным в фильтрах категориям с подсчётом, с их иконками
  const sumCats = state.fCats.filter(n => catSumOn(n));
  let moneyHTML = '';
  if (sumCats.length) {
    const money = tasks.reduce((sm, t) => (!t.done && t.amount && !t.amountSkip && sumCats.includes(t.cat)) ? sm + t.amount : sm, 0);
    const icons = sumCats.map(n => catEmojiHTML(n, true)).filter(Boolean).join(' ') || '💰';
    moneyHTML = ' · ' + icons + ' ' + fmtMoney(money) + ' ₽';
  }
  $('stats').innerHTML = esc(base) + moneyHTML;

  const isArc = !!state.fArchive;
  const fIcon = c => catEmojiHTML(c, true) ? catEmojiHTML(c, true) + ' ' : '';
  const f = $('filters');
  f.innerHTML = '';
  const fc = document.createElement('div'); fc.className = 'fchips'; f.appendChild(fc);
  const activeCnt = state.fCats.length + state.colors.length + (state.fDone ? 1 : 0) + (state.view ? 1 : 0);
  const tgl = document.createElement('span');
  tgl.className = 'chip' + (state.catsOpen || activeCnt ? ' on' : '');
  tgl.innerHTML = '# Фильтры' + (activeCnt ? ' (' + activeCnt + ')' : '') + ' ' + (state.catsOpen ? '▴' : '▾');
  tgl.onclick = () => { state.catsOpen = !state.catsOpen; save(); render(); };
  fc.appendChild(tgl);

  if (state.catsOpen) {
    // «Все» — сброс
    const all = document.createElement('span');
    all.className = 'chip' + (activeCnt === 0 ? ' on' : '');
    all.textContent = 'Все';
    all.title = 'Сбросить все фильтры';
    all.onclick = () => { state.fCats = []; state.fSubs = []; state.colors = []; state.fArchive = false; state.fDone = false; state.view = ''; save(); render(); };
    fc.appendChild(all);
    // категории: можно выбрать несколько
    allCatNames().concat(['без категории']).forEach(c => {
      const on = state.fCats.includes(c);
      const el = document.createElement('span');
      el.className = 'chip' + (on ? ' on' : '');
      el.innerHTML = fIcon(c) + esc(c);
      el.onclick = () => {
        state.fCats = on ? state.fCats.filter(x => x !== c) : state.fCats.concat([c]);
        if (on) state.fSubs = (state.fSubs || []).filter(x => x.indexOf(c + '\u0001') !== 0);
        save(); render();
      };
      fc.appendChild(el);
    });
    state.fCats.forEach(pc => {
      subsOf(pc).forEach(sx => {
        const sk = pc + '\u0001' + sx.n;
        const son = (state.fSubs || []).includes(sk);
        const sel = document.createElement('span');
        sel.className = 'chip subchip' + (son ? ' on' : '');
        sel.innerHTML = subChipHTML(pc, sx.n);
        sel.onclick = () => {
          if (!state.fSubs) state.fSubs = [];
          state.fSubs = son ? state.fSubs.filter(x => x !== sk) : state.fSubs.concat([sk]);
          save(); render();
        };
        fc.appendChild(sel);
      });
    });
    [['today', '📅 Сегодня'], ['overdue', '⏰ Просрочено'], ['week', '🗓 Неделя']].forEach(v => {
      const el = document.createElement('span');
      el.className = 'chip' + (state.view === v[0] ? ' on' : '');
      el.textContent = v[1];
      el.onclick = () => { state.view = state.view === v[0] ? '' : v[0]; if (state.view) { state.fArchive = false; state.fDone = false; } save(); render(); };
      fc.appendChild(el);
    });
    const dn = document.createElement('span');
    dn.className = 'chip' + (state.fDone ? ' on' : '');
    dn.innerHTML = '✓ выполненные';
    dn.title = 'Выполненные, которые ещё не в архиве';
    dn.onclick = () => {
      state.fDone = !state.fDone;
      if (state.fDone) state.fArchive = false;
      save(); render();
    };
    fc.appendChild(dn);
    // цвета: показываем только используемые, внутри — количество активных задач
    COLOR_ORDER.forEach(col => {
      const cnt = tasks.filter(t => !t.done && effColor(t) === col).length;
      const on = state.colors.includes(col);
      if (!cnt && !on) return; // цвет никем не используется — не показываем
      const dEl = document.createElement('span');
      dEl.className = 'fdot' + (on ? ' on' : '');
      dEl.style.background = col;
      dEl.textContent = cnt || '';
      dEl.title = (COLORS.find(c => c[0] === col) || ['', ''])[1] + ': ' + cnt;
      dEl.onclick = () => {
        state.colors = on ? state.colors.filter(x => x !== col) : state.colors.concat([col]);
        save(); render();
      };
      fc.appendChild(dEl);
    });
  } else {
    // свёрнуто: показываем активные выборы, клик по чипу — убрать его
    if (state.view) {
      const vl = { today: '📅 Сегодня', overdue: '⏰ Просрочено', week: '🗓 Неделя' };
      const vEl = document.createElement('span');
      vEl.className = 'chip on';
      vEl.innerHTML = (vl[state.view] || state.view) + ' ✕';
      vEl.onclick = () => { state.view = ''; save(); render(); };
      fc.appendChild(vEl);
    }
    state.fCats.forEach(c => {
      const el = document.createElement('span');
      el.className = 'chip on';
      el.innerHTML = fIcon(c) + esc(c) + ' ✕';
      el.onclick = () => { state.fCats = state.fCats.filter(x => x !== c); save(); render(); };
      fc.appendChild(el);
    });
    if (state.fDone) {
      const el = document.createElement('span');
      el.className = 'chip on';
      el.innerHTML = '✓ выполненные ✕';
      el.onclick = () => { state.fDone = false; save(); render(); };
      fc.appendChild(el);
    }
    state.colors.forEach(col => {
      const cnt = tasks.filter(t => !t.done && effColor(t) === col).length;
      const dEl = document.createElement('span');
      dEl.className = 'fdot on';
      dEl.style.background = col;
      dEl.textContent = cnt || '';
      dEl.title = 'Убрать цвет';
      dEl.onclick = () => { state.colors = state.colors.filter(x => x !== col); save(); render(); };
      fc.appendChild(dEl);
    });
  }
  const sortSel = document.createElement('select');
  sortSel.className = 'pill';
  sortSel.title = 'Сортировка задач';
  sortSel.innerHTML =
    '<option value="manual">Сортировка: ручная</option>' +
    '<option value="color-asc">Цвет: красный → белый</option>' +
    '<option value="color-desc">Цвет: белый → красный</option>' +
    '<option value="date-desc">Дата: новые → старые</option>' +
    '<option value="date-asc">Дата: старые → новые</option>' +
    '<option value="alpha-asc">Алфавит: А → Я</option>' +
    '<option value="alpha-desc">Алфавит: Я → А</option>';
  sortSel.value = state.sort || 'manual';
  sortSel.classList.toggle('on', sortSel.value !== 'manual');
  sortSel.onchange = () => { state.sort = sortSel.value; save(); render(); };
  fc.appendChild(sortSel);

  { const ab = $('archiveBtn'); if (ab) ab.classList.toggle('on', !!state.fArchive); }
  if (!isArc) {
    const fs = document.createElement('div'); fs.className = 'fside';
    const fdiv = document.createElement('span'); fdiv.className = 'catdiv'; fs.appendChild(fdiv);
    const col = document.createElement('div'); col.className = 'fcol';
    const selC = document.createElement('span');
    selC.className = 'chip' + (selMode ? ' on' : '');
    selC.textContent = 'Выбрать несколько';
    selC.onclick = () => { selMode = !selMode; if (!selMode) selIds.clear(); save(); render(); updateSelBar(); };
    col.appendChild(selC);
    if (!state.fDone) {
      const tg = document.createElement('span');
      tg.className = 'chip';
      tg.textContent = state.showDone ? 'Скрыть выполненные' : 'Показать выполненные';
      tg.onclick = () => { state.showDone = !state.showDone; save(); render(); };
      col.appendChild(tg);
    }
    fs.appendChild(col);
    f.appendChild(fs);
  }

  const list = $('list');
  list.innerHTML = '';
  let shown = tasks.slice().sort(cmp).filter(t => {
    if (!matchSearch(t)) return false;
    if (state.colors.length && !state.colors.includes(effColor(t))) return false; // выбранные цвета
    if (isArc) {
      if (!isArchived(t)) return false;
    } else if (state.fDone) { // выполненные, ещё не уехавшие в архив
      if (!t.done || isArchived(t)) return false;
    } else {
      if (isArchived(t)) return false;
      if (!state.showDone && t.done) return false;
    }
    if (state.fCats.length) { // выбранные категории
      const key = t.cat || 'без категории';
      if (!state.fCats.includes(key)) return false;
      const selSubs = (state.fSubs || []).filter(x => x.indexOf((t.cat || '') + '\u0001') === 0);
      if (selSubs.length && !selSubs.includes((t.cat || '') + '\u0001' + (t.sub || ''))) return false;
    }
    if (state.view) {
      if (t.done) return false;
      const dl = t.due ? deadlineOf(t).getTime() : null;
      if (state.view === 'overdue') { if (dueClass(t) !== 'overdue') return false; }
      else if (state.view === 'today') { if (!(t.due === todayStr() || dueClass(t) === 'overdue')) return false; }
      else if (state.view === 'week') { if (dl === null || dl > Date.now() + 7 * 86400000) return false; }
    }
    return true;
  });
  if (isArc) shown.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  if (shown.length === 0) {
    list.innerHTML = '<div class="empty">' + (tasks.length === 0
      ? 'Пока пусто. Впиши первое дело в поле сверху и нажми Enter ↑'
      : (searchQ ? 'Ничего не нашлось' : (isArc ? 'Архив пуст' : 'Здесь ничего нет'))) + '</div>';
    return;
  }

  shown.forEach(t => {
    const row = document.createElement('div');
    row.dataset.id = t.id;
    row.className = 'task ' + (t.done ? 'done ' : '') + (isParked(t) ? 'parked ' : '') + (t.pinned ? 'pinned ' : '') + (t.cat ? 'cat-' + t.cat : '') + (selMode && selIds.has(t.id) ? ' selected' : '');

    if (!isParked(t)) {
      const dh = document.createElement('div');
      dh.className = 'dragh'; dh.textContent = '⠿'; dh.title = 'Перетащить';
      dh.onpointerdown = e => startDrag(e, t, row, shown);
      row.appendChild(dh);
    }

    const ch = document.createElement('div');
    ch.className = 'check'; ch.textContent = '✓';
    ch.title = t.done ? 'Вернуть в работу' : 'Отметить выполненной';
    ch.onclick = () => {
      const wasDone = t.done;
      t.done = !t.done;
      t.completedAt = t.done ? Date.now() : null;
      if (!t.done) t.arc = false; // возврат в работу — из архива тоже
      t.mod = Date.now();
      let spawned = null;
      if (t.done) { const _b = tasks.length; spawnRepeat(t); if (tasks.length > _b) spawned = tasks[tasks.length - 1]; }
      save(); render();
      if (!wasDone && t.done) showUndo('Выполнено: ' + shortTitle(t.title), () => {
        t.done = false; t.completedAt = null; t.arc = false; t.mod = Date.now();
        if (spawned) tasks = tasks.filter(x => x !== spawned);
        save(); render();
      });
    };
    row.appendChild(ch);

    const catEm = t.cat ? (t.sub ? subEmojiHTML(t.cat, t.sub, false) : catEmojiHTML(t.cat, false)) : '';
    if (catEm) {
      const em = document.createElement('div');
      em.className = 'emoji';
      em.innerHTML = catEm;
      row.appendChild(em);
    }

    const body = document.createElement('div');
    body.className = 'body';
    const title = document.createElement('div');
    title.className = 'title'; title.innerHTML = linkify(t.title);
    const tColor = t.color || (t.sub ? subColorOf(t.cat, t.sub) : null) || catColorOf(t.cat);
    if (tColor) title.style.color = themedColor(tColor);
    body.appendChild(title);

    if (t.stage) {
      const stg = document.createElement('div');
      stg.className = 'stage';
      stg.innerHTML = '↳ ' + linkify(t.stage) +
        (t.stageAt ? ' <span class="stageDate">· ' + fmtDT(t.stageAt) + '</span>' : '');
      body.appendChild(stg);
    }

    if (t.note) {
      const nt = document.createElement('div');
      nt.className = 'note';
      nt.innerHTML = '📝 ' + linkify(t.note);
      body.appendChild(nt);
    }

    // чек-лист
    if (t.checks && t.checks.length) {
      const cw = document.createElement('div');
      cw.className = 'checks';
      t.checks.forEach((c, ci) => {
        const ci_el = document.createElement('div');
        ci_el.className = 'citem' + (c.d ? ' cdone' : '');
        const cb = document.createElement('div');
        cb.className = 'cbox'; cb.textContent = '✓';
        cb.onclick = e => {
          e.stopPropagation();
          c.d = !c.d;
          t.mod = Date.now();
          save(); render();
        };
        const ct = document.createElement('span');
        ct.className = 'ctext'; ct.innerHTML = linkify(c.t);
        const cd = document.createElement('button');
        cd.className = 'cdel'; cd.textContent = '✕'; cd.title = 'Удалить подпункт';
        cd.onclick = e => {
          e.stopPropagation();
          t.checks.splice(ci, 1);
          t.mod = Date.now();
          save(); render();
        };
        const cto = document.createElement('button');
        cto.className = 'cdel'; cto.textContent = '↗'; cto.title = 'Сделать отдельной задачей';
        cto.onclick = e => {
          e.stopPropagation();
          const minPos = tasks.length ? Math.min(...tasks.map(x => x.pos || 0)) : 0;
          tasks.push({ id: Date.now(), title: c.t, cat: t.cat, done: false, created: Date.now(), updatedAt: null, mod: Date.now(), pos: minPos - 1 });
          t.checks.splice(ci, 1); t.mod = Date.now();
          save(); render();
        };
        ci_el.append(cb, ct, cto, cd);
        cw.appendChild(ci_el);
      });
      const ckbar = document.createElement('div'); ckbar.className = 'ckbar';
      const ckfill = document.createElement('div'); ckfill.className = 'ckbarf';
      ckfill.style.width = Math.round(t.checks.filter(c => c.d).length / t.checks.length * 100) + '%';
      ckbar.appendChild(ckfill); cw.appendChild(ckbar);
      body.appendChild(cw);
    }

    const meta = document.createElement('div'); meta.className = 'meta';
    if (t.cat) {
      const tag = document.createElement('span');
      tag.className = 'tag cat-' + t.cat; tag.textContent = t.cat;
      meta.appendChild(tag);
      if (t.sub) {
        const stag = document.createElement('span');
        stag.className = 'tag subtag'; stag.innerHTML = subChipHTML(t.cat, t.sub);
        const sc2 = subColorOf(t.cat, t.sub); if (sc2) stag.style.color = themedColor(sc2);
        meta.appendChild(stag);
      }
      if (t.amount && catSumOn(t.cat)) {
        const am = document.createElement('span'); am.className = 'tag amt' + (t.amountSkip ? ' off' : ''); am.textContent = '₽ ' + fmtMoney(t.amount);
        if (t.amountSkip) am.title = 'Не учитывается в общей сумме';
        meta.appendChild(am);
      }
    }
    if (t.repeat) {
      const rp = document.createElement('span');
      rp.className = 'tag'; rp.textContent = '🔁 ' + repName(t.repeat);
      meta.appendChild(rp);
    }
    if (t.checks && t.checks.length) {
      const cc = document.createElement('span');
      cc.className = 'tag';
      cc.textContent = '☑ ' + t.checks.filter(c => c.d).length + '/' + t.checks.length;
      meta.appendChild(cc);
    }
    if (t.due && !t.done) {
      const d = document.createElement('span');
      const cls = dueClass(t);
      d.className = 'due ' + (cls || 'timer');
      d.textContent = '⏳ ' + countdown(t);
      meta.appendChild(d);
    }
    const dAdd = document.createElement('span');
    dAdd.className = 'dates';
    dAdd.textContent = 'доб. ' + fmtDT(t.created);
    meta.appendChild(dAdd);
    if (t.updatedAt) {
      const dUpd = document.createElement('span');
      dUpd.className = 'dates';
      dUpd.textContent = 'изм. ' + fmtDT(t.updatedAt);
      meta.appendChild(dUpd);
    }
    body.appendChild(meta);

    body.onclick = (ev) => {
      if (ev.target.closest('a')) return;
      if (selMode) { if (selIds.has(t.id)) { selIds.delete(t.id); row.classList.remove('selected'); } else { selIds.add(t.id); row.classList.add('selected'); } updateSelBar(); return; }
      if (body.querySelector('.editInput')) return;
      const inp = document.createElement('input');
      inp.className = 'editInput'; inp.value = t.title;
      attachLinkPaste(inp);
      title.replaceWith(inp);
      row.classList.add('editing');
      const editStart = t.updatedAt || 0;

      const panel = document.createElement('div');
      panel.className = 'editPanel';
      const okBtn = document.createElement('button');
      okBtn.className = 'editOk'; okBtn.textContent = '✓ Готово'; okBtn.title = 'Подтвердить изменения';
      okBtn.onmousedown = e => { e.preventDefault(); e.stopPropagation(); };
      okBtn.onclick = e => { e.stopPropagation(); finish(true); };
      panel.appendChild(okBtn);

      const grab = () => {
        const newTitle = inp.value.trim();
        if (newTitle && newTitle !== t.title) { t.title = newTitle; t.updatedAt = Date.now(); t.mod = Date.now(); }
      };

      const ckEl = document.createElement('input');
      ckEl.type = 'text'; ckEl.placeholder = '+ Добавить заметку (Enter)';
      ckEl.className = 'pill editAddNote';
      ckEl.onmousedown = e => e.stopPropagation();
      ckEl.onclick = e => e.stopPropagation();
      const addPendingNote = () => { if (ckEl.value.trim()) { if (!t.checks) t.checks = []; t.checks.push({ t: ckEl.value.trim(), d: false }); ckEl.value = ''; t.updatedAt = Date.now(); t.mod = Date.now(); } };
      ckEl.onkeydown = e => {
        if (e.key === 'Enter' && ckEl.value.trim()) { addPendingNote(); grab(); save(); const id = t.id; render(); const nb = document.querySelector('.task[data-id="' + id + '"] .body'); if (nb) nb.click(); }
        if (e.key === 'Escape') render();
      };
      panel.appendChild(ckEl);

      allCatNames().forEach(c => {
        const chEl = document.createElement('span');
        chEl.className = 'chip cat' + (t.cat === c ? ' on' : '');
        chEl.style.setProperty('--cc', themedColor(catColorOf(c) || '#e53e3e'));
        chEl.innerHTML = catChipHTML(c);
        chEl.onmousedown = e => {
          e.preventDefault(); e.stopPropagation();
          t.cat = (t.cat === c ? null : c); t.sub = null;
          t.updatedAt = Date.now(); t.mod = Date.now();
          grab();
          save(); render();
        };
        panel.appendChild(chEl);
      });
      if (t.cat && subsOf(t.cat).length) {
        const sbr = document.createElement('span'); sbr.className = 'subrow';
        subsOf(t.cat).forEach(sx => {
          const sEl = document.createElement('span');
          sEl.className = 'chip cat subchip' + (t.sub === sx.n ? ' on' : '');
          sEl.style.setProperty('--cc', themedColor(sx.c || catColorOf(t.cat) || '#e53e3e'));
          sEl.innerHTML = subChipHTML(t.cat, sx.n);
          sEl.onmousedown = e => {
            e.preventDefault(); e.stopPropagation();
            t.sub = (t.sub === sx.n ? null : sx.n);
            t.updatedAt = Date.now(); t.mod = Date.now();
            grab();
            save(); render();
          };
          sbr.appendChild(sEl);
        });
        panel.appendChild(sbr);
      }

      const dEl = document.createElement('input');
      dEl.type = 'date'; dEl.value = t.due || '';
      const tmEl = document.createElement('input');
      tmEl.type = 'time'; tmEl.value = t.dueTime || '';
      const dWrap = document.createElement('label');
      dWrap.className = 'pill ico' + (t.due ? ' on' : '');
      dWrap.append('📅', dEl);
      const tmWrap = document.createElement('label');
      tmWrap.className = 'pill ico' + (t.dueTime ? ' on' : '');
      tmWrap.append('⏰', tmEl);
      [dEl, tmEl, dWrap, tmWrap].forEach(el => {
        el.onmousedown = e => e.stopPropagation();
        el.onclick = e => e.stopPropagation();
      });
      dEl.onchange = () => {
        t.due = dEl.value || null;
        t.updatedAt = Date.now(); t.mod = Date.now();
        grab(); save(); render();
      };
      tmEl.onchange = () => {
        t.dueTime = tmEl.value || null;
        if (t.dueTime && !t.due) t.due = todayStr(); // время без даты = сегодня
        t.updatedAt = Date.now(); t.mod = Date.now();
        grab(); save(); render();
      };
      panel.appendChild(dWrap);
      panel.appendChild(tmWrap);
      if (t.cat && catSumOn(t.cat)) {
        const amWrap = document.createElement('label'); amWrap.className = 'pill ico' + (t.amount ? ' on' : '');
        const amEl = document.createElement('input'); amEl.type = 'number'; amEl.min = '0'; amEl.step = 'any'; amEl.inputMode = 'decimal'; amEl.placeholder = 'сумма'; amEl.className = 'amInput'; amEl.value = (t.amount != null ? t.amount : '');
        amWrap.append('₽', amEl);
        amEl.onmousedown = e => e.stopPropagation(); amEl.onclick = e => e.stopPropagation();
        const saveAmount = () => { const v = parseFloat(amEl.value); t.amount = (isNaN(v) || v <= 0) ? undefined : v; amWrap.classList.toggle('on', !!t.amount); t.updatedAt = Date.now(); t.mod = Date.now(); };
        amEl.onchange = () => { saveAmount(); save(); };
        amEl.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveAmount(); finish(true); } };
        panel.appendChild(amWrap);
        const skip = document.createElement('span'); skip.className = 'chip' + (t.amountSkip ? ' on' : ''); skip.textContent = 'не в сумму'; skip.title = 'Не учитывать сумму этой задачи в общем итоге';
        skip.onmousedown = e => { e.preventDefault(); e.stopPropagation(); };
        skip.onclick = e => { e.stopPropagation(); t.amountSkip = !t.amountSkip || undefined; skip.classList.toggle('on', !!t.amountSkip); t.updatedAt = Date.now(); t.mod = Date.now(); save(); };
        panel.appendChild(skip);
      }
      const mkQd = (label, fn) => { const b = document.createElement('span'); b.className = 'chip'; b.textContent = label; b.onmousedown = e => { e.preventDefault(); e.stopPropagation(); }; b.onclick = e => { e.stopPropagation(); fn(); dEl.value = t.due || ''; tmEl.value = t.dueTime || ''; dWrap.classList.toggle('on', !!t.due); tmWrap.classList.toggle('on', !!t.dueTime); t.updatedAt = Date.now(); t.mod = Date.now(); save(); }; panel.appendChild(b); };
      mkQd('Сегодня', () => { t.due = todayStr(); });
      mkQd('Завтра', () => { const dl = new Date(Date.now() + 86400000); t.due = _ymd(dl); t.dueTime = '09:00'; });
      mkQd('+1ч', () => { const base = (t.due && t.dueTime ? deadlineOf(t).getTime() : Date.now()); const dl = new Date(base + 3600000); t.due = _ymd(dl); t.dueTime = _pad2(dl.getHours()) + ':' + _pad2(dl.getMinutes()); });

      // повтор
      const repEl = document.createElement('select');
      repEl.className = 'pill';
      repEl.innerHTML = '<option value="">Без повтора</option><option value="d">🔁 каждый день</option><option value="w">🔁 каждую неделю</option><option value="m">🔁 каждый месяц</option><option value="c">🔁 свой период…</option>';
      if (t.repeat && t.repeat.indexOf('c:') === 0) {
        const co = repEl.querySelector('option[value="c"]');
        if (co) co.text = '🔁 каждые ' + t.repeat.slice(2) + ' дн.';
        repEl.value = 'c';
      } else {
        repEl.value = t.repeat || '';
      }
      repEl.onmousedown = e => e.stopPropagation();
      repEl.onclick = e => e.stopPropagation();
      repEl.onchange = () => {
        if (repEl.value === 'c') {
          const cur = (t.repeat && t.repeat.indexOf('c:') === 0) ? t.repeat.slice(2) : '2';
          const n = parseInt(prompt('Повторять каждые сколько дней?', cur), 10);
          if (n > 0) t.repeat = 'c:' + n;
        } else {
          t.repeat = repEl.value || null;
        }
        if (t.repeat && !t.due) t.due = todayStr();
        t.updatedAt = Date.now(); t.mod = Date.now();
        grab(); save(); render();
      };
      panel.appendChild(repEl);

      body.appendChild(panel);

      inp.focus(); inp.select();
      const finish = ok => {
        if (ok) { addPendingNote(); grab(); if ((t.updatedAt || 0) !== editStart) bumpTop(t); }
        save(); render();
      };
      inp.onkeydown = e => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      };
      const blurGuard = e => {
        if (e.relatedTarget && body.contains(e.relatedTarget)) return;
        finish(true);
      };
      inp.onblur = blurGuard;
      dEl.onblur = blurGuard;
      tmEl.onblur = blurGuard;
      repEl.onblur = blurGuard;
      ckEl.onblur = blurGuard;
    };
    row.appendChild(body);

    if (!isParked(t)) {
      const pin = document.createElement('button');
      pin.className = 'pin';
      pin.textContent = '📌';
      pin.title = t.pinned ? 'Открепить' : 'Закрепить сверху';
      pin.onclick = (e) => {
        e.stopPropagation();
        t.pinned = !t.pinned;
        t.mod = Date.now();
        save(); render();
      };
      row.appendChild(pin);

      const clr = document.createElement('button');
      clr.className = 'clr';
      clr.textContent = '●';
      clr.style.color = themedColor(effColor(t));
      clr.title = 'Цвет задачи';
      clr.onclick = (e) => {
        e.stopPropagation();
        const existed = row.querySelector('.palette');
        closePalettes();
        if (existed) return;
        const pal = document.createElement('div');
        pal.className = 'palette';
        pal.onclick = ev => ev.stopPropagation();
        PALETTE.forEach(c => {
          const dot = document.createElement('div');
          dot.className = 'pdot'
            + (c === null ? ' auto' : '')
            + ((t.color || null) === c ? ' sel' : '');
          dot.style.background = c === null ? (CAT_COLOR[t.cat] || '#ffffff') : c;
          dot.title = c === null ? 'Цвет категории (авто)' : c;
          dot.onclick = ev => {
            ev.stopPropagation();
            t.color = c;
            t.mod = Date.now();
            save(); render();
          };
          pal.appendChild(dot);
        });
        row.appendChild(pal);
      };
      row.appendChild(clr);

      const mv = document.createElement('div');
      mv.className = 'moves';
      const up = document.createElement('button');
      up.className = 'mv'; up.textContent = '▲'; up.title = 'Поднять';
      up.onclick = () => moveTask(t, -1, shown);
      const dn = document.createElement('button');
      dn.className = 'mv'; dn.textContent = '▼'; dn.title = 'Опустить';
      dn.onclick = () => moveTask(t, 1, shown);
      mv.append(up, dn);
      row.appendChild(mv);
    }

    if (t.done && !isArchived(t)) {
      const arcB = document.createElement('button');
      arcB.className = 'arcb'; arcB.textContent = '📦'; arcB.title = 'В архив сразу';
      arcB.onclick = () => {
        t.arc = true; t.mod = Date.now();
        save(); render();
      };
      row.appendChild(arcB);
    }
    if (isArchived(t)) {
      const backB = document.createElement('button');
      backB.className = 'arcb'; backB.textContent = '↩'; backB.title = 'Вернуть в работу';
      backB.onclick = () => {
        t.done = false; t.completedAt = null; t.arc = false; t.mod = Date.now();
        save(); render();
      };
      row.appendChild(backB);
    }

    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '✕'; del.title = 'Удалить';
    del.onclick = () => {
      if (del.dataset.confirm) {
        const removed = t, tomb = { id: t.id, at: Date.now() };
        tasks = tasks.filter(x => x.id !== t.id);
        tombstones.push(tomb);
        save(); render();
        showUndo('Удалено: ' + shortTitle(removed.title), () => {
          tombstones = tombstones.filter(x => x !== tomb);
          tasks.push(removed); save(); render();
        });
        return;
      }
      del.dataset.confirm = '1';
      del.textContent = 'точно?';
      del.classList.add('confirm');
      setTimeout(() => {
        if (!del.isConnected) return;
        delete del.dataset.confirm;
        del.textContent = '✕';
        del.classList.remove('confirm');
      }, 3000);
    };
    row.appendChild(del);

    list.appendChild(row);
  });

  // FLIP: плавно перемещаем строки на новые места
  if (hadAny) {
    list.querySelectorAll('.task').forEach(el => {
      const o = oldPos[el.dataset.id];
      if (o === undefined) { el.classList.add('appear'); return; }
      const n = el.getBoundingClientRect().top;
      const d = o - n;
      if (d) {
        el.style.transition = 'none';
        el.style.transform = 'translateY(' + d + 'px)';
        el.getBoundingClientRect(); // принудительный reflow
        el.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = '';
        el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
      }
    });
  }

  pipRender(); // мини-окно поверх всех показывает то же самое
}

/* --- Поиск --- */
$('searchInput').oninput = () => {
  searchQ = $('searchInput').value;
  render();
};

/* --- Статистика --- */
function dayKey(ts) { return new Date(ts).toDateString(); }
function fillStats() {
  const now = Date.now();
  const day = 86400000;
  const doneT = tasks.filter(t => t.done && t.completedAt);
  const today = doneT.filter(t => dayKey(t.completedAt) === dayKey(now)).length;
  const w = doneT.filter(t => now - t.completedAt < 7 * day).length;
  const m = doneT.filter(t => now - t.completedAt < 30 * day).length;
  const total = doneT.length;
  // серия: подряд идущие дни (заканчивая сегодня/вчера), в каждый из которых что-то выполнено
  const days = new Set(doneT.map(t => dayKey(t.completedAt)));
  let streak = 0;
  let d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const boxes = [
    [today, 'сегодня'],
    [w, 'за 7 дней'],
    [m, 'за 30 дней'],
    [total, 'всего'],
    [streak + (streak ? '🔥' : ''), 'дней подряд']
  ];
  $('statGrid').innerHTML = boxes.map(b =>
    '<div class="statbox"><div class="statnum">' + b[0] + '</div><div class="statlbl">' + b[1] + '</div></div>'
  ).join('');
  const od = tasks.filter(t => dueClass(t) === 'overdue').length;
  $('statStreak').textContent = od
    ? 'Сейчас просрочено: ' + od + '. Разберись с ними — и серия не прервётся.'
    : 'Просроченных нет. Так держать!';
  const N = 14, byDay = []; let maxv = 1;
  for (let i = N - 1; i >= 0; i--) {
    const dd = new Date(now - i * day), key = dd.toDateString();
    const cnt = doneT.filter(t => dayKey(t.completedAt) === key).length;
    if (cnt > maxv) maxv = cnt;
    byDay.push({ d: dd, cnt: cnt });
  }
  $('statChart').innerHTML = '<div class="schart-t">Выполнено за 14 дней</div><div class="schart">' +
    byDay.map(b => '<div class="scol" title="' + b.d.getDate() + ' ' + MONTHS[b.d.getMonth()] + ': ' + b.cnt + '"><div class="scbar" style="height:' + Math.round(b.cnt / maxv * 100) + '%"></div></div>').join('') + '</div>';
  const catCnt = {}; tasks.filter(t => !t.done).forEach(t => { const k = t.cat || 'без категории'; catCnt[k] = (catCnt[k] || 0) + 1; });
  const ents = Object.keys(catCnt).sort((a, b) => catCnt[b] - catCnt[a]);
  $('statCats').innerHTML = ents.length ? '<div class="schart-t">Активные по категориям</div>' + ents.map(k =>
    '<div class="scatrow"><span>' + (k === 'без категории' ? k : ((catEmojiHTML(k, true) ? catEmojiHTML(k, true) + ' ' : '') + esc(k))) + '</span><b>' + catCnt[k] + '</b></div>').join('') : '';
}

function closePanels(except) {
  ['ioPanel', 'syncPanel', 'statsPanel'].forEach(p => {
    if (p !== except) $(p).classList.remove('open');
  });
}
$('statsBtn').onclick = () => {
  closePanels('statsPanel');
  $('statsPanel').classList.toggle('open');
  if ($('statsPanel').classList.contains('open')) fillStats();
};

/* --- Жизненный цикл задачи --- */
function saveLife() {
  localStorage.setItem(LS + '_life', JSON.stringify(life));
}
$('lifeDown').innerHTML =
  '<option value="0">Сразу</option><option value="30">30 минут</option><option value="60">1 час</option>' +
  '<option value="150">2,5 часа</option><option value="300">5 часов</option><option value="600">10 часов</option>' +
  '<option value="1440">1 день</option>';
$('lifeArc').innerHTML =
  '<option value="0">Сразу</option><option value="1440">1 день</option><option value="4320">3 дня</option>' +
  '<option value="10080">7 дней</option><option value="20160">14 дней</option><option value="43200">30 дней</option>' +
  '<option value="-1">Никогда</option>';
$('lifeDown').value = String(life.down);
$('lifeArc').value = String(life.arc);
if ($('lifeDown').selectedIndex < 0) $('lifeDown').value = '150';
if ($('lifeArc').selectedIndex < 0) $('lifeArc').value = '10080';
$('lifeDown').onchange = () => { life.down = parseInt($('lifeDown').value, 10) || 0; saveLife(); render(); };
$('lifeArc').onchange = () => { life.arc = parseInt($('lifeArc').value, 10); saveLife(); render(); };

/* --- Экспорт / импорт --- */
function ioMsg(s) { $('ioMsg').textContent = s; setTimeout(() => { $('ioMsg').textContent = ''; }, 4000); }
function exportStr() { return JSON.stringify({ v: 1, tasks, state }); }
function bakKeys() { return Object.keys(localStorage).filter(k => k.indexOf(LS + '_bak_') === 0).sort(); }
function autoBackup() {
  try { const key = LS + '_bak_' + todayStr(); if (!localStorage.getItem(key)) localStorage.setItem(key, exportStr()); } catch(e) {}
  const ks = bakKeys(); while (ks.length > 7) { try { localStorage.removeItem(ks.shift()); } catch(e) {} }
}
function fillBakSel() {
  const sel = $('bakSel'); if (!sel) return;
  const ks = bakKeys().reverse();
  sel.innerHTML = ks.length ? ks.map(k => '<option value="' + k + '">' + k.replace(LS + '_bak_', '') + '</option>').join('') : '<option value="">нет резервных копий</option>';
}
$('bakRestore').onclick = () => {
  const k = $('bakSel').value; if (!k) return;
  if (!$('bakRestore').dataset.c) { $('bakRestore').dataset.c = '1'; $('bakRestore').textContent = 'точно? (заменит список)'; setTimeout(() => { if ($('bakRestore').isConnected) { delete $('bakRestore').dataset.c; $('bakRestore').textContent = 'Восстановить из бэкапа'; } }, 4000); return; }
  delete $('bakRestore').dataset.c; $('bakRestore').textContent = 'Восстановить из бэкапа';
  try { const data = JSON.parse(localStorage.getItem(k)); if (data && Array.isArray(data.tasks)) { tasks = data.tasks; if (data.state) state = Object.assign(state, data.state); save(); render(); ioMsg('Восстановлено: ' + k.replace(LS + '_bak_', '')); } else ioMsg('Пустая копия'); } catch(e) { ioMsg('Не удалось'); }
};

$('exportBtn').onclick = () => {
  closePanels('ioPanel');
  $('ioPanel').classList.add('open');
  $('ioText').value = exportStr();
  $('ioText').select();
};
$('importBtn').onclick = () => {
  closePanels('ioPanel');
  $('ioPanel').classList.add('open');
  $('ioText').value = '';
  $('ioText').focus();
};
$('copyBtn').onclick = async () => {
  $('ioText').value = exportStr();
  $('ioText').select();
  try { await navigator.clipboard.writeText($('ioText').value); ioMsg('Скопировано в буфер ✓'); }
  catch(e) { document.execCommand('copy'); ioMsg('Скопировано ✓'); }
};
$('dlBtn').onclick = () => {
  const blob = new Blob([exportStr()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'moi-dela-' + todayStr() + '.json';
  a.click();
  ioMsg('Файл скачан ✓');
};
$('fileInput').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { $('ioText').value = r.result; ioMsg('Файл загружен — жми «Импортировать»'); };
  r.readAsText(f);
};
$('applyBtn').onclick = () => {
  let data;
  try { data = JSON.parse($('ioText').value); } catch(e) { ioMsg('Это не похоже на код экспорта'); return; }
  if (!data || !Array.isArray(data.tasks)) { ioMsg('В коде нет задач'); return; }
  if (!del_confirm_io()) return;
  tasks = data.tasks;
  if (data.state) {
    state = Object.assign({ showDone: true, sort: 'manual', catsOpen: false, fCats: [], fSubs: [], fArchive: false, fDone: false, colors: [] }, data.state);
    if (!Array.isArray(state.fCats)) state.fCats = [];
if (!Array.isArray(state.fSubs)) state.fSubs = [];
    if (!Array.isArray(state.colors)) state.colors = [];
  }
  save(); render();
  $('ioPanel').classList.remove('open');
  ioMsg('Импортировано ✓');
};
let ioConfirmArmed = false;
function del_confirm_io() {
  if (ioConfirmArmed) { ioConfirmArmed = false; return true; }
  ioConfirmArmed = true;
  ioMsg('Текущий список будет заменён. Нажми «Импортировать» ещё раз для подтверждения.');
  setTimeout(() => { ioConfirmArmed = false; }, 5000);
  return false;
}

/* --- Облако (npoint.io, старые подключения через jsonbin тоже работают) --- */
const JB = 'https://api.jsonbin.io/v3/b';
// npoint.io — основное хранилище: ключ не нужен, и оно открывается там,
// где jsonbin закрыт. Какое хранилище выбрано, видно по полю sync.np.
const NP = 'https://api.npoint.io';
const PUSH_API = 'https://alextask-push.12dogswog76.workers.dev';
const VAPID_PUB = 'BNrmwMyHC1OFDhFuQZtwHAzbjdeqCzgs4kyy-gGRGpgHPTAMjvPRyGRyKgiryVJAykh2q10MwHMzSadX-2Rx150';
let pushKey = localStorage.getItem(LS + '_pushKey') || '';
let pushOn = localStorage.getItem(LS + '_pushOn') === '1';
let lastRem = {}; try { lastRem = JSON.parse(localStorage.getItem(LS + '_pushRem')) || {}; } catch(e) {}
let pushTimer = null;

function setCloud(cls, tip) {
  const d = $('cloudDot');
  if (d) { d.className = cls || ''; d.title = tip || 'облако не подключено'; }
  const st = $('syncStat'); if (st) st.textContent = tip ? ('☁ ' + tip) : '';
}
function syncMsg(s) { $('syncMsg').textContent = s; }
function syncPayload() { return { v: 1, tasks, tomb: tombstones, cats: catList, catsMod: catsMod, pushKey: pushKey || '', t: Date.now() }; }

function syncUI() {
  const on = !!(sync && (sync.np || (sync.key && sync.bin)));
  $('syncCopyCode').style.display = on ? '' : 'none';
  $('syncNow').style.display = on ? '' : 'none';
  $('syncOff').style.display = on ? '' : 'none';
  $('syncKey').style.display = on ? 'none' : '';
  $('syncConnect').style.display = on ? 'none' : '';
  if ($('npHowTasks')) $('npHowTasks').style.display = on ? 'none' : '';
  $('syncInfo').innerHTML = on
    ? 'Облако подключено ✓ Хранилище: ' + (sync.np ? 'npoint' : 'jsonbin') +
      '. Скопируй код подключения и вставь его в этой же панели на других устройствах.'
    : 'На первом устройстве создай хранилище на npoint.io и вставь ссылку, на остальных — код подключения.';
}

// адрес, заголовки и метод — своё для каждого хранилища
function cloudUrl(forWrite) {
  if (sync && sync.np) return NP + '/' + sync.np;
  return JB + '/' + sync.bin + (forWrite ? '' : '/latest');
}
function cloudHead() {
  return (sync && sync.np) ? { 'Content-Type': 'application/json' }
                           : { 'Content-Type': 'application/json', 'X-Master-Key': sync.key };
}
// таймаут: синхронизация идёт при открытии страницы, и зависший запрос
// иначе держит её целиком
function abortIn(ms) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }

function scheduleSync() {
  if (!sync) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(cloudPush, 1000);
}

async function cloudPush() {
  if (!sync) return;
  setCloud('cloud-sync', 'отправка…');
  try {
    const r = await fetch(cloudUrl(true), {
      method: sync.np ? 'POST' : 'PUT',
      headers: cloudHead(),
      body: JSON.stringify(syncPayload()),
      signal: abortIn(12000)
    });
    if (!r.ok) throw new Error(r.status);
    setCloud('cloud-ok', 'синхронизировано ' + new Date().toTimeString().slice(0,5));
  } catch(e) {
    const why = (e && e.name === 'AbortError') ? 'нет ответа' : ((e && e.message) || 'нет сети');
    setCloud('cloud-err', 'ошибка отправки (' + why + ') — сохранено локально');
  }
}

function mergeData(remote) {
  const rT = (remote && remote.tasks) || [];
  const rTomb = (remote && remote.tomb) || [];
  const tombMap = {};
  tombstones.concat(rTomb).forEach(x => {
    tombMap[x.id] = Math.max(tombMap[x.id] || 0, x.at || 0);
  });
  const byId = {};
  tasks.concat(rT).forEach(t => {
    const m = t.mod || t.created || 0;
    if (tombMap[t.id] && tombMap[t.id] >= m) return; // задача удалена позже, чем менялась
    const ex = byId[t.id];
    if (!ex || (ex.mod || ex.created || 0) < m) byId[t.id] = t;
  });
  tasks = Object.values(byId);
  tombstones = Object.keys(tombMap).map(id => ({ id: +id, at: tombMap[id] }));
  // категории: побеждает более свежий список
  if (remote && Array.isArray(remote.cats) && (remote.catsMod || 0) > catsMod) {
    catList = remote.cats;
    catsMod = remote.catsMod || Date.now();
    localStorage.setItem(LS + '_cats', JSON.stringify(catList));
    localStorage.setItem(LS + '_catsMod', String(catsMod));
    if (typeof renderCatChips === 'function') { try { renderCatChips(); renderCatMgr(); } catch(e) {} }
  }
  if (remote && remote.pushKey && !pushKey) {
    pushKey = remote.pushKey;
    localStorage.setItem(LS + '_pushKey', pushKey);
    try { updatePushUI(); } catch(e) {}
  }
}

async function cloudPull() {
  if (!sync) return;
  setCloud('cloud-sync', 'загрузка…');
  try {
    const r = await fetch(cloudUrl(false), { headers: cloudHead(), signal: abortIn(12000) });
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    // jsonbin заворачивает данные в record, npoint отдаёт их как есть
    const rec = (data && data.record) ? data.record : data;
    const before = JSON.stringify(tasks) + JSON.stringify(tombstones);
    mergeData(rec);
    const after = JSON.stringify(tasks) + JSON.stringify(tombstones);
    localStorage.setItem(LS, JSON.stringify(tasks));
    localStorage.setItem(LS + '_tomb', JSON.stringify(tombstones));
    if (before !== after && !document.querySelector('.editInput')) render();
    const remoteStr = JSON.stringify((rec && rec.tasks) || []);
    if (JSON.stringify(tasks) !== remoteStr) scheduleSync();
    setCloud('cloud-ok', 'синхронизировано ' + new Date().toTimeString().slice(0,5));
  } catch(e) {
    const why = (e && e.name === 'AbortError') ? 'нет ответа' : ((e && e.message) || 'нет сети');
    setCloud('cloud-err', 'ошибка загрузки (' + why + ')');
  }
}

$('syncBtn').onclick = () => {
  const was = $('syncPanel').classList.contains('open');
  closePanels('syncPanel');
  $('syncPanel').classList.toggle('open', !was);
  syncUI();
};
$('syncConnect').onclick = async () => {
  const v = $('syncKey').value.trim();
  if (!v) { syncMsg('Вставь ключ или код.'); return; }
  let conf = null;
  const parse = o => (o && o.n) ? { np: o.n } : ((o && o.k && o.b) ? { key: o.k, bin: o.b } : null);
  if (v[0] === '{') { try { conf = parse(JSON.parse(v)); } catch(e) {} }
  if (!conf && !v.startsWith('$')) { try { conf = parse(JSON.parse(atob(v))); } catch(e) {} }
  // ссылка на npoint или просто его идентификатор
  if (!conf) {
    const m = v.match(/npoint\.io\/(?:docs\/)?([0-9a-zA-Z]{6,})/);
    if (m) conf = { np: m[1] };
    else if (/^[0-9a-f]{16,40}$/i.test(v)) conf = { np: v };
  }
  if (conf) {
    sync = conf;
    localStorage.setItem(LS + '_sync', JSON.stringify(sync));
    syncUI(); syncMsg('Подключаюсь…');
    await cloudPull(); render();
    syncMsg('Готово ✓ Данные объединены с облаком.');
    return;
  }
  // это Master Key — создаём хранилище
  syncMsg('Создаю облачное хранилище…');
  try {
    const r = await fetch(JB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': v, 'X-Bin-Name': 'moi-dela' },
      body: JSON.stringify(syncPayload())
    });
    const data = await r.json();
    if (!r.ok || !data.metadata || !data.metadata.id) throw new Error(data.message || ('код ' + r.status));
    sync = { key: v, bin: data.metadata.id };
    localStorage.setItem(LS + '_sync', JSON.stringify(sync));
    syncUI(); setCloud('cloud-ok', 'подключено');
    syncMsg('Готово ✓ Жми «Скопировать код подключения» и вставь его на других устройствах.');
  } catch(e) {
    syncMsg('Не получилось: ' + e.message + '. Проверь Master Key и интернет.');
  }
};
$('syncCopyCode').onclick = async () => {
  const code = btoa(JSON.stringify(sync.np ? { n: sync.np } : { k: sync.key, b: sync.bin }));
  try { await navigator.clipboard.writeText(code); syncMsg('Код скопирован ✓ Вставь его на другом устройстве в этой же панели.'); }
  catch(e) {
    $('syncKey').style.display = '';
    $('syncKey').value = code;
    $('syncKey').select();
    syncMsg('Скопируй код вручную (Ctrl+C).');
  }
};
$('syncNow').onclick = async () => { syncMsg('Проверяю…'); await cloudPush(); await cloudPull(); syncMsg(''); };
$('syncOff').onclick = () => {
  if (!$('syncOff').dataset.c) {
    $('syncOff').dataset.c = '1';
    $('syncOff').textContent = 'точно отключить?';
    setTimeout(() => { delete $('syncOff').dataset.c; $('syncOff').textContent = 'Отключить облако'; }, 3000);
    return;
  }
  sync = null;
  localStorage.removeItem(LS + '_sync');
  setCloud('', '');
  syncUI(); syncMsg('Облако отключено. Данные остались и тут, и в облаке.');
};

/* Уведомления о письмах из Outlook убраны: функция не пригодилась. */

/* --- Чипы категорий в панели добавления + менеджер категорий --- */
function renderCatChips() {
  const box = $('catChips');
  box.innerHTML = '';
  allCatNames().forEach(n => {
    const c = document.createElement('span');
    c.className = 'chip cat' + (pickedCat === n ? ' on' : '');
    c.dataset.cat = n;
    c.style.setProperty('--cc', themedColor(catColorOf(n) || '#e53e3e'));
    c.innerHTML = catChipHTML(n);
    c.onclick = () => {
      const was = pickedCat === n;
      pickedCat = was ? null : n; pickedSub = null;
      renderCatChips();
    };
    box.appendChild(c);
  });
  if (pickedCat && subsOf(pickedCat).length) {
    const sr = document.createElement('span'); sr.className = 'subrow';
    subsOf(pickedCat).forEach(sx => {
      const sc = document.createElement('span');
      sc.className = 'chip cat subchip' + (pickedSub === sx.n ? ' on' : '');
      sc.style.setProperty('--cc', themedColor(sx.c || catColorOf(pickedCat) || '#e53e3e'));
      sc.innerHTML = subChipHTML(pickedCat, sx.n);
      sc.onclick = () => { pickedSub = (pickedSub === sx.n ? null : sx.n); renderCatChips(); };
      sr.appendChild(sc);
    });
    box.appendChild(sr);
  }
  const divEl = document.createElement('span');
  divEl.className = 'catdiv';
  box.appendChild(divEl);
  const plus = document.createElement('span');
  plus.className = 'chip catmgr' + ($('catMgr').classList.contains('open') ? ' on' : '');
  plus.textContent = '➕ Категории';
  plus.title = 'Добавить или удалить категории';
  plus.onclick = () => {
    $('catMgr').classList.toggle('open');
    renderCatChips();
    renderCatMgr();
  };
  box.appendChild(plus);
}

const EMOJIS = '😀 😁 😂 🤣 😊 😍 😎 🤓 🤔 🤨 😐 😏 😴 🤯 🥳 😤 😡 🥶 😱 🙃 🤝 👍 👎 👊 ✌️ 🤞 👋 💪 🙏 ✍️ 👀 🧠 ❤️ 🧡 💛 💚 💙 💜 🖤 🔥 ⭐ ✨ ⚡ 💥 💯 ✅ ❌ ⚠️ ❗ ❓ 💬 🏠 🏢 🏫 🏥 🏪 🏦 🚗 🚕 🚌 🚲 ✈️ 🚀 ⏰ ⏳ 📅 📆 🗓️ 💻 🖥️ ⌨️ 🖱️ 🖨️ 📱 ☎️ 📞 📡 📷 🎥 📺 🎮 🎧 🎵 🎤 💡 🔌 🔋 🛠️ 🔧 🔨 ⚙️ 🧰 🪛 🪚 📦 📁 🗂️ 📂 📋 📌 📍 ✂️ 📏 ✏️ 🖊️ 📝 📄 📑 📊 📈 📉 💰 💸 💳 🪙 💵 🛒 🛍️ 🎁 🍔 🍕 🍣 ☕ 🍺 🥤 🏋️ ⚽ 🏀 🎯 🎲 ♟️ 🧩 🧹 🧺 🧼 🐶 🐱 🐾 🌳 🌹 🌞 🌙 ❄️ ☔ 🌈 🎓 📚 🔑 🔒 🔓 🚪 🧾 🗑️ 🚩 🏁 🎖️ 🏆'.split(' ');
let cmEmoji = '😀';
let cmEditing = null; // имя категории, которую сейчас редактируем
let cmEditingParent = null; // если редактируем подкатегорию — её родитель
let cmSum = false; // считать ли сумму у задач этой категории
let emojiGridBuilt = false;

function pickerHTML(e) {
  if (e === '__syn') return SYNERGY_MINI;
  if (e === '__claude') return CLAUDE_MINI;
  if (e && e.indexOf('dev:') === 0) return '<img src="' + DEV_CDN + e.slice(4) + '.svg" style="width:16px;height:16px;vertical-align:-3px">';
  return e || '😀';
}
function cmReset() {
  cmEditing = null;
  cmEditingParent = null;
  cmEmoji = '😀';
  $('cmEmojiBtn').innerHTML = '😀';
  $('cmName').value = '';
  $('cmName').placeholder = 'название категории';
  $('cmColor').value = '';
  if ($('cmParent')) $('cmParent').value = '';
  cmSum = false; cmSumUI();
  $('cmAdd').textContent = '➕ Категорию';
}
function cmSumUI() { const b = $('cmSumBtn'); if (b) b.classList.toggle('on', !!cmSum); }
if ($('cmSumBtn')) $('cmSumBtn').onclick = () => { cmSum = !cmSum; cmSumUI(); };
// варианты цвета категории
$('cmColor').innerHTML = '<option value="">цвет: авто</option>' +
  COLORS.map(c => '<option value="' + c[0] + '" style="color:' + c[0] + '">' + c[1] + '</option>').join('');

// иконки с github.com/xandemon/developer-icons (v7.0.1) — полный набор репозитория, грузятся с CDN
const DEV_ICONS = ['android','angular','ansible','anthropic','anthropic-basic-light','apache','apple-dark','apple-light','appwrite','arc','astro','atlassian','atom','auth0','avajs','axiom','azure','babel','backbonejs','bard','bash','bing','biome','bitbucket','bitnami','blueprintjs','bluesky','bootstrap4','bootstrap5','brave','bulmaui','bunjs','c','c-plus-plus','c-sharp','cakephp','canva','cassandradb','chakraui','chatgpt','chrome','chromium','circleci','claude-ai','clerk','clickhouse','clojure','cloudflare','cloudinary','codefresh','codeigniter','convex','copilot','crystal','css','css3','cypress','dart','datadog','deepseek','deno','deno-fresh','developer-icons','digitalocean','discord','django','dlang','docker','doctrine','docusaurus','dovetail','ec2','edge','elastic','electron','elementui','elixir','ember','erlang','esbuild','eslint','expressjs-dark','expressjs-light','facebook','fast-api','faunadb','figma','firebase','firefox','flask-dark','flask-light','flutter','flyio','framer-dark','framer-light','gatsby','git','github-copilot','github-dark','github-light','gitlab','gmail','go','google','google-cloud','grafana','grafbase','graphite','graphql','gridsome','gruntjs','gulp','hashnode','haskell','headlessui','heroku','hexo','hhvm','homebrew','hotjar','html5','hugging-face','hyper2','i18next','indesign','insomnia','instagram','internet-explorer','invision','ionic','jamstack','java','javascript','jenkins','jest','jira','jquery','jslint','json','k6','kafka','kibana','kotlin','kubernetes','laravel','lerna-dark','lerna-light','less','lightroom','linkedin','linux','lit','liveblocks','logrocket','lokalise','lua','lunacy','mariadb','marionette','markdown','mastodon','materialui','messenger','meta','microsoft','microsoft-sql-server','microsoft-sql-server-2','miro','mochajs','mongodb','mozilla','mysql','neovim','nestjs','netlify','netlify2','nextjs','nim','nodejs','notion','npm','numpy','nuxtjs','nx','ocaml','onedrive','openai','opera','oracle','outlook','pandacss','photoshop','php','pinia','pinterest','pixijs','playwright','pnpm-dark','pnpm-light','postgresql','postman','powershell','preact','presto','prettier','prisma','pugjs','pulumi','pwa','python','pytorch','pytorch3d','qwik','r','radixui','rails','railway','react-query','reactjs','reactrouter','reddit','redhat','redis','redux','redux-saga','remix-dark','remix-light','render','rollup','ruby','rust-dark','rust-light','safari','sass','scala','semanticui','serverless','shadcnui','shopware','sketch','sketch2','skype','slack','solidity','solidjs','spring','storyblok','storybook','stream','stylelint','sublime','supabase','sveltejs','swagger','swift','symfony-dark','symfony-light','tailwindcss','telegram','tensorflow','terraform','threads-dark','threads-light','threejs-dark','threejs-light','tiktok','tor','tRPC','twitter','typescript','ubuntu','unjs','upwork','upwork-basic','vagrant','vercel-dark','vercel-light','vim','visualbasic','vitejs','vitest','vivaldi','vk','vscode','vuejs','webassembly','webpack','webrtc','whatsapp','wordpress','x-dark','x-light','xamarin','xd','yoga','youtube','zen','zod'];

function pickIcon(val, html, cell) {
  cmEmoji = val;
  $('cmEmojiBtn').innerHTML = html;
  $('emojiGrid').querySelectorAll('.em.sel').forEach(x => x.classList.remove('sel'));
  if (cell) cell.classList.add('sel');
  $('emojiGrid').classList.remove('open');
  $('cmName').focus();
}

function buildEmojiGrid() {
  if (emojiGridBuilt) return;
  emojiGridBuilt = true;
  const g = $('emojiGrid');
  g.innerHTML = '<div class="emtabs"><span class="emtab on" data-t="dev">💻 Иконки</span><span class="emtab" data-t="emo">😀 Эмодзи</span></div><div class="egrid" id="gridDev"></div><div class="egrid" id="gridEmo" style="display:none"></div>';
  const gd = $('gridDev'), ge = $('gridEmo');
  // лого Синергии — первой иконкой
  const syn = document.createElement('span');
  syn.className = 'em';
  syn.title = 'Синергия';
  syn.innerHTML = SYNERGY_LOGO.replace('width="19" height="19" style="display:block"', 'width="22" height="22"');
  syn.onclick = () => pickIcon('__syn', SYNERGY_MINI, syn);
  gd.appendChild(syn);
  const cla = document.createElement('span');
  cla.className = 'em';
  cla.title = 'Claude';
  cla.innerHTML = CLAUDE_LOGO.replace('width="19" height="19" style="display:block"', 'width="22" height="22"');
  cla.onclick = () => pickIcon('__claude', CLAUDE_MINI, cla);
  gd.appendChild(cla);
  DEV_ICONS.forEach(n => {
    const cell = document.createElement('span');
    cell.className = 'em';
    cell.title = n;
    cell.innerHTML = '<img loading="lazy" src="' + DEV_CDN + n + '.svg" alt="' + n + '" style="width:22px;height:22px" data-hidep="1" data-wide="1.45">';
    cell.onclick = () => pickIcon('dev:' + n, '<img src="' + DEV_CDN + n + '.svg" style="width:16px;height:16px;vertical-align:-3px">', cell);
    gd.appendChild(cell);
  });
  EMOJIS.forEach(e => {
    const cell = document.createElement('span');
    cell.className = 'em';
    cell.textContent = e;
    cell.onclick = () => pickIcon(e, e, cell);
    ge.appendChild(cell);
  });
  g.querySelectorAll('.emtab').forEach(tb => {
    tb.onclick = () => {
      g.querySelectorAll('.emtab').forEach(x => x.classList.remove('on'));
      tb.classList.add('on');
      gd.style.display = tb.dataset.t === 'dev' ? '' : 'none';
      ge.style.display = tb.dataset.t === 'emo' ? '' : 'none';
    };
  });
}
$('cmEmojiBtn').onclick = () => {
  buildEmojiGrid();
  $('emojiGrid').classList.toggle('open');
};

function renderCatMgr() {
  const l = $('cmList');
  l.innerHTML = '';
  const mkRow = (c, sub) => {
    const it = document.createElement('span');
    it.className = 'cmitem' + (sub ? ' cmsub' : '');
    const lbl = document.createElement('span');
    lbl.innerHTML = (sub ? subChipHTML(c.parent, c.n) : catChipHTML(c.n)) + (c.sum ? ' <span style="opacity:.55">₽</span>' : '');
    const ed = document.createElement('button');
    const editingThis = cmEditing === c.n && cmEditingParent === (c.parent || null);
    ed.className = 'cmedit' + (editingThis ? ' on' : '');
    ed.textContent = '✎'; ed.title = 'Редактировать';
    ed.onclick = () => {
      if (editingThis) { cmReset(); renderCatMgr(); return; }
      cmEditing = c.n;
      cmEditingParent = c.parent || null;
      cmEmoji = c.e;
      $('cmEmojiBtn').innerHTML = pickerHTML(c.e);
      $('cmName').value = c.n;
      $('cmColor').value = c.c || '';
      if ($('cmParent')) $('cmParent').value = c.parent || '';
      cmSum = !!c.sum; cmSumUI();
      $('cmAdd').textContent = '💾 Сохранить';
      $('cmName').focus();
      renderCatMgr();
    };
    const del = document.createElement('button');
    del.className = 'cmdel'; del.textContent = '✕'; del.title = 'Удалить';
    del.onclick = () => {
      if (!del.dataset.c) {
        del.dataset.c = '1'; del.textContent = 'точно?'; del.classList.add('confirm');
        setTimeout(() => {
          if (!del.isConnected) return;
          delete del.dataset.c; del.textContent = '✕'; del.classList.remove('confirm');
        }, 3000);
        return;
      }
      if (sub) {
        catList = catList.filter(x => !(x.parent === c.parent && x.n === c.n));
        tasks.forEach(t => { if (t.cat === c.parent && t.sub === c.n) { t.sub = null; t.mod = Date.now(); } });
        state.fSubs = (state.fSubs || []).filter(x => x !== c.parent + '\u0001' + c.n);
        if (pickedCat === c.parent && pickedSub === c.n) pickedSub = null;
      } else {
        catList = catList.filter(x => x.n !== c.n && x.parent !== c.n);
        tasks.forEach(t => { if (t.cat === c.n) { t.cat = null; t.sub = null; t.mod = Date.now(); } });
        state.fCats = state.fCats.filter(x => x !== c.n);
        state.fSubs = (state.fSubs || []).filter(x => x.indexOf(c.n + '\u0001') !== 0);
        if (pickedCat === c.n) { pickedCat = null; pickedSub = null; }
      }
      if (cmEditing === c.n && cmEditingParent === (c.parent || null)) cmReset();
      saveCats(); save();
      renderCatChips(); renderCatMgr(); render();
    };
    it.append(lbl, ed, del);
    l.appendChild(it);
  };
  topCats().forEach((c, gi) => {
    if (gi) { const br = document.createElement('span'); br.className = 'cmbreak'; l.appendChild(br); }
    mkRow(c, false);
    subsOf(c.n).forEach(sx => mkRow(sx, true));
    const composing = !cmEditing && $('cmParent') && $('cmParent').value === c.n;
    const add = document.createElement('span');
    add.className = 'cmaddsub' + (composing ? ' on' : '');
    add.textContent = composing ? '+ название выше, затем «➕ Подкатегория»' : '+ Добавить подкатегорию';
    add.onclick = () => {
      const was = composing;
      cmReset();
      if (!was) {
        $('cmParent').value = c.n;
        $('cmName').placeholder = 'подкатегория в «' + c.n + '»';
        $('cmAdd').textContent = '➕ Подкатегория';
        $('cmName').focus();
      }
      renderCatMgr();
    };
    l.appendChild(add);
  });
}
$('cmAdd').onclick = () => {
  const n = $('cmName').value.trim();
  if (!n) { $('cmName').focus(); return; }
  const parentSel = ($('cmParent') && $('cmParent').value) || null;
  const dupMsg = () => { $('cmName').value = ''; $('cmName').placeholder = 'такая уже есть'; };

  if (cmEditing) {
    if (cmEditingParent) {
      // редактирование подкатегории (родитель не меняется)
      if (subsOf(cmEditingParent).some(x => x.n.toLowerCase() === n.toLowerCase() && x.n !== cmEditing)) { dupMsg(); return; }
      const entry = subEntry(cmEditingParent, cmEditing);
      if (entry) {
        if (n !== cmEditing) {
          tasks.forEach(t => { if (t.cat === cmEditingParent && t.sub === cmEditing) { t.sub = n; t.mod = Date.now(); } });
          state.fSubs = (state.fSubs || []).map(x => x === cmEditingParent + '\u0001' + cmEditing ? cmEditingParent + '\u0001' + n : x);
          if (pickedCat === cmEditingParent && pickedSub === cmEditing) pickedSub = n;
          entry.n = n;
        }
        entry.e = cmEmoji;
        entry.c = $('cmColor').value || null; entry.sum = cmSum || undefined;
        saveCats(); save();
      }
    } else {
      // редактирование верхней категории
      if (topCats().some(x => x.n.toLowerCase() === n.toLowerCase() && x.n !== cmEditing)) { dupMsg(); return; }
      const entry = catList.find(x => x.n === cmEditing && !x.parent);
      if (entry) {
        if (n !== cmEditing) {
          tasks.forEach(t => { if (t.cat === cmEditing) { t.cat = n; t.mod = Date.now(); } });
          catList.forEach(x => { if (x.parent === cmEditing) x.parent = n; });
          state.fCats = state.fCats.map(x => x === cmEditing ? n : x);
          state.fSubs = (state.fSubs || []).map(x => x.indexOf(cmEditing + '\u0001') === 0 ? n + x.slice(cmEditing.length) : x);
          if (pickedCat === cmEditing) pickedCat = n;
          if (pipCat === cmEditing) { pipCat = n; localStorage.setItem(LS + '_pipCat', pipCat); }
          entry.n = n;
        }
        entry.e = cmEmoji;
        entry.c = $('cmColor').value || null; entry.sum = cmSum || undefined;
        saveCats(); save();
      }
    }
    cmReset();
  } else {
    // создание
    if (parentSel) {
      if (subsOf(parentSel).some(x => x.n.toLowerCase() === n.toLowerCase())) { dupMsg(); return; }
      catList.push({ n: n, e: cmEmoji, c: $('cmColor').value || null, parent: parentSel, sum: cmSum || undefined });
    } else {
      if (topCats().some(x => x.n.toLowerCase() === n.toLowerCase())) { dupMsg(); return; }
      catList.push({ n: n, e: cmEmoji, c: $('cmColor').value || null, sum: cmSum || undefined });
    }
    cmReset();
    saveCats();
  }
  renderCatChips(); renderCatMgr(); render();
};
$('cmName').onkeydown = e => {
  if (e.key === 'Enter') $('cmAdd').onclick();
  if (e.key === 'Escape') { cmReset(); renderCatMgr(); }
};
renderCatChips();
{
  const amb = $('addMoreBtn');
  if (amb) amb.onclick = () => {
    const box = amb.closest('.addbox');
    const open = box.classList.toggle('moreopen');
    amb.textContent = '📅 Срок, заметка, повтор ' + (open ? '▴' : '▾');
  };
}
['dateInput','timeInput'].forEach(i => {
  $(i).onchange = e => {
    e.target.parentElement.classList.toggle('on', !!e.target.value);
  };
});
function _pad2(n){return String(n).padStart(2,'0');}
function _ymd(dl){return dl.getFullYear()+'-'+_pad2(dl.getMonth()+1)+'-'+_pad2(dl.getDate());}
function _markDL(){ $('dateInput').parentElement.classList.toggle('on', !!$('dateInput').value); $('timeInput').parentElement.classList.toggle('on', !!$('timeInput').value); }
$('qdToday').onclick = () => { $('dateInput').value = todayStr(); $('timeInput').value = ''; _markDL(); $('taskInput').focus(); };
$('qdTom').onclick = () => { const dl = new Date(Date.now() + 86400000); $('dateInput').value = _ymd(dl); $('timeInput').value = '09:00'; _markDL(); $('taskInput').focus(); };
$('qd1h').onclick = () => { const dl = new Date(Date.now() + 3600000); $('dateInput').value = _ymd(dl); $('timeInput').value = _pad2(dl.getHours()) + ':' + _pad2(dl.getMinutes()); _markDL(); $('taskInput').focus(); };
let addRepN = 2; // свой период повтора (дней) для новой задачи
$('repInput').onchange = e => {
  const co = [...e.target.options].find(o => o.value === 'c');
  if (e.target.value === 'c') {
    const n = parseInt(prompt('Повторять каждые сколько дней?', String(addRepN)), 10);
    if (n > 0) {
      addRepN = n;
      if (co) co.text = '🔁 каждые ' + n + ' дн.';
    } else {
      e.target.value = '';
      if (co) co.text = '🔁 свой период…';
    }
  } else if (co) {
    co.text = '🔁 свой период…';
  }
  e.target.classList.toggle('on', !!e.target.value);
};
$('addBtn').onclick = addTask;
$('taskInput').onkeydown = e => { if (e.key === 'Enter') addTask(); };
function updateSelBar() {
  let bar = document.getElementById('selBar');
  if (!selMode) { if (bar) bar.classList.remove('show'); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'selBar'; document.body.appendChild(bar); }
  bar.innerHTML = '';
  const info = document.createElement('span'); info.textContent = 'Выбрано: ' + selIds.size; bar.appendChild(info);
  const sel = [...selIds];
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = fn; bar.appendChild(b); };
  const exit = () => { selMode = false; selIds.clear(); };
  mkBtn('Выполнить', () => { sel.forEach(id => { const t = tasks.find(x => x.id === id); if (t && !t.done) { t.done = true; t.completedAt = Date.now(); t.mod = Date.now(); spawnRepeat(t); } }); exit(); save(); render(); updateSelBar(); });
  mkBtn('Удалить', () => { const rem = []; sel.forEach(id => { const t = tasks.find(x => x.id === id); if (t) { rem.push(t); tombstones.push({ id: id, at: Date.now() }); } }); tasks = tasks.filter(x => !selIds.has(x.id)); exit(); save(); render(); updateSelBar(); if (rem.length) showUndo('Удалено: ' + rem.length, () => { rem.forEach(t => { tombstones = tombstones.filter(z => z.id !== t.id); tasks.push(t); }); save(); render(); }); });
  const catSel = document.createElement('select');
  let copts = '<option value="">Категория…</option>';
  topCats().forEach(c => {
    copts += '<option value="' + esc(c.n) + '">' + esc(c.n) + '</option>';
    subsOf(c.n).forEach(sx => { copts += '<option value="' + esc(c.n) + '\u0001' + esc(sx.n) + '">\u00A0\u00A0› ' + esc(sx.n) + '</option>'; });
  });
  copts += '<option value="__none">без категории</option>';
  catSel.innerHTML = copts;
  catSel.onchange = () => {
    const v = catSel.value; if (!v) return;
    sel.forEach(id => { const t = tasks.find(x => x.id === id); if (t) {
      if (v === '__none') { t.cat = null; t.sub = null; }
      else if (v.indexOf('\u0001') >= 0) { const p = v.split('\u0001'); t.cat = p[0]; t.sub = p[1]; }
      else { t.cat = v; t.sub = null; }
      t.mod = Date.now();
    } });
    exit(); save(); render(); updateSelBar();
  };
  bar.appendChild(catSel);
  mkBtn('Снять', () => { exit(); render(); updateSelBar(); });
  bar.classList.add('show');
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (selMode) { selMode = false; selIds.clear(); render(); updateSelBar(); } else if (searchQ) { searchQ = ''; $('searchInput').value = ''; render(); } return; }
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
  if (e.code === 'KeyN') { e.preventDefault(); $('taskInput').focus(); }
  else if (e.code === 'Slash') { e.preventDefault(); $('searchInput').focus(); }
});
attachLinkPaste($('taskInput'));
attachLinkPaste($('noteInput'));

/* --- Уведомления --- */
const NOTIF_ICON = 'icon.svg';
let notifOn = localStorage.getItem(LS + '_notif') === '1';
let notified = {};
try { notified = JSON.parse(localStorage.getItem(LS + '_notified')) || {}; } catch(e) {}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.update();
    setInterval(() => reg.update(), 600000); // ищем обновление раз в 10 минут
  }).catch(() => {});
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swReloaded) return; swReloaded = true; location.reload(); // новая версия активировалась — обновляемся
  });
}

function notifLabel() {
  const b = $('notifBtn');
  if (!('Notification' in window)) { b.style.display = 'none'; return; }
  if (Notification.permission === 'denied') {
    b.textContent = '🔕 Уведомления заблокированы';
    return;
  }
  b.textContent = (notifOn && Notification.permission === 'granted')
    ? '🔔 Уведомления: вкл'
    : '🔕 Уведомления: выкл';
}

async function showNotif(title, body) {
  try {
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) {
      reg.showNotification(title, { body, icon: NOTIF_ICON, badge: NOTIF_ICON });
      return;
    }
  } catch(e) {}
  try { new Notification(title, { body, icon: NOTIF_ICON }); } catch(e) {}
}

$('notifBtn').onclick = async () => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') { notifLabel(); return; }
  if (!notifOn || Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p === 'granted') {
      notifOn = true;
      localStorage.setItem(LS + '_notif', '1');
      showNotif('Уведомления включены ✓', 'Предупрежу за 30 минут до дедлайна и в момент истечения. Держи вкладку открытой.');
    }
  } else {
    notifOn = false;
    localStorage.setItem(LS + '_notif', '');
  }
  notifLabel();
};

/* --- Web Push (Cloudflare worker): push при закрытом сайте --- */
function urlB64ToU8(s) { const pad = '='.repeat((4 - s.length % 4) % 4); const b = (s + pad).replace(/-/g,'+').replace(/_/g,'/'); const raw = atob(b); const u = new Uint8Array(raw.length); for (let i=0;i<raw.length;i++) u[i]=raw.charCodeAt(i); return u; }
// Ключ уведомлений — единственное, что отделяет твои push от чужих: кто его
// знает, тот может слать тебе уведомления. Math.random для такого не годится,
// её поток восстанавливается по нескольким выданным значениям.
function randKey(n) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = new Uint8Array(n);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  let out = ''; for (let i = 0; i < n; i++) out += abc[b[i] % abc.length];
  return out;
}
function ensurePushKey() {
  if (!pushKey) { pushKey = 'pk' + randKey(14); localStorage.setItem(LS + '_pushKey', pushKey); scheduleSync(); }
  return pushKey;
}
function updatePushUI() {
  const ob = $('pushOnBtn'); if (!ob) return;
  const fb = $('pushOffBtn'), ki = $('pushKeyInput');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { ob.style.display = 'none'; if ($('pushInfo')) $('pushInfo').textContent = '🔔 Этот браузер не поддерживает push-уведомления.'; return; }
  ob.style.display = pushOn ? 'none' : '';
  if (fb) fb.style.display = pushOn ? '' : 'none';
  if (ki) ki.value = pushKey || '';
}
function pushMsg(s) { if ($('pushMsg')) $('pushMsg').textContent = s; }
async function enablePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { pushMsg('Браузер не поддерживает push.'); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { pushMsg('Нет разрешения на уведомления.'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(VAPID_PUB) });
    ensurePushKey();
    const r = await fetch(PUSH_API + '/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ subscription: sub.toJSON(), pushKey }) });
    if (!r.ok) { pushMsg('Ошибка воркера: ' + r.status + ' (проверь привязку KV = PUSH)'); return; }
    pushOn = true; localStorage.setItem(LS + '_pushOn', '1');
    updatePushUI(); pushMsg('Push включён ✓ Напоминания о дедлайнах будут приходить при закрытом сайте.');
    lastRem = {}; pushSyncReminders();
  } catch (e) { pushMsg('Не удалось: ' + ((e && e.message) || e)); }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { try { await fetch(PUSH_API + '/unsubscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ endpoint: sub.endpoint, pushKey }) }); } catch(e) {} await sub.unsubscribe(); }
  } catch (e) {}
  pushOn = false; localStorage.setItem(LS + '_pushOn', '');
  updatePushUI(); pushMsg('Push выключен на этом устройстве.');
}
function reminderList() {
  const now = Date.now();
  return tasks.filter(t => !t.done && t.due && t.dueTime && deadlineOf(t).getTime() > now + 5000)
    .map(t => ({ id: String(t.id), at: deadlineOf(t).getTime(), title: '⏳ Дедлайн: ' + t.title, body: t.cat || '' }));
}
function pushSyncReminders() {
  if (!pushOn || !pushKey) return;
  const want = {}; reminderList().forEach(r => { want[r.id] = r; });
  Object.keys(lastRem).forEach(id => { if (!want[id]) { fetch(PUSH_API + '/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pushKey, taskId: id }) }).catch(()=>{}); delete lastRem[id]; } });
  Object.keys(want).forEach(id => { const r = want[id]; const sig = r.at + '|' + r.title; if (lastRem[id] !== sig) { fetch(PUSH_API + '/schedule', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pushKey, taskId: id, at: r.at, title: r.title, body: r.body, url: 'https://alextask.ru' }) }).catch(()=>{}); lastRem[id] = sig; } });
  try { localStorage.setItem(LS + '_pushRem', JSON.stringify(lastRem)); } catch(e) {}
}
let pushRemTimer = null;
function schedulePushRem() { if (!pushOn) return; clearTimeout(pushRemTimer); pushRemTimer = setTimeout(pushSyncReminders, 1500); }
if ($('pushOnBtn')) $('pushOnBtn').onclick = enablePush;
if ($('pushOffBtn')) $('pushOffBtn').onclick = disablePush;
if ($('pushKeyCopy')) $('pushKeyCopy').onclick = async () => { ensurePushKey(); const ki = $('pushKeyInput'); if (ki) ki.value = pushKey; try { await navigator.clipboard.writeText(pushKey); pushMsg('push-ключ скопирован ✓'); } catch(e) { if (ki) { ki.select(); document.execCommand('copy'); } pushMsg('Скопировано ✓'); } };
if ($('pushKeyApply')) $('pushKeyApply').onclick = async () => {
  const v = (($('pushKeyInput').value) || '').trim();
  if (!v) { pushMsg('Вставь ключ в поле выше.'); return; }
  pushKey = v; localStorage.setItem(LS + '_pushKey', pushKey); scheduleSync();
  if (pushOn) {
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(VAPID_PUB) });
      await fetch(PUSH_API + '/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ subscription: sub.toJSON(), pushKey }) });
      lastRem = {}; pushSyncReminders();
      pushMsg('Ключ применён, устройство переподписано ✓ Этот же ключ ставь везде и в макрос.');
    } catch(e) { pushMsg('Ключ сохранён, но переподписка не удалась: ' + ((e && e.message) || e)); }
  } else {
    pushMsg('Ключ сохранён. Включи push, чтобы устройство получало уведомления по нему.');
  }
  updatePushUI();
};
updatePushUI();
if (pushOn) setTimeout(pushSyncReminders, 2500);

function checkDeadlines() {
  if (!notifOn || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  let changed = false;
  tasks.forEach(t => {
    if (t.done || !t.due) return;
    const dl = deadlineOf(t).getTime();
    const pre = dl - 30 * 60000;
    // за 30 минут до дедлайна
    if (now >= pre && now < dl && !notified['p' + t.id]) {
      notified['p' + t.id] = now;
      changed = true;
      showNotif('⏳ Через 30 минут', t.title);
    }
    // в момент истечения
    if (dl <= now && !notified[t.id]) {
      notified[t.id] = now;
      changed = true;
      showNotif('⏰ Время вышло', t.title);
    }
    // дедлайн перенесли вперёд — сможем уведомить снова
    if (dl > now && notified[t.id]) { delete notified[t.id]; changed = true; }
    if (pre > now && notified['p' + t.id]) { delete notified['p' + t.id]; changed = true; }
  });
  if (changed) localStorage.setItem(LS + '_notified', JSON.stringify(notified));
}
setInterval(checkDeadlines, 30000);
setTimeout(checkDeadlines, 4000); // первая проверка после загрузки и подтяжки облака

/* --- Предложение включить уведомления (один раз) --- */
function maybeAskNotif() {
  if (localStorage.getItem(LS + '_notifAsked')) return;
  if (!('Notification' in window)) return;
  if (notifOn || Notification.permission === 'denied') return;
  $('askNotif').classList.add('open');
}
$('askYes').onclick = async () => {
  localStorage.setItem(LS + '_notifAsked', '1');
  $('askNotif').classList.remove('open');
  const p = await Notification.requestPermission();
  if (p === 'granted') {
    notifOn = true;
    localStorage.setItem(LS + '_notif', '1');
    showNotif('Уведомления включены ✓', 'Предупрежу за 30 минут до дедлайна и в момент истечения.');
  }
  notifLabel();
};
$('askLater').onclick = () => {
  localStorage.setItem(LS + '_notifAsked', '1');
  $('askNotif').classList.remove('open');
};

/* --- Мини-окно поверх всех программ (Document Picture-in-Picture, Chrome на ПК) --- */
let pipWin = null;
const PIP_CSS = [
  '* { box-sizing:border-box; margin:0; padding:0; }',
  "body { background:#0f1115; color:#e8eaf0; font-family:-apple-system,'Segoe UI',Roboto,sans-serif; padding:10px; }",
  'body.compact { padding:6px; }',
  '#pipHead { display:flex; align-items:center; gap:6px; margin-bottom:8px; }',
  '#pipTitle { font-size:13px; font-weight:700; flex:1; line-height:1.2; }',
  '#pipTitle .sub { display:block; font-size:10.5px; font-weight:400; color:#9aa0ae; margin-top:1px; }',
  '#pipTitle .od { color:#ff8b8b; }',
  '.phbtn { background:#1c1e24; border:1px solid #2c3038; border-radius:8px; color:#aab0c0; cursor:pointer; font-size:12px; padding:5px 8px; line-height:1; }',
  '.phbtn:hover { color:#fff; border-color:#e53e3e; }',
  '.phbtn.on { color:#ff9d9d; border-color:#e53e3e; background:#e53e3e22; }',
  '.pm { display:flex; gap:7px; align-items:flex-start; background:#1c1e24; border:1px solid #2c3038; border-radius:8px; padding:7px 8px; margin-bottom:5px; }',
  '.pmsrc { font-size:9.5px; font-weight:700; border-radius:5px; padding:1px 6px; white-space:nowrap; }',
  '.pmsrc.jira { background:#1e6fd933; color:#7fb8ff; }',
  '.pmsrc.person { background:#4caf7d22; color:#8fd6a8; }',
  '.pmtext { flex:1; min-width:0; }',
  '.pmsubj { font-size:12px; line-height:1.25; }',
  '.pmfrom { font-size:10px; color:#9aa0ae; margin-top:2px; }',
  '.pmprev { font-size:10px; color:#aab1bf; margin-top:2px; line-height:1.25; }',
  '.pmread { background:none; border:1px solid #424650; border-radius:5px; color:#9aa0ae; cursor:pointer; font-size:11px; padding:1px 6px; }',
  '.pmread:hover { color:#8fd6a8; border-color:#4caf7d; }',
  '.pmempty { color:#777d8a; font-size:11.5px; text-align:center; padding:8px 0; }',
  '#pipAdd { display:flex; gap:5px; margin-bottom:8px; }',
  '#pipInput { flex:1; background:#121317; border:1px solid #33363e; border-radius:8px; color:#e8eaf0; font-size:13px; padding:8px 10px; outline:none; min-width:0; }',
  '#pipInput:focus { border-color:#e53e3e; }',
  '#pipDue { background:#1c1e24; border:1px solid #424650; border-radius:8px; color:#aab0c0; font-size:10.5px; padding:0 4px; outline:none; }',
  '#pipSearch { width:100%; background:#1c1e24; border:1px solid #33363e; border-radius:8px; color:#e8eaf0; font-size:12px; padding:7px 10px; outline:none; margin-bottom:8px; }',
  '#pipSearch:focus { border-color:#e53e3e; }',
  '#pipTop { display:flex; gap:5px; margin-bottom:6px; align-items:center; flex-wrap:wrap; }',
  '#pipCats { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }',
  '#pipColors { display:flex; gap:5px; margin-bottom:8px; align-items:center; flex-wrap:wrap; }',
  '.pchip { font-size:11px; color:#aab0c0; border:1px solid #424650; border-radius:999px; padding:3px 9px; cursor:pointer; user-select:none; }',
  '.pchip.on { background:#e53e3e22; border-color:#e53e3e; color:#ff9d9d; }',
  '.psel { background:#1c1e24; border:1px solid #424650; border-radius:999px; color:#aab0c0; font-size:10.5px; padding:3px 6px; outline:none; }',
  '.pdotf { width:21px; height:21px; border-radius:50%; cursor:pointer; border:2px solid transparent; display:inline-flex; align-items:center; justify-content:center; font-size:9.5px; font-weight:700; color:#15171c; line-height:1; }',
  '.pdotf.on { border-color:#fff; }',
  '.pdotf.pall { width:auto; height:auto; border-radius:999px; font-size:10.5px; color:#aab0c0; border:1px solid #424650; padding:2px 8px; }',
  '.pdotf.pall.on { border-color:#e53e3e; color:#ff9d9d; }',
  '.pt { display:flex; align-items:center; gap:8px; background:#1c1e24; border:1px solid #2c3038; border-radius:10px; padding:8px 9px; margin-bottom:6px; }',
  'body.compact .pt { padding:5px 7px; margin-bottom:4px; border-radius:8px; }',
  '.pt.over { border-color:#e53e3e66; background:#e53e3e12; }',
  '.pc { width:18px; height:18px; min-width:18px; border:2px solid #5a6070; border-radius:5px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:transparent; font-size:11px; font-weight:700; }',
  '.pc:hover { border-color:#4caf7d; color:#4caf7d77; }',
  '.pmid { flex:1; min-width:0; }',
  '.ptit { font-size:13px; line-height:1.3; word-break:break-word; }',
  'body.compact .ptit { font-size:12px; }',
  '.ptit a { color:inherit; text-decoration:underline; text-underline-offset:2px; }',
  '.ptit a:hover { opacity:.8; }',
  '.ptit::first-letter { text-transform: uppercase; }',
  '.pstage { font-size:10.5px; color:#9fc6ff; margin-top:2px; }',
  '.pck { display:flex; align-items:center; gap:5px; font-size:11px; color:#c9cfdc; margin-top:3px; }',
  '.pck.don .pckt { text-decoration:line-through; color:#707688; }',
  '.pckb { width:13px; height:13px; min-width:13px; border:1.5px solid #5a6070; border-radius:3px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:9px; color:transparent; }',
  '.pck.don .pckb { background:#4caf7d; border-color:#4caf7d; color:#fff; }',
  '.pright { display:flex; flex-direction:column; align-items:center; gap:3px; }',
  '.pdue { font-size:10px; color:#8fd6a8; white-space:nowrap; }',
  '.pdue.over { color:#ff8b8b; }',
  '.pmoves { display:flex; gap:2px; }',
  '.pmv { background:none; border:none; color:#5a6070; cursor:pointer; font-size:12px; line-height:1; padding:1px 3px; }',
  '.pmv:hover { color:#e8eaf0; }',
  '.pgo { background:none; border:1px solid #424650; border-radius:6px; color:#9aa0ae; cursor:pointer; font-size:12px; padding:1px 6px; }',
  '.pgo:hover { color:#fff; border-color:#e53e3e; }',
  '.pempty { color:#777d8a; text-align:center; padding:20px 0; font-size:12.5px; }',
  'body.light { background:#eef0f3; color:#1c1e24; }',
  'body.light .pt { background:#fff; border-color:#d4d7de; }',
  'body.light .pt.over { border-color:#e53e3e66; background:#e53e3e10; }',
  'body.light #pipInput, body.light #pipSearch, body.light .pm, body.light .phbtn { background:#fff; color:#1c1e24; border-color:#c6cad3; }',
  'body.light .pchip, body.light .pdotf.pall, body.light .pgo, body.light #pipDue, body.light .psel { color:#5f6673; border-color:#c6cad3; background:#fff; }',
  'body.light .pchip.on, body.light .pdotf.pall.on, body.light .phbtn.on { color:#e53e3e; border-color:#e53e3e; background:#e53e3e12; }',
  'body.light .pck { color:#3c4250; }',
  'body.light .pckb, body.light .pc { border-color:#b6bcc8; }',
  'body.light .pstage { color:#1e6fd9; }',
  'body.light .pempty, body.light .pmempty { color:#8a90a0; }',
  'body.light .pdotf { box-shadow: inset 0 0 0 1px #d4d7de; }',
  'body.light .pdotf.on { border-color:#1c1e24; }',
  'body.light #pipTitle .sub { color:#5f6673; }'
].join('\n');

let pipCat = localStorage.getItem(LS + '_pipCat') || 'все';
let pipColor = localStorage.getItem(LS + '_pipColor') || '';
let pipFiltOpen = false;
let pipSearch = '';
let pipQuickDue = '';
let pipCompact = localStorage.getItem(LS + '_pipCompact') === '1';

function pipAddTask(text) {
  const minPos = tasks.length ? Math.min(...tasks.map(t => t.pos || 0)) : 0;
  let due = null, dueTime = null, q = pipQuickDue;
  const fmt = dl => dl.getFullYear() + '-' + String(dl.getMonth() + 1).padStart(2, '0') + '-' + String(dl.getDate()).padStart(2, '0');
  if (q === 'today') { due = todayStr(); }
  else if (q === '60' || q === '180') { const dl = new Date(Date.now() + parseInt(q, 10) * 60000); due = fmt(dl); dueTime = String(dl.getHours()).padStart(2, '0') + ':' + String(dl.getMinutes()).padStart(2, '0'); }
  else if (q === 'tom9') { const dl = new Date(Date.now() + 86400000); due = fmt(dl); dueTime = '09:00'; }
  tasks.push({ id: Date.now(), title: text, cat: (pipCat !== 'все' && allCatNames().includes(pipCat)) ? pipCat : null, due: due, dueTime: dueTime, done: false, created: Date.now(), updatedAt: null, mod: Date.now(), pos: minPos - 1 });
  save(); render();
}

async function togglePip() {
  if (!window.documentPictureInPicture) return;
  if (pipWin) { try { pipWin.close(); } catch(e) {} pipWin = null; updatePipBtn(); return; }
  const w = parseInt(localStorage.getItem(LS + '_pipW'), 10) || 360;
  const h = parseInt(localStorage.getItem(LS + '_pipH'), 10) || 540;
  try {
    pipWin = await documentPictureInPicture.requestWindow({ width: w, height: h });
  } catch(e) { return; }
  const d = pipWin.document;
  const st = d.createElement('style');
  st.textContent = PIP_CSS;
  d.head.appendChild(st);
  d.body.classList.toggle('light', isLight());
  d.body.classList.toggle('compact', pipCompact);
  d.body.innerHTML =
    '<div id="pipHead"><div id="pipTitle"></div>' +
    '<button class="phbtn" id="pipCompactBtn" title="Компактный режим">▤</button></div>' +
    '<div id="pipTop"></div><div id="pipCats"></div><div id="pipColors"></div>' +
    '<div id="pipAdd"><input id="pipInput" placeholder="+ Задача (Enter)"><select id="pipDue" title="Срок"></select></div>' +
    '<input id="pipSearch" placeholder="🔍 Поиск"><div id="pipList"></div>';
  const inp = d.getElementById('pipInput');
  inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) { pipAddTask(inp.value.trim()); inp.value = ''; } };
  const due = d.getElementById('pipDue');
  due.innerHTML = '<option value="">без срока</option><option value="today">сегодня</option><option value="60">через 1 ч</option><option value="180">через 3 ч</option><option value="tom9">завтра 9:00</option>';
  due.value = pipQuickDue;
  due.onchange = () => { pipQuickDue = due.value; };
  const srch = d.getElementById('pipSearch');
  srch.value = pipSearch;
  srch.oninput = () => { pipSearch = srch.value; pipRenderList(); };
  d.getElementById('pipCompactBtn').onclick = () => { pipCompact = !pipCompact; localStorage.setItem(LS + '_pipCompact', pipCompact ? '1' : ''); d.body.classList.toggle('compact', pipCompact); };
  pipWin.addEventListener('pagehide', () => { pipWin = null; updatePipBtn(); });
  pipWin.addEventListener('resize', () => { try { localStorage.setItem(LS + '_pipW', pipWin.innerWidth); localStorage.setItem(LS + '_pipH', pipWin.innerHeight); } catch(e) {} });
  pipRender();
  updatePipBtn();
}

function pipRender() {
  if (!pipWin) return;
  const d = pipWin.document;
  const title = d.getElementById('pipTitle');
  if (title) {
    const active = tasks.filter(t => !t.done).length;
    const od = tasks.filter(t => dueClass(t) === 'overdue').length;
    title.innerHTML = 'Мои дела<span class="sub">Активных: ' + active + (od ? ' · <span class="od">просрочено: ' + od + '</span>' : '') + '</span>';
  }
  const pt = d.getElementById('pipTop');
  if (pt) {
    pt.innerHTML = '';
    const tg = d.createElement('span');
    tg.className = 'pchip' + (pipFiltOpen ? ' on' : '');
    tg.textContent = '# Фильтры ' + (pipFiltOpen ? '▴' : '▾');
    tg.onclick = () => { pipFiltOpen = !pipFiltOpen; pipRender(); };
    pt.appendChild(tg);
    if (!pipFiltOpen && pipCat !== 'все') {
      const cur = d.createElement('span');
      cur.className = 'pchip on';
      cur.innerHTML = (catEmojiHTML(pipCat, true) ? catEmojiHTML(pipCat, true) + ' ' : '') + esc(pipCat);
      cur.title = 'Сбросить';
      cur.onclick = () => { pipCat = 'все'; localStorage.setItem(LS + '_pipCat', pipCat); pipRender(); };
      pt.appendChild(cur);
    }
    const sel = d.createElement('select');
    sel.className = 'psel';
    sel.innerHTML = '<option value="manual">Сортировка: ручная</option><option value="color-asc">Цвет: красный → белый</option><option value="color-desc">Цвет: белый → красный</option><option value="date-desc">Дата: новые → старые</option><option value="date-asc">Дата: старые → новые</option><option value="alpha-asc">Алфавит: А → Я</option><option value="alpha-desc">Алфавит: Я → А</option>';
    sel.value = state.sort || 'manual';
    sel.onchange = () => { state.sort = sel.value; save(); render(); };
    pt.appendChild(sel);
  }
  const pc = d.getElementById('pipCats');
  if (pc) {
    pc.style.display = pipFiltOpen ? '' : 'none';
    pc.innerHTML = '';
    if (!allCatNames().includes(pipCat) && pipCat !== 'все') pipCat = 'все';
    ['все'].concat(allCatNames()).forEach(c => {
      const ch = d.createElement('span');
      ch.className = 'pchip' + (pipCat === c ? ' on' : '');
      ch.innerHTML = c === 'все' ? 'Все' : ((catEmojiHTML(c, true) ? catEmojiHTML(c, true) + ' ' : '') + esc(c));
      ch.onclick = () => { pipCat = c; localStorage.setItem(LS + '_pipCat', pipCat); pipFiltOpen = false; pipRender(); };
      pc.appendChild(ch);
    });
  }
  const pcl = d.getElementById('pipColors');
  if (pcl) {
    pcl.style.display = pipFiltOpen ? '' : 'none';
    pcl.innerHTML = '';
    [''].concat(COLOR_ORDER).forEach(col => {
      const cnt = col ? tasks.filter(t => !t.done && effColor(t) === col).length : 0;
      if (col && !cnt && pipColor !== col) return;
      const ch = d.createElement('span');
      ch.className = 'pdotf' + (col === '' ? ' pall' : '') + (pipColor === col ? ' on' : '');
      if (col) { ch.style.background = col; ch.textContent = cnt || ''; ch.title = (COLORS.find(c => c[0] === col) || ['', ''])[1] + ': ' + cnt; }
      else ch.textContent = 'Все цвета';
      ch.onclick = () => { pipColor = col; localStorage.setItem(LS + '_pipColor', pipColor); pipRender(); };
      pcl.appendChild(ch);
    });
  }
  pipRenderList();
}

function pipRenderList() {
  if (!pipWin) return;
  const d = pipWin.document;
  const list = d.getElementById('pipList');
  if (!list) return;
  const q = pipSearch.trim().toLowerCase();
  const act = tasks.slice().sort(cmp).filter(t => !t.done
    && (pipCat === 'все' || t.cat === pipCat)
    && (!pipColor || effColor(t) === pipColor)
    && (!q || t.title.toLowerCase().includes(q) || (t.stage && t.stage.toLowerCase().includes(q)) || (t.checks && t.checks.some(c => c.t.toLowerCase().includes(q)))));
  list.innerHTML = '';
  if (!act.length) { list.innerHTML = '<div class="pempty">' + (q ? 'Ничего не нашлось' : 'Здесь пусто 🎉') + '</div>'; return; }
  act.forEach(t => {
    const row = d.createElement('div'); row.className = 'pt' + (dueClass(t) === 'overdue' ? ' over' : '');
    const c = d.createElement('div'); c.className = 'pc'; c.textContent = '✓'; c.title = 'Выполнено';
    c.onclick = () => { t.done = true; t.completedAt = Date.now(); t.mod = Date.now(); spawnRepeat(t); save(); render(); };
    const mid = d.createElement('div'); mid.className = 'pmid';
    const s = d.createElement('div'); s.className = 'ptit'; s.innerHTML = (t.pinned ? '📌 ' : '') + linkify(t.title); s.style.color = themedColor(effColor(t)); mid.appendChild(s);
    if (t.stage) { const sg = d.createElement('div'); sg.className = 'pstage'; sg.innerHTML = '↳ ' + linkify(t.stage); mid.appendChild(sg); }
    if (t.checks && t.checks.length) t.checks.forEach(ck => {
      const cr = d.createElement('div'); cr.className = 'pck' + (ck.d ? ' don' : '');
      const cb = d.createElement('span'); cb.className = 'pckb'; cb.textContent = '✓';
      cb.onclick = () => { ck.d = !ck.d; t.mod = Date.now(); save(); render(); };
      const ct = d.createElement('span'); ct.className = 'pckt'; ct.innerHTML = linkify(ck.t);
      cr.append(cb, ct); mid.appendChild(cr);
    });
    const right = d.createElement('div'); right.className = 'pright';
    if (t.due) { const du = d.createElement('div'); du.className = 'pdue' + (dueClass(t) === 'overdue' ? ' over' : ''); du.textContent = countdown(t); right.appendChild(du); }
    const mv = d.createElement('div'); mv.className = 'pmoves';
    const up = d.createElement('button'); up.className = 'pmv'; up.textContent = '▲'; up.title = 'Выше'; up.onclick = () => moveTask(t, -1, act);
    const dn = d.createElement('button'); dn.className = 'pmv'; dn.textContent = '▼'; dn.title = 'Ниже'; dn.onclick = () => moveTask(t, 1, act);
    mv.append(up, dn); right.appendChild(mv);
    const go = d.createElement('button'); go.className = 'pgo'; go.textContent = '↗'; go.title = 'Открыть в приложении';
    go.onclick = () => {
      try { window.focus(); } catch(e) {}
      let el = document.querySelector('.task[data-id="' + t.id + '"]');
      if (!el) { state.fCats = []; state.colors = []; state.fArchive = false; searchQ = ''; $('searchInput').value = ''; render(); el = document.querySelector('.task[data-id="' + t.id + '"]'); }
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2300); }
    };
    right.appendChild(go);
    row.append(c, mid, right);
    list.appendChild(row);
  });
}

function updatePipBtn() {
  const b = $('pipBtn');
  if (!window.documentPictureInPicture) { b.style.display = 'none'; return; }
  b.style.display = '';
  b.textContent = pipWin ? '🪟 Закрыть мини-окно' : '🪟 Поверх окон';
}
$('pipBtn').onclick = togglePip;
$('archiveBtn').onclick = () => { state.fArchive = !state.fArchive; if (state.fArchive) state.fDone = false; save(); render(); };
updatePipBtn();

/* --- Тема и формат дат --- */
function applyTheme() {
  document.body.classList.toggle('light', isLight());
  $('themeBtn').textContent = isLight() ? '🌙 Тёмная тема' : '☀️ Светлая тема';
  if (pipWin) { try { pipWin.document.body.classList.toggle('light', isLight()); } catch(e) {} }
}
$('themeBtn').onclick = () => {
  theme = isLight() ? 'dark' : 'light';
  localStorage.setItem(LS + '_theme', theme);
  applyTheme();
  render();
};
function dateBtnLabel() {
  $('dateBtn').textContent = '📅 Даты: ' + (dateFmt === 'name' ? '12 июн' : '12/06');
}
$('dateBtn').onclick = () => {
  dateFmt = dateFmt === 'name' ? 'num' : 'name';
  localStorage.setItem(LS + '_dateFmt', dateFmt);
  dateBtnLabel();
  render();
};
applyTheme();
dateBtnLabel();

/* --- Кнопка-закладка «В задачи» --- */
// Значки языков приезжают с чужого CDN: часть файлов там отсутствует, часть
// приходит широкими баннерами вместо квадратных иконок. И то, и другое прячем
// вместе с ячейкой — обработчиками на документе, чтобы в разметке не осталось
// инлайн-кода (с ним нельзя запретить инлайн-скрипты в политике безопасности).
document.addEventListener('error', e => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.dataset && t.dataset.hidep && t.parentElement)
    t.parentElement.style.display = 'none';
}, true);
document.addEventListener('load', e => {
  const t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.wide || !t.parentElement) return;
  if (t.naturalWidth > t.naturalHeight * parseFloat(t.dataset.wide)) t.parentElement.style.display = 'none';
}, true);

const BM_CODE = "javascript:(()=>{const s=(window.getSelection()+'').trim();const t=s||prompt('Текст задачи:','');if(t)window.open('" + (location.origin.indexOf('http') === 0 ? location.origin : 'https://alextask.ru') + "/?add='+encodeURIComponent(t.slice(0,300)),'alextask')})()";

// настройки кнопки «В задачи» (на этом устройстве)
let qadd = { cat: 'Работа', color: '', timer: 0 };
try { Object.assign(qadd, JSON.parse(localStorage.getItem(LS + '_qadd')) || {}); } catch(e) {}
function saveQadd() { localStorage.setItem(LS + '_qadd', JSON.stringify(qadd)); }
function fillQaddUI() {
  const qc = $('qaCat');
  qc.innerHTML = '<option value="">Без категории</option>' +
    allCatNames().map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
  qc.value = allCatNames().includes(qadd.cat) ? qadd.cat : '';
  const qcl = $('qaColor');
  qcl.innerHTML = '<option value="">Цвет: авто</option>' +
    COLORS.map(c => '<option value="' + c[0] + '" style="color:' + c[0] + '">' + c[1] + '</option>').join('');
  qcl.value = qadd.color || '';
  const qt = $('qaTimer');
  qt.innerHTML = '<option value="0">Без таймера</option><option value="30">30 минут</option><option value="60">1 час</option><option value="120">2 часа</option><option value="240">4 часа</option><option value="480">8 часов</option><option value="1440">1 день</option><option value="2880">2 дня</option><option value="10080">Неделя</option>';
  qt.value = String(qadd.timer || 0);
  qc.onchange = () => { qadd.cat = qc.value; saveQadd(); };
  qcl.onchange = () => { qadd.color = qcl.value; saveQadd(); };
  qt.onchange = () => { qadd.timer = parseInt(qt.value, 10) || 0; saveQadd(); };
}
fillQaddUI();
$('bmLink').setAttribute('href', BM_CODE);
$('bmLink').onclick = e => {
  e.preventDefault();
  $('bmMsg').textContent = 'Эту кнопку нужно не нажимать, а перетащить мышкой на панель закладок 🙂';
};
$('bmCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(BM_CODE); $('bmMsg').textContent = 'Код скопирован ✓'; }
  catch(e) { $('bmMsg').textContent = BM_CODE; }
};

/* --- Гайд --- */
function openGuide(dock) {
  $('guideOverlay').classList.add('open');
  if (dock && window.innerWidth >= 1000) { // на десктопе — сбоку, не блокируя сайт
    $('guideOverlay').classList.add('dock');
    document.body.classList.add('dockOpen');
  }
  fillQaddUI();
}
function hintGuideBtn() {
  const b = $('guideBtn');
  b.classList.add('pulse');
  b.scrollIntoView({ block: 'nearest' });
  const tip = document.createElement('span');
  tip.className = 'gbub';
  tip.textContent = 'Гайд всегда можно открыть здесь';
  document.body.appendChild(tip);
  const place = () => {
    const r = b.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8)) + 'px';
    tip.style.top = (r.bottom + 8) + 'px';
  };
  place();
  // макет ещё «доезжает» после закрытия гайда (анимация padding-left .25s + scrollIntoView),
  // поэтому держим пузырёк привязанным к кнопке, пока всё не успокоится
  const t0 = performance.now();
  const track = () => {
    place();
    if (performance.now() - t0 < 600) requestAnimationFrame(track);
  };
  requestAnimationFrame(track);
  document.body.addEventListener('transitionend', place);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place);
  setTimeout(() => {
    b.classList.remove('pulse');
    tip.remove();
    document.body.removeEventListener('transitionend', place);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place);
  }, 8000);
}
function closeGuide() {
  document.querySelectorAll('.subg').forEach(function (p) { p.classList.remove('open', 'dock'); });
  $('guideOverlay').classList.remove('open');
  $('guideOverlay').classList.remove('dock');
  document.body.classList.remove('dockOpen');
  localStorage.setItem(LS + '_guide', '1');
  // первый раз закрыл гайд — показываем, где он живёт
  if (!localStorage.getItem(LS + '_ghint')) {
    localStorage.setItem(LS + '_ghint', '1');
    hintGuideBtn();
  }
  maybeAskNotif(); // на телефоне после гайда предлагаем уведомления (если ещё не спрашивали)
}
$('guideBtn').onclick = () => openGuide(true);
function openSec(id) { $('guideOverlay').classList.remove('open', 'dock'); document.body.classList.remove('dockOpen'); var p = $(id); if (!p) return; p.classList.add('open'); if (window.innerWidth >= 1000) { p.classList.add('dock'); document.body.classList.add('dockOpen'); } if (id === 'sg-bm') fillQaddUI(); }
function backToGuide() { document.querySelectorAll('.subg').forEach(function (p) { p.classList.remove('open', 'dock'); }); document.body.classList.remove('dockOpen'); openGuide(true); }
document.querySelectorAll('.faqlink').forEach(function (b) { b.onclick = function () { openSec(b.dataset.sec); }; });
document.querySelectorAll('.subgback').forEach(function (b) { b.onclick = backToGuide; });
document.querySelectorAll('.subg').forEach(function (p) { p.onclick = function (e) { if (e.target === p) backToGuide(); }; });
function syncDock() {
  var wide = window.innerWidth >= 1000, docked = false;
  if ($('guideOverlay').classList.contains('open')) { $('guideOverlay').classList.toggle('dock', wide); if (wide) docked = true; }
  document.querySelectorAll('.subg.open').forEach(function (p) { p.classList.toggle('dock', wide); if (wide) docked = true; });
  document.body.classList.toggle('dockOpen', docked);
}
window.addEventListener('resize', syncDock);
$('guideClose').onclick = closeGuide;
$('guideOverlay').onclick = e => { if (e.target === $('guideOverlay')) closeGuide(); };

/* --- Установить как приложение --- */
let deferredInstall = null;
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; updateInstallBar(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; updateInstallBar(); });
function updateInstallBar() { const b = $('installBar'); if (!b) return; b.style.display = (deferredInstall && !isStandalone() && !localStorage.getItem(LS + '_instHide')) ? 'flex' : 'none'; }
async function doInstall() { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch(e) {} deferredInstall = null; updateInstallBar(); }
if ($('installBtn')) $('installBtn').onclick = doInstall;
if ($('installHide')) $('installHide').onclick = () => { localStorage.setItem(LS + '_instHide', '1'); updateInstallBar(); };

/* --- Демо-задачи при первом заходе --- */
function seedDemo() {
  if (localStorage.getItem(LS + '_demo') || tasks.length || sync) return;
  localStorage.setItem(LS + '_demo', '1');
  const now = Date.now();
  tasks = [
    { id: now + 1, title: 'Кликни по задаче — здесь редактирование, заметки и дедлайн', cat: 'Личное', checks: [{ t: 'Отметь пункт галочкой', d: false }, { t: 'И ещё один', d: false }], done: false, created: now, updatedAt: null, mod: now, pos: -1 },
    { id: now + 2, title: 'Задача с таймером до дедлайна', cat: 'Работа', due: todayStr(), dueTime: '18:00', done: false, created: now, updatedAt: null, mod: now, pos: -2 },
    { id: now + 3, title: 'Молоко, хлеб, кофе', cat: 'Купить', done: false, created: now, updatedAt: null, mod: now, pos: -3 }
  ];
}
function updateDemoBar() { const b = $('demoBar'); if (!b) return; b.style.display = (localStorage.getItem(LS + '_demo') === '1' && !localStorage.getItem(LS + '_demoDone')) ? 'flex' : 'none'; }
if ($('demoClear')) $('demoClear').onclick = () => { tasks = []; localStorage.setItem(LS + '_demoDone', '1'); save(); render(); updateDemoBar(); $('taskInput').focus(); };
if ($('demoHide')) $('demoHide').onclick = () => { localStorage.setItem(LS + '_demoDone', '1'); updateDemoBar(); };

/* --- Онбординг (2 экрана, первый визит) --- */
function onboardClose() {
  localStorage.setItem(LS + '_guide', '1');
  localStorage.setItem(LS + '_notifAsked', '1');
  $('welcome').classList.remove('open');
  if (!localStorage.getItem(LS + '_ghint')) { localStorage.setItem(LS + '_ghint', '1'); hintGuideBtn(); }
}
if ($('wNext')) $('wNext').onclick = () => {
  $('wStep1').style.display = 'none'; $('wStep2').style.display = '';
  if (deferredInstall && !isStandalone()) { $('wInstall').style.display = ''; $('wInstallLine').style.display = ''; }
};
if ($('wSkip')) $('wSkip').onclick = onboardClose;
if ($('wInstall')) $('wInstall').onclick = doInstall;
if ($('wNotif')) $('wNotif').onclick = async () => {
  if ('Notification' in window && Notification.permission !== 'denied') {
    const p = await Notification.requestPermission();
    if (p === 'granted') { notifOn = true; localStorage.setItem(LS + '_notif', '1'); notifLabel(); }
  }
};
if ($('wDone')) $('wDone').onclick = onboardClose;

// первый визит без облака — короткий онбординг + демо-задачи
if (!localStorage.getItem(LS + '_guide') && !sync) {
  seedDemo(); save(); render(); updateDemoBar();
  $('welcome').classList.add('open');
} else {
  setTimeout(maybeAskNotif, 1500);
}
updateInstallBar(); updateDemoBar();

// быстрое добавление по ссылке: alextask.ru/?add=Текст задачи (кнопка-закладка «В задачи»)
let flashId = null;
(function() {
  const addT = new URLSearchParams(location.search).get('add');
  if (!addT || !addT.trim()) return;
  const minPos = tasks.length ? Math.min(...tasks.map(t => t.pos || 0)) : 0;
  flashId = Date.now();
  // применяем настройки кнопки «В задачи»: категория, цвет, таймер
  let qDue = null, qTime = null;
  if (qadd.timer > 0) {
    const dl = new Date(Date.now() + qadd.timer * 60000);
    qDue = dl.getFullYear() + '-' + String(dl.getMonth() + 1).padStart(2, '0') + '-' + String(dl.getDate()).padStart(2, '0');
    qTime = String(dl.getHours()).padStart(2, '0') + ':' + String(dl.getMinutes()).padStart(2, '0');
  }
  tasks.push({
    id: flashId,
    title: addT.trim().slice(0, 300),
    cat: (qadd.cat && allCatNames().includes(qadd.cat)) ? qadd.cat : null,
    color: qadd.color || null,
    due: qDue,
    dueTime: qTime,
    done: false,
    created: Date.now(),
    updatedAt: null,
    mod: Date.now(),
    pos: minPos - 1
  });
  save();
  history.replaceState({}, '', location.pathname); // чистим URL, чтобы при обновлении не задвоилось
})();

render();

// подсветить и сразу открыть на редактирование задачу, добавленную по ссылке
if (flashId) {
  const el = document.querySelector('.task[data-id="' + flashId + '"]');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => {
      const fe = document.querySelector('.task[data-id="' + flashId + '"]');
      if (fe) {
        fe.classList.add('flash');
        const b = fe.querySelector('.body');
        if (b) b.click();
      }
    }, 300);
  }
}
syncUI();
notifLabel();
$('taskInput').focus();
if (sync) cloudPull();
autoBackup(); fillBakSel();

document.addEventListener('visibilitychange', () => {
  if (!sync) return;
  if (!document.hidden) cloudPull();
  else { clearTimeout(pushTimer); cloudPush(); }
});
window.addEventListener('focus', () => { if (sync && !document.querySelector('.editInput')) cloudPull(); });
window.addEventListener('pagehide', () => { if (sync) { clearTimeout(pushTimer); cloudPush(); } });

setInterval(() => {
  if (!document.querySelector('.editInput')) render();
}, 60000);
setInterval(() => {
  if (sync && !document.hidden && !document.querySelector('.editInput')) cloudPull();
}, 25000);

/* --- ИИ-помощник (Puter.js, без ключа) --- мульти-чаты --- */
(function () {
  const MODELS = [
    ['gpt-5-nano', '⚡ Быстрая'],
    ['gpt-5-mini', '⚖ Сбаланс'],
    ['gpt-5.4', '🧠 Умная'],
    ['gpt-4o-mini', '🤖 GPT-4o mini']
  ];
  const AI_KV = 'alextask_chat';
  let aiChats = null;
  try { aiChats = JSON.parse(localStorage.getItem(LS + '_aiChats')); } catch (e) {}
  if (!Array.isArray(aiChats)) {
    // миграция со старого одиночного чата
    let old = [];
    try { old = JSON.parse(localStorage.getItem(LS + '_ai')) || []; } catch (e) {}
    aiChats = old.length ? [{ id: 'm' + Date.now(), title: '', msgs: old, ts: Date.now() }] : [];
  }
  let aiCur = localStorage.getItem(LS + '_aiCur') || (aiChats[0] && aiChats[0].id) || null;
  let aiTs = parseInt(localStorage.getItem(LS + '_aiTs') || '0', 10);
  let aiModel = localStorage.getItem(LS + '_aiModel') || 'gpt-5-nano';
  let puterLoading = null, busy = false;

  function newChatObj() { return { id: 'c' + Date.now() + Math.floor(Math.random() * 1000), title: '', msgs: [], ts: Date.now() }; }
  function curChat() {
    let c = aiChats.find(x => x.id === aiCur);
    if (!c) { c = newChatObj(); aiChats.unshift(c); aiCur = c.id; }
    return c;
  }

  function loadPuter() {
    if (window.puter) return Promise.resolve();
    if (puterLoading) return puterLoading;
    puterLoading = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://js.puter.com/v2/';
      sc.onload = res;
      sc.onerror = () => { puterLoading = null; rej(new Error('Не удалось загрузить ИИ-движок (проверь интернет)')); };
      document.head.appendChild(sc);
    });
    return puterLoading;
  }

  const modelSel = $('aiModel');
  MODELS.forEach(m => { const o = document.createElement('option'); o.value = m[0]; o.textContent = m[1]; modelSel.appendChild(o); });
  if (!MODELS.some(m => m[0] === aiModel)) aiModel = 'gpt-5-nano';
  modelSel.value = aiModel;
  modelSel.onchange = () => { aiModel = modelSel.value; localStorage.setItem(LS + '_aiModel', aiModel); };

  function saveLocal() {
    try {
      localStorage.setItem(LS + '_aiChats', JSON.stringify(aiChats.slice(0, 40).map(c => ({ id: c.id, title: c.title, titleManual: c.titleManual, ts: c.ts, msgs: (c.msgs || []).slice(-60) }))));
      localStorage.setItem(LS + '_aiCur', aiCur || '');
      localStorage.setItem(LS + '_aiTs', String(aiTs));
    } catch (e) {}
  }
  function persist() { aiTs = Date.now(); const c = curChat(); c.ts = aiTs; saveLocal(); aiPush(); }
  function touch(c) { aiTs = Date.now(); c.ts = aiTs; saveLocal(); aiPush(); }
  async function genTitle(chat) {
    try {
      const first = chat.msgs.find(m => m.role === 'user');
      if (!first || chat.titleManual) return;
      const r = await puter.ai.chat(
        [{ role: 'user', content: 'Придумай очень короткое название (2–4 слова, на языке сообщения, без кавычек и точки в конце) для диалога, который начинается так:\n\n' + first.content.slice(0, 300) }],
        { model: 'gpt-5-nano' }
      );
      let t = (r && r.message && r.message.content) || (r && r.text) || (typeof r === 'string' ? r : '');
      t = (t || '').trim().replace(/^["'«»\s]+/, '').replace(/["'«».\s]+$/, '').slice(0, 42);
      if (t && !chat.titleManual) { chat.title = t; touch(chat); renderAi(); renderList(); }
    } catch (e) {}
  }

  async function signedIn() {
    try { if (window.puter && puter.auth && puter.auth.isSignedIn) return await puter.auth.isSignedIn(); } catch (e) {}
    return false;
  }
  async function aiPush() {
    try {
      if (!window.puter || !puter.kv) return;
      if (!(await signedIn())) return;
      await puter.kv.set(AI_KV, JSON.stringify({ ts: aiTs, chats: aiChats.slice(0, 40).map(c => ({ id: c.id, title: c.title, titleManual: c.titleManual, ts: c.ts, msgs: (c.msgs || []).slice(-60) })) }));
    } catch (e) {}
  }
  function mergeChats(localArr, cloudArr) {
    const map = {};
    localArr.forEach(c => { map[c.id] = c; });
    cloudArr.forEach(c => { const e = map[c.id]; if (!e || (c.ts || 0) > (e.ts || 0)) map[c.id] = c; });
    return Object.keys(map).map(k => map[k]).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }
  async function aiPull() {
    try {
      await loadPuter();
      if (!(await signedIn())) return;
      const raw = await puter.kv.get(AI_KV);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && Array.isArray(obj.chats)) {
        aiChats = mergeChats(aiChats, obj.chats);
        if (!aiChats.find(x => x.id === aiCur)) aiCur = (aiChats[0] && aiChats[0].id) || null;
        aiTs = Math.max(aiTs, obj.ts || 0);
        saveLocal(); renderAi(); renderList();
      }
    } catch (e) {}
  }

  function bubbleEl(m) {
    const b = document.createElement('div');
    b.className = 'aimsg ' + (m.role === 'user' ? 'u' : 'a');
    b.textContent = m.content;
    if (m.role !== 'user') {
      const cp = document.createElement('button'); cp.className = 'aicopy'; cp.textContent = '⧉ копия';
      cp.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(m.content); cp.textContent = '✓'; setTimeout(() => cp.textContent = '⧉ копия', 1200); };
      b.appendChild(cp);
    }
    return b;
  }
  function setTitle() {
    const c = curChat();
    const inner = $('aiTitle'); inner.textContent = '✨ ' + (c.title || 'Новый чат');
    const box = inner.parentElement;
    requestAnimationFrame(() => {
      const over = inner.scrollWidth - box.clientWidth;
      if (over > 6) { box.classList.add('scroll'); box.style.setProperty('--ttd', (-(over + 14)) + 'px'); }
      else { box.classList.remove('scroll'); box.style.removeProperty('--ttd'); }
    });
  }
  function renderAi() {
    setTitle();
    const log = $('aiLog'); log.innerHTML = '';
    const msgs = curChat().msgs;
    if (!msgs.length) {
      const e = document.createElement('div'); e.className = 'aiempty';
      e.textContent = 'Задай вопрос ИИ. ☰ — список чатов, ＋ — новый чат. Можно надиктовать голосом 🎤, ответы копируются. Чаты синхронизируются между устройствами (один аккаунт Puter).';
      log.appendChild(e); return;
    }
    msgs.forEach(m => log.appendChild(bubbleEl(m)));
    log.scrollTop = log.scrollHeight;
  }
  function renderList() {
    const box = $('aclItems'); box.innerHTML = '';
    if (!aiChats.length) {
      const e = document.createElement('div'); e.className = 'aclempty'; e.textContent = 'Пока нет чатов. Нажми «➕ Новый».';
      box.appendChild(e); return;
    }
    aiChats.forEach(c => {
      const row = document.createElement('div'); row.className = 'aclrow' + (c.id === aiCur ? ' active' : '');
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = c.title || 'Новый чат';
      const cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = (c.msgs ? c.msgs.filter(m => m.role === 'user').length : 0) + '↵';
      const ren = document.createElement('button'); ren.className = 'acldel'; ren.textContent = '✎'; ren.title = 'Переименовать';
      const del = document.createElement('button'); del.className = 'acldel'; del.textContent = '✕'; del.title = 'Удалить чат';
      row.onclick = () => switchChat(c.id);
      ren.onclick = ev => { ev.stopPropagation(); const nn = prompt('Название чата:', c.title || ''); if (nn !== null) { const v = nn.trim(); if (v) { c.title = v; c.titleManual = true; touch(c); renderAi(); renderList(); } } };
      del.onclick = ev => { ev.stopPropagation(); deleteChat(c.id); };
      row.append(nm, cnt, ren, del);
      box.appendChild(row);
    });
  }

  function openList() { $('aiChatList').classList.add('open'); renderList(); }
  function closeList() { $('aiChatList').classList.remove('open'); }
  function switchChat(id) { aiCur = id; saveLocal(); renderAi(); closeList(); setTimeout(() => $('aiInput').focus(), 40); }
  function newChat() {
    const c = curChat();
    if (!c.msgs.length && !c.title) { closeList(); renderAi(); return; } // текущий уже пустой
    const n = newChatObj(); aiChats.unshift(n); aiCur = n.id; aiTs = Date.now(); saveLocal(); aiPush();
    renderAi(); closeList(); setTimeout(() => $('aiInput').focus(), 40);
  }
  function deleteChat(id) {
    aiChats = aiChats.filter(x => x.id !== id);
    if (aiCur === id) aiCur = (aiChats[0] && aiChats[0].id) || null;
    if (!aiChats.length) { const n = newChatObj(); aiChats.push(n); aiCur = n.id; }
    aiTs = Date.now(); saveLocal(); aiPush(); renderAi(); renderList();
  }

  function openAi() { $('aiModal').classList.add('open'); document.body.classList.add('aiopen'); renderAi(); aiPull(); setTimeout(() => $('aiInput').focus(), 60); }
  function closeAi() { $('aiModal').classList.remove('open'); document.body.classList.remove('aiopen'); closeList(); }
  $('aiBtn').onclick = openAi;
  $('aiClose').onclick = closeAi;
  $('aiMenu').onclick = () => { if ($('aiChatList').classList.contains('open')) closeList(); else openList(); };
  $('aiNew').onclick = newChat;
  $('aclNew').onclick = newChat;
  $('aclClose').onclick = closeList;
  $('aiModal').onclick = e => { if (e.target === $('aiModal')) closeAi(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('aiModal').classList.contains('open')) {
      if ($('aiChatList').classList.contains('open')) closeList(); else closeAi();
    }
  });

  async function send() {
    const inp = $('aiInput'); const text = inp.value.trim();
    if (!text || busy) return;
    busy = true; $('aiSend').disabled = true; inp.value = ''; inp.style.height = 'auto';
    const chat = curChat();
    if (!chat.title) chat.title = text.slice(0, 42);
    chat.msgs.push({ role: 'user', content: text }); persist(); renderAi();
    const log = $('aiLog');
    const bubble = document.createElement('div'); bubble.className = 'aimsg a'; bubble.textContent = '…';
    log.appendChild(bubble); log.scrollTop = log.scrollHeight;
    try {
      await loadPuter();
      const resp = await puter.ai.chat(chat.msgs.map(m => ({ role: m.role, content: m.content })), { model: aiModel, stream: true });
      let acc = '';
      for await (const part of resp) { const t = (part && part.text) || ''; if (t) { acc += t; bubble.textContent = acc; log.scrollTop = log.scrollHeight; } }
      if (!acc) acc = '(пустой ответ)';
      chat.msgs.push({ role: 'assistant', content: acc }); persist(); renderAi();
      if (!chat.titleManual && chat.msgs.filter(m => m.role === 'user').length === 1) genTitle(chat);
    } catch (err) {
      bubble.classList.add('aierr');
      bubble.textContent = '⚠ ' + ((err && err.message) ? err.message : 'Ошибка запроса. Попробуй ещё раз или смени модель.');
    }
    busy = false; $('aiSend').disabled = false;
  }
  $('aiSend').onclick = send;
  $('aiInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('aiInput').addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('aiMic').style.display = 'none'; }
  else {
    let rec = null, recing = false;
    $('aiMic').onclick = () => {
      if (recing) { if (rec) rec.stop(); return; }
      rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = false;
      const base = $('aiInput').value;
      rec.onresult = e => {
        let s2 = '';
        for (let i = e.resultIndex; i < e.results.length; i++) s2 += e.results[i][0].transcript;
        $('aiInput').value = (base ? base + ' ' : '') + s2;
        $('aiInput').dispatchEvent(new Event('input'));
      };
      rec.onend = () => { recing = false; $('aiMic').classList.remove('rec'); $('aiInput').focus(); };
      rec.onerror = () => { recing = false; $('aiMic').classList.remove('rec'); };
      rec.start(); recing = true; $('aiMic').classList.add('rec');
    };
  }
})();
