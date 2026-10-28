// Перековка снаряжения (с 27.10.2026, Endfield v14).
//
// Данные — data/ef-forge.json, его пишет build-ef-eft.py из решателя
// endfieldtools (guides/gear-artificing-solver-data.json). Две вкладки:
//   • «Вещь» — выбрал предмет: его доп. характеристики по уровням перековки
//     +0…+3, насколько значение близко к лучшему в этом слоте, гарант
//     попыток до каждого уровня и сколько стоит одна попытка;
//   • «Под характеристику» — выбрал, что нужно (шанс крита, УРН навыка…), —
//     лучшие вещи под неё в каждом слоте и как часто она вообще встречается.
// Проценты — оценки решателя по данным игры, не скрытые шансы сервера.

(function () {
'use strict';
const { $, эк } = EF;
let КОВ = null;
async function ков() { if (!КОВ) КОВ = await EF.грузить('ef-forge.json'); return КОВ; }

const ЧАСТЬ = { Body: 'Корпус', Hand: 'Руки', EDC: 'Модуль' };
const Ф = { режим: 'вещь', вещь: '', часть: '', поиск: '', стат: '' };
const вещьБД = id => EF.БАЗА.снаряжение.find(x => x.id === id) || null;
const предм = id => (EF.БАЗА.предметы || {})[id] || { н: id, з: '' };
const знак = (id, n) => {
  const п = предм(id);
  return '<span class="calop w">' + (п.з ? '<img src="' + эк(п.з) + '" alt="">' : '') + эк(п.н) + (n != null ? ' ×' + EF.чис(n) : '') + '</span>';
};

function цена(тех, раз) {
  if (!тех) return '—';
  return тех.пр.map(([id, n]) => знак(id, n * раз)).join('') + (тех.зол ? знак(тех.зол[0], тех.зол[1] * раз) : '');
}

function картВещи(К, id) {
  const в = К.вещи[id], б = вещьБД(id);
  if (!в) return '<div class="empty">Эту вещь перековать нельзя.</div>';
  const тех = (К.техники[в.ур] || []).find(т => т.осн) || (К.техники[в.ур] || [])[0];
  const г = (в.ст[0] && в.ст[0].г) || [];
  return '<div class="box brk"><b>' + (б ? '<img src="' + эк(б.значок) + '" alt="" width="40" height="40" style="vertical-align:middle;margin-right:8px">' + эк(б.имяРу) : эк(id)) + '</b>' +
    '<div class="say">' + эк(б ? б.частьРу + ' · с ' + б.сУровня + ' ур.' : '') + ' · рецепт ' + эк(в.ур) + '</div></div>' +
    EF.блок('Доп. характеристики', 'уровни перековки') +
    '<table class="tbl"><tr><th>характеристика</th><th>+0</th><th>+1</th><th>+2</th><th>+3</th><th title="значение относительно лучшей вещи этого слота">качество</th></tr>' +
    в.ст.map(s => '<tr><td>' + (s.топ ? '<b>' + эк(s.и) + '</b> ★' : эк(s.и)) + '</td>' +
      [0, 1, 2, 3].map(i => '<td>' + эк(s.з[i] != null ? s.з[i] : '—') + '</td>').join('') +
      '<td' + (s.кач >= 90 ? ' class="hot"' : '') + '>' + (s.кач != null ? Math.round(s.кач) + '%' : '—') + '</td></tr>').join('') + '</table>' +
    '<p class="hint">★ — лучшее значение этой характеристики среди вещей слота. Качество — насколько значение близко к лучшему.</p>' +
    EF.блок('Цена перековки', 'одна попытка и гарант') +
    '<table class="tbl"><tr><th>что</th><th>попыток</th><th>материалы</th></tr>' +
      '<tr><td>одна попытка</td><td>1</td><td>' + цена(тех, 1) + '</td></tr>' +
      г.map((n, i) => '<tr><td>гарант до +' + (i + 1) + '</td><td>' + n + '</td><td>' + цена(тех, n) + '</td></tr>').join('') +
    '</table><p class="hint">Гарант — сколько попыток в худшем случае до уровня. Обычно выходит раньше.</p>';
}

function списокВещей(К) {
  const q = Ф.поиск.trim().toLowerCase();
  const все = Object.keys(К.вещи).map(вещьБД).filter(Boolean)
    .filter(б => (!Ф.часть || б.частьРу === Ф.часть) && (!q || (б.имяРу + ' ' + б.имя).toLowerCase().indexOf(q) >= 0))
    .sort((a, b) => b.ранг - a.ранг || a.имяРу.localeCompare(b.имяРу));
  return '<div style="display:flex;flex-direction:column;gap:4px;max-height:70vh;overflow:auto">' +
    все.map(б => '<button class="tmi' + (б.id === Ф.вещь ? ' on' : '') + '" data-fg-item="' + эк(б.id) + '">' + эк(б.имяРу) +
      '<i>' + эк(б.частьРу + ' · ' + (К.вещи[б.id].ст.map(s => s.и).filter(x => !/атрибут/.test(x)).join(', '))) + '</i></button>').join('') +
    (все.length ? '' : '<div class="empty">Ничего не нашлось.</div>') + '</div>';
}

function подСтат(К) {
  const статы = [...new Set(К.лучшие.map(r => r.и))].sort((a, b) => a.localeCompare(b));
  if (!Ф.стат) Ф.стат = статы.find(x => /крит/.test(x)) || статы[0];
  const строки = К.лучшие.filter(r => r.и === Ф.стат);
  return '<div class="seg" style="flex-wrap:wrap;margin-bottom:14px">' + статы.map(с =>
      '<button class="' + (с === Ф.стат ? 'on' : '') + '" data-fg-stat="' + эк(с) + '">' + эк(с) + '</button>').join('') + '</div>' +
    '<table class="tbl"><tr><th>слот</th><th>лучшие вещи</th><th title="доля вещей слота, у которых эта характеристика бывает">встречается</th></tr>' +
    строки.map(r => '<tr><td>' + эк(ЧАСТЬ[r.часть] || r.часть) + '</td><td>' +
      r.вещи.map(id => { const б = вещьБД(id); return '<span class="calop w" data-fg-go="' + эк(id) + '">' + (б ? '<img src="' + эк(б.значок) + '" alt="">' + эк(б.имяРу) : эк(id)) + '</span>'; }).join('') +
      '</td><td>' + (r.пул != null ? r.пул.toFixed(1) + '%' : '—') + '</td></tr>').join('') + '</table>' +
    '<p class="hint">Клик по вещи — её перековка по уровням.</p>';
}

EF.раздел('forge', {
  имя: 'Перековка', буква: '⚒',
  async рисовать() {
    const К = await ков();
    EF.шапка('gear.artificing', 'Перековка', Object.keys(К.вещи).length, 'вещей');
    $('fbar').innerHTML = '<div class="seg"><button class="' + (Ф.режим === 'вещь' ? 'on' : '') + '" data-fg-mode="вещь">Вещь</button>' +
      '<button class="' + (Ф.режим === 'стат' ? 'on' : '') + '" data-fg-mode="стат">Под характеристику</button></div>' +
      (Ф.режим === 'вещь' ? '<div class="seg">' + ['', 'Корпус', 'Руки', 'Модуль'].map(ч =>
        '<button class="' + (ч === Ф.часть ? 'on' : '') + '" data-fg-part="' + ч + '">' + (ч || 'все') + '</button>').join('') + '</div>' +
        '<input class="inp" id="fgq" placeholder="поиск вещи" value="' + эк(Ф.поиск) + '" style="max-width:220px">' : '');
    $('body').innerHTML = Ф.режим === 'стат' ? подСтат(К)
      : '<div class="fggrid">' +
        '<div id="fglist">' + списокВещей(К) + '</div><div class="fgscr" id="fgcard">' + (Ф.вещь ? картВещи(К, Ф.вещь) : '<div class="empty">Выбери вещь в списке.</div>') + '</div></div>';
    EF.подвал('Данные — решатель перековки endfieldtools.dev (собран ' + эк(К.собрано) + '), с разрешения автора. Проценты — оценки по данным игры, а не скрытые шансы.');
    // Редизайн 28.10.2026 (п. 34): вещи — плитками, выбранная — окном по
    // центру (раскладка в design.css по html.dz-win). Закрыть — клик мимо окна
    // или Esc: выбор сбрасывается, список остаётся.
    document.documentElement.classList.toggle('dz-win', Ф.режим === 'вещь' && !!Ф.вещь);
  },
});
function закрытьОкно() {
  if (!document.documentElement.classList.contains('dz-win') || document.documentElement.dataset.tab !== 'forge') return;
  Ф.вещь = '';
  EF.перейти('forge');
}
document.addEventListener('click', e => {
  if (e.target.closest('#fgcard, [data-fg-item], [data-fg-go], [data-fg-mode], [data-fg-part], [data-fg-stat], .ehead, #sheet')) return;
  закрытьОкно();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') закрытьОкно(); });

document.addEventListener('click', e => {
  const т = e.target.closest('[data-fg-mode],[data-fg-part],[data-fg-item],[data-fg-stat],[data-fg-go]');
  if (!т) return;
  const д = т.dataset;
  if (д.fgMode) Ф.режим = д.fgMode;
  if (д.fgPart != null) Ф.часть = д.fgPart;
  if (д.fgItem) Ф.вещь = д.fgItem;
  if (д.fgStat) Ф.стат = д.fgStat;
  if (д.fgGo) { Ф.режим = 'вещь'; Ф.вещь = д.fgGo; Ф.часть = ''; Ф.поиск = ''; }
  EF.перейти('forge');
  // на телефоне карточка под списком — прокрутить к ней
  if ((д.fgItem || д.fgGo) && innerWidth <= 760) setTimeout(() => { const к = $('fgcard'); if (к) к.scrollIntoView({ behavior: 'smooth' }); }, 60);
});
document.addEventListener('input', e => {
  if (e.target.id !== 'fgq') return;
  Ф.поиск = e.target.value;
  ков().then(К => { const с = $('fglist'); if (с) с.innerHTML = списокВещей(К); });
});
})();
