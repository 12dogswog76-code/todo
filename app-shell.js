// Оболочка приложения: выбор раздела и загрузка сайта в офлайн.
//
// Зачем отдельная страница. Каждый раздел ставится как своё приложение, и это
// удобно на телефоне. Но на компьютере хочется одну иконку, из которой
// открывается всё. Эта страница и есть такая иконка: её scope — весь сайт,
// поэтому переходы в разделы остаются в том же окне, без адресной строки.
//
// Что до офлайна: service worker сам кладёт в кэш страницы, данные и те
// картинки, которые открывались. Картинок на сайте почти три сотни мегабайт,
// и тянуть их все при первом заходе неправильно. Поэтому здесь список групп с
// объёмами — что нужно, то и докачиваешь.

const $ = id => document.getElementById(id);
const IMG_CACHE = 'moi-dela-img';      // тот же кэш, что у service worker
const LS_OFF = 'alextask-offline';     // что уже скачано

// Группы показываем в этом порядке и с понятными подписями. Ключи — из
// offline-list.json, его собирает build-offline-list.ps1 вместе с деплоем.
const ИМЕНА = {
  'основа':        ['Страницы и код', 'нужны всегда'],
  'данные-zzz':    ['Данные трекера', 'агенты, сборки, тир-лист'],
  'nte':           ['Данные справочника', 'эсперы, вещи, город, карта'],
  'ef':            ['Данные Endfield', 'операторы, карта, фабрика, инструменты'],
  'картинки-zzz':  ['Картинки трекера', 'агенты, диски, движки'],
  'картинки-nte':  ['Картинки справочника', 'арты, значки, дома, машины'],
  'карта-nte':     ['Плитки карты', 'нужны только для карты города'],
  'картинки-ef':   ['Картинки Endfield', 'портреты, значки, предметы'],
  'карта-ef':      ['Карта Endfield', 'тайлы подложки интерактивной карты'],
  'движок-ocr':    ['Распознавание', 'чтение характеристик со скринов']
};
const ПОУМОЛЧАНИЮ = ['основа', 'данные-zzz', 'nte', 'ef', 'картинки-zzz', 'картинки-nte', 'картинки-ef'];

let СПИСОК = null;      // содержимое offline-list.json
let идёт = false;       // качаем прямо сейчас
let стоп = false;

function мб(n) { return (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' МБ'; }
function скачано() {
  try { return JSON.parse(localStorage.getItem(LS_OFF)) || {}; } catch (e) { return {}; }
}

// Отметка в localStorage — это память о нажатии, а не факт. Кэш мог быть
// очищен браузером, а приложение открыться в другом профиле, и человек видел
// бы «скачано» там, где скачанного нет. Поэтому проверяем по-настоящему:
// берём из группы несколько файлов и спрашиваем кэш, лежат ли они.
async function правдаСкачано(группа) {
  const файлы = (СПИСОК && СПИСОК.groups[группа]) || [];
  if (!файлы.length) return false;
  const cache = await caches.open(IMG_CACHE);
  const проба = [файлы[0], файлы[Math.floor(файлы.length / 2)], файлы[файлы.length - 1]];
  for (const п of проба) {
    if (!(await cache.match(п))) return false;
  }
  return true;
}

// Сверяем отметки с кэшем и чистим те, что не подтвердились.
async function сверить() {
  const было = скачано();
  let менялось = false;
  for (const г of Object.keys(было)) {
    if (!(await правдаСкачано(г))) { delete было[г]; менялось = true; }
  }
  if (менялось) {
    try { localStorage.setItem(LS_OFF, JSON.stringify(было)); } catch (e) {}
  }
  return было;
}
function отметить(g) {
  const o = скачано();
  o[g] = Date.now();
  try { localStorage.setItem(LS_OFF, JSON.stringify(o)); } catch (e) {}
}

// Размер группы считаем не по файлам на диске, а по ответам сети: точных
// размеров у нас нет, поэтому берём приблизительные из самого списка.
async function загрузитьСписок() {
  try {
    const r = await fetch('offline-list.json', { cache: 'no-store' });
    СПИСОК = await r.json();
  } catch (e) {
    // Внутри собранного приложения списка нет и не нужно: все файлы лежат
    // рядом с запускающим файлом, качать нечего.
    $('size').textContent = 'файлы уже внутри приложения — докачивать нечего';
    $('groups').innerHTML = '';
    $('go').disabled = true;
    $('stop').disabled = true;
    $('say').textContent = 'Это окно — собранное приложение: страницы, данные и ' +
      'картинки лежат внутри него. Интернет нужен только там же, где и в браузере: ' +
      'коды, события, облако, профиль Enka.';
    return;
  }
  const было = await сверить();
  $('groups').innerHTML = Object.keys(ИМЕНА).filter(g => (СПИСОК.groups[g] || []).length)
    .map(g => {
      const n = СПИСОК.groups[g].length;
      const есть = было[g];
      return '<label class="g"><input type="checkbox" data-g="' + g + '"' +
        (ПОУМОЛЧАНИЮ.indexOf(g) >= 0 && !есть ? ' checked' : '') + '>' +
        '<div><b>' + ИМЕНА[g][0] + '</b><div style="color:var(--tx2);font-size:11px">' +
        ИМЕНА[g][1] + '</div></div>' +
        '<em>' + n + (есть ? ' ✓' : '') + '</em></label>';
    }).join('');
  const всего = Object.values(СПИСОК.groups).reduce((n, l) => n + l.length, 0);
  $('size').innerHTML = 'файлов на сайте: <b>' + всего + '</b> · ' +
    'скачано групп: <b>' + Object.keys(было).length + '</b> из ' + Object.keys(ИМЕНА).length;
}

// Кладём в кэш пачками: браузер не любит тысячу одновременных запросов, а по
// одному это слишком долго. Восемь за раз — золотая середина.
async function качать(файлы, шаг) {
  const cache = await caches.open(IMG_CACHE);
  let сделано = 0, ошибок = 0;
  const пачка = 8;
  for (let i = 0; i < файлы.length; i += пачка) {
    if (стоп) break;
    await Promise.all(файлы.slice(i, i + пачка).map(async путь => {
      try {
        const уже = await cache.match(путь);
        if (уже) { сделано++; return; }
        const r = await fetch(путь, { cache: 'no-cache' });
        if (r && r.ok) await cache.put(путь, r.clone());
        else ошибок++;
      } catch (e) { ошибок++; }
      сделано++;
    }));
    шаг(сделано, ошибок);
  }
  return { сделано, ошибок };
}

async function поехали() {
  if (идёт) return;
  const группы = [...document.querySelectorAll('[data-g]')].filter(x => x.checked).map(x => x.dataset.g);
  if (!группы.length) { $('say').textContent = 'отметь, что скачивать'; return; }
  идёт = true; стоп = false;
  $('go').disabled = true; $('stop').disabled = false;
  const файлы = [];
  группы.forEach(g => (СПИСОК.groups[g] || []).forEach(p => файлы.push(p)));
  let последнее = 0;
  const t0 = Date.now();
  const { сделано, ошибок } = await качать(файлы, (n, err) => {
    $('pb').style.width = Math.round(n * 100 / файлы.length) + '%';
    if (Date.now() - последнее < 250) return;
    последнее = Date.now();
    $('say').textContent = 'скачано ' + n + ' из ' + файлы.length +
      (err ? ' · не нашлось: ' + err : '');
  });
  if (!стоп) группы.forEach(отметить);
  идёт = false;
  $('go').disabled = false; $('stop').disabled = true;
  $('pb').style.width = стоп ? '0' : '100%';
  const сек = Math.round((Date.now() - t0) / 1000);
  $('say').textContent = стоп
    ? 'остановлено, скачано ' + сделано + ' из ' + файлы.length
    : 'готово: ' + сделано + ' файлов за ' + сек + ' c' +
      (ошибок ? ' · не нашлось: ' + ошибок : '') + '. Теперь это открывается без сети.';
  загрузитьСписок();
}

async function очистить() {
  if (идёт) return;
  const ключи = await caches.keys();
  await Promise.all(ключи.map(k => caches.delete(k)));
  try { localStorage.removeItem(LS_OFF); } catch (e) {}
  $('say').textContent = 'кэш очищен — страницы снова будут браться из сети';
  $('pb').style.width = '0';
  загрузитьСписок();
}

// Service worker регистрируем отсюда же: эта страница может оказаться первой,
// которую откроют после установки приложения.
function swStart() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js', { scope: '/', updateViaCache: 'none' })
    .then(reg => { try { reg.update(); } catch (e) {} })
    .catch(() => {});
}

function состояние() {
  const сеть = navigator.onLine ? 'сеть есть' : 'сети нет — работаем из кэша';
  const было = Object.keys(скачано()).length;
  $('state').innerHTML = сеть + ' · ' +
    (было ? 'офлайн-копия: <b>' + было + ' ' +
      (было === 1 ? 'группа' : было < 5 ? 'группы' : 'групп') + '</b>'
          : 'офлайн-копия ещё не скачана');
}

swStart();
состояние();
загрузитьСписок();
window.addEventListener('online', состояние);
window.addEventListener('offline', состояние);
$('go').onclick = поехали;
$('stop').onclick = () => { стоп = true; };
$('clear').onclick = очистить;
