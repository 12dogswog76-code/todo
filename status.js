// status.js — плашка «как там сайт» от агента обслуживания. Только для владельца.
//
// Агент на ПК (агент.ps1) каждый день проверяет сайт и всё, от чего он
// зависит, и шлёт итог в воркер; воркер раз в час сам смотрит сайт и коды.
// Плашка показывает этот итог: зелёная — всё в порядке, жёлтая — работает,
// но есть что обновить или давно не было проверки, красная — что сломалось.
// Клик — подробности.
//
// Подключается строкой, правок в разделе не требует (как menu.js):
//   app.html — в шапку, рядом с заголовком;  zzz.html — над блоком «Обслуживание».
// Владелец — тот, у кого в трекере свой UID, или кто один раз открыл любую
// страницу с ?owner=1. Гостям плашка не рисуется и в воркер не ходит.
(function () {
  'use strict';
  const ВОРКЕРЫ = ['https://api.alextask.ru', 'https://alextask-push.12dogswog76.workers.dev'];
  const ЧАС = 3600 * 1000;

  function владелец() {
    try {
      if (/[?&]owner=1/.test(location.search)) localStorage.setItem('alextask-owner', '1');
      return localStorage.getItem('alextask-owner') === '1' ||
             localStorage.getItem('alexey_zzz_v1_dev') === '1' ||
             localStorage.getItem('alexey_zzz_v1_uid') === '1502024259';
    } catch (e) { return false; }
  }
  if (!владелец()) return;

  const эк = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function давно(мс) {
    const м = Math.round(мс / 60000);
    if (м < 90) return м + ' мин';
    const ч = Math.round(м / 60);
    return ч < 48 ? ч + ' ч' : Math.round(ч / 24) + ' дн.';
  }

  const стиль = document.createElement('style');
  стиль.textContent =
    '.agst{position:relative;display:inline-flex;align-items:center;gap:7px;cursor:pointer;font:600 11px/1.2 Inter,"Segoe UI",system-ui,sans-serif;' +
      'letter-spacing:.06em;text-transform:uppercase;color:#c9cdd6;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);' +
      'border-radius:10px;padding:7px 11px;margin:0 8px;user-select:none}' +
    '.agst:hover{border-color:rgba(255,255,255,.25)}' +
    '.agst i{width:9px;height:9px;border-radius:50%;background:#5a6070;flex:none}' +
    '.agst.ok i{background:#4ade80;box-shadow:0 0 8px #4ade8088}.agst.warn i{background:#fbbf24}.agst.bad i{background:#f87171;box-shadow:0 0 8px #f8717188}' +
    '.agst.bad{border-color:#f8717166}' +
    '.agst-in{position:absolute;z-index:50;top:calc(100% + 6px);right:0;min-width:320px;max-width:min(520px,92vw);background:#111318;' +
      'border:1px solid #242832;border-radius:12px;padding:12px 14px;text-transform:none;letter-spacing:0;font-weight:400;' +
      'font-size:12.5px;line-height:1.45;color:#e9ecf3;box-shadow:0 12px 40px rgba(0,0,0,.5);cursor:default}' +
    '.agst-in b{color:#ffd54a;font-weight:600}.agst-in .e{color:#f87171}.agst-in .w{color:#fbbf24}.agst-in .m{color:#8b92a3;font-size:11px}' +
    '.agst-in div+div{margin-top:5px}' +
    '.agst-blk{margin:0 0 10px}.agst-blk .agst{margin:0}';
  document.head.appendChild(стиль);

  const пл = document.createElement('div');
  пл.className = 'agst';
  пл.title = 'Агент обслуживания: проверка сайта, воркера, источников';
  пл.innerHTML = '<i></i><span>агент: смотрю…</span>';
  const куда = document.querySelector('.hd .ttl');          // app.html
  const обсл = document.getElementById('maint');            // zzz.html
  if (куда) куда.insertAdjacentElement('afterend', пл);
  else if (обсл) { const б = document.createElement('div'); б.className = 'agst-blk'; б.appendChild(пл); обсл.parentNode.insertBefore(б, обсл); }
  else return;

  let подробно = '';
  пл.onclick = e => {
    if (e.target.closest('.agst-in')) return;
    const есть = пл.querySelector('.agst-in');
    if (есть) { есть.remove(); return; }
    const в = document.createElement('div');
    в.className = 'agst-in';
    в.innerHTML = подробно || 'Нет данных.';
    пл.appendChild(в);
  };
  document.addEventListener('click', e => { if (!пл.contains(e.target)) { const в = пл.querySelector('.agst-in'); if (в) в.remove(); } });

  function запрос(база) {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 8000);
    return fetch(база + '/api/agent/status', { cache: 'no-store', signal: ac.signal })
      .then(r => r.json()).then(д => { if (!д || !д.ok) throw new Error(д && д.error || 'нет'); return д; });
  }
  Promise.any(ВОРКЕРЫ.map(запрос)).then(д => {
    const с = д.status, теперь = Date.now();
    const ош = (с && с.ошибки || []), уст = (с && с.устарело || []), кр = д.cron || [];
    const возраст = с ? теперь - с.t : Infinity;
    let вид = 'ok', текст;
    if (!с) { вид = 'warn'; текст = 'агент: ещё не проверял'; }
    else if (ош.length || кр.length) { вид = 'bad'; текст = 'агент: ' + (ош.length + кр.length) + ' ' + ((ош.length + кр.length) === 1 ? 'ошибка' : 'ошибки'); }
    else if (возраст > 36 * ЧАС) { вид = 'warn'; текст = 'агент: проверки не было ' + давно(возраст); }
    else if (уст.length) { вид = 'ok'; текст = 'агент: всё работает · обновит ' + уст.length; }
    else текст = 'агент: всё в порядке';
    пл.classList.add(вид);
    пл.querySelector('span').textContent = текст;
    let h = '';
    if (с) h += '<div>Проверка: <b>' + давно(возраст) + ' назад</b>, проверок ' + эк(с.проверок) + '</div>';
    ош.forEach(п => { h += '<div class="e">• ' + эк(п.текст) + (п.нужно ? '<div class="m">→ ' + эк(п.нужно) + '</div>' : '') + '</div>'; });
    кр.forEach(п => { h += '<div class="e">• воркер видит: ' + эк(п.текст) + '</div>'; });
    if (уст.length) h += '<div class="w">Устарело — агент обновит сам:</div>' + уст.map(п => '<div class="m">• ' + эк(п.текст) + '</div>').join('');
    if (д.seen) h += '<div class="m">ПК на связи: ' + давно(теперь - д.seen) + ' назад</div>';
    h += '<div class="m">Telegram-бот: ' + (д.bot ? 'подключён' : 'не подключён (агент.ps1 -Бот)') + ' · воркер ' + эк(д.v) + '</div>';
    подробно = h;
  }).catch(() => {
    пл.classList.add('warn');
    пл.querySelector('span').textContent = 'агент: воркер не ответил';
    подробно = 'Воркер не отдал статус. Если он ещё версии 45 — его нужно выложить (cloudflare\\alextask-worker.js, версия 46).';
  });
})();
