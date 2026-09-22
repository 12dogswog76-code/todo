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

(() => {
  'use strict';

  const приложение = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (приложение()) return;

  let событие = null;
  let кнопка = null;

  function показать() {
    if (кнопка) return;
    кнопка = document.createElement('button');
    кнопка.textContent = '⤓ Поставить приложением';
    кнопка.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483000',
      'padding:10px 14px', 'border-radius:11px', 'cursor:pointer',
      'background:#ffd046', 'color:#0e0f11', 'border:0', 'font-weight:600',
      'font:600 12px/1 Inter,"Segoe UI",system-ui,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.45)', 'transition:.16s',
    ].join(';');
    кнопка.addEventListener('click', async () => {
      if (!событие) return;
      кнопка.disabled = true;
      событие.prompt();
      try { await событие.userChoice; } catch (e) {}
      событие = null;
      убрать();
    });
    document.body.appendChild(кнопка);
  }

  function убрать() {
    if (кнопка && кнопка.parentNode) кнопка.parentNode.removeChild(кнопка);
    кнопка = null;
  }

  window.addEventListener('beforeinstallprompt', e => {
    // Браузер готов поставить приложение. Свой диалог показываем сами, чтобы
    // он не выскакивал поверх страницы в неудобный момент.
    e.preventDefault();
    событие = e;
    if (document.body) показать();
    else document.addEventListener('DOMContentLoaded', показать);
  });

  // Поставили — кнопка больше не нужна.
  window.addEventListener('appinstalled', убрать);
})();
