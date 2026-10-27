// «Поставить приложением» — общая кнопка для всех разделов.
//
// Раньше это жило только в справочнике NTE, причём показывалось даже тогда,
// когда сайт уже открыт приложением — то есть ровно там, где не нужно.
// Теперь правило одно на весь сайт:
//   • в окне приложения кнопки нет;
//   • в обычной вкладке она появляется, когда браузер говорит, что установка
//     возможна (событие beforeinstallprompt);
//   • в браузерах, которые такого события не шлют (Safari, Firefox), кнопка
//     не появляется — там установка делается через меню самого браузера.
//
// Подключается одной строкой: <script src="install.js"></script>
// (в подпапках — с ../).
//
// С 27.10.2026 (v2) — плашка с крестиком, а не вечная кнопка. Показывается
// при загрузке страницы, но не чаще раза в 30 минут (отметка в localStorage
// общая на все разделы — переходы ZZZ → NTE её не дёргают). Закрыть — ✕, или
// уйдёт сама через 20 секунд.

(() => {
  'use strict';

  const приложение = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    !!(window.chrome && window.chrome.webview);   // окно alextask.exe

  if (приложение()) return;

  const LS = 'alextask-install-shown';
  const ПАУЗА = 30 * 60 * 1000;
  const САМА = 20 * 1000;
  const чит = () => { try { return +localStorage.getItem(LS) || 0; } catch (e) { return 0; } };
  const пиши = () => { try { localStorage.setItem(LS, String(Date.now())); } catch (e) {} };

  let событие = null;
  let плашка = null;
  let таймер = 0;

  function показать() {
    if (плашка || Date.now() - чит() < ПАУЗА) return;
    пиши();
    плашка = document.createElement('div');
    плашка.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483000',
      'display:flex', 'align-items:center', 'gap:4px', 'padding:4px',
      'border-radius:12px', 'background:#ffd046', 'color:#0e0f11',
      'font:600 12px/1 Inter,"Segoe UI",system-ui,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.45)',
    ].join(';');
    const кн = (текст, подсказка) => {
      const b = document.createElement('button');
      b.textContent = текст; b.title = подсказка;
      b.style.cssText = 'background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:8px 10px;border-radius:9px';
      плашка.appendChild(b);
      return b;
    };
    const ставить = кн('⤓ Поставить приложением', 'установить сайт отдельным окном');
    const закрыть = кн('✕', 'скрыть на 30 минут');
    ставить.addEventListener('click', async () => {
      if (!событие) return;
      ставить.disabled = true;
      событие.prompt();
      try { await событие.userChoice; } catch (e) {}
      событие = null;
      убрать();
    });
    закрыть.addEventListener('click', убрать);
    // навёл мышь — не убираем, пока читаешь
    плашка.addEventListener('mouseenter', () => clearTimeout(таймер));
    плашка.addEventListener('mouseleave', () => { таймер = setTimeout(убрать, 5000); });
    document.body.appendChild(плашка);
    таймер = setTimeout(убрать, САМА);
  }

  function убрать() {
    clearTimeout(таймер);
    if (плашка && плашка.parentNode) плашка.parentNode.removeChild(плашка);
    плашка = null;
  }

  window.addEventListener('beforeinstallprompt', e => {
    // Браузер готов поставить приложение. Свой диалог показываем сами, чтобы
    // он не выскакивал поверх страницы в неудобный момент. Событие приходит
    // и повторно — плашку это не возвращает: только новая загрузка страницы
    // после паузы.
    e.preventDefault();
    if (событие) { событие = e; return; }
    событие = e;
    if (document.body) показать();
    else document.addEventListener('DOMContentLoaded', показать);
  });

  // Поставили — кнопка больше не нужна.
  window.addEventListener('appinstalled', убрать);
})();
