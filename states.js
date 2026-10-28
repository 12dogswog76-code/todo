// states.js — общие состояния страниц (редизайн 28.10.2026, п. 45).
//
// Разделы и так пишут «загружаю…» и «не загрузилось» в блок .empty — здесь их
// только узнаём по тексту и помечаем классом, а вид рисует design.css:
//   • .empty.dz-load — бегущая полоска сверху и серые строки-заглушки;
//   • .empty.dz-err  — красноватая плашка «Не загрузилось» с «↻ Повторить».
// Подсказки (.dz-tip) — плашка «ⓘ Подсказка» с ✕; скрытая не возвращается
// (отметка в localStorage по началу текста). Какие подсказки так показывать —
// список ПОДСКАЗКИ ниже, остальные .hint не трогаем.
//
// Подключается одной строкой: <script src="states.js"></script>
// (в подпапках — с ../). Правок в разделе не требует.

(() => {
  'use strict';

  const ГРУЗИТ = /^\s*(загружаю|загрузка|смотрю)/i;
  const ОШИБКА = /не загрузил|не загрузилась|не загрузился|не загрузилось|ошибка/i;
  const ПОДСКАЗКИ = [
    '#tab-fixed .card > b + .hint', '#tab-goals .card > b + .hint', '#tab-chart .card > b + .hint',
    '#tab-spend .card > b + .hint', '#tab-budget .card > b + .hint', '#tab-games .card > b + .hint',
    '#addHint'
  ].join(',');
  const LS = 'alextask-tips-hidden';

  const скрытые = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; } };
  const ключ = el => el.textContent.trim().slice(0, 40);

  function пустые() {
    document.querySelectorAll('.empty').forEach(el => {
      const т = el.textContent;
      if (el.dataset.dzT === т) return;     // этот текст уже разобран
      el.classList.remove('dz-load', 'dz-err');
      if (ГРУЗИТ.test(т)) el.classList.add('dz-load');
      else if (ОШИБКА.test(т)) {
        el.classList.add('dz-err');
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'dz-retry'; b.textContent = '↻ Повторить';
        b.addEventListener('click', () => location.reload());
        el.appendChild(b);
      }
      el.dataset.dzT = el.textContent;
    });
  }

  function подсказки() {
    const скр = скрытые();
    document.querySelectorAll(ПОДСКАЗКИ).forEach(el => {
      if (el.classList.contains('dz-tip')) return;
      if (скр.includes(ключ(el))) { el.hidden = true; el.classList.add('dz-tip'); return; }
      const к = ключ(el);
      el.classList.add('dz-tip');
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'dz-tip-x'; x.title = 'Скрыть подсказку'; x.textContent = '✕';
      x.addEventListener('click', () => {
        el.hidden = true;
        try { localStorage.setItem(LS, JSON.stringify(скрытые().concat(к))); } catch (e) {}
      });
      el.appendChild(x);
    });
  }

  let ждёт = false;
  const пройти = () => {
    if (ждёт) return;
    ждёт = true;
    requestAnimationFrame(() => { ждёт = false; пустые(); подсказки(); });
  };
  const старт = () => {
    if (!document.documentElement.dataset.sec) return;   // только страницы с новым обликом
    пройти();
    new MutationObserver(пройти).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', старт);
  else старт();
})();
