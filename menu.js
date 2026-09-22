// Кнопка возврата в меню разделов.
//
// Когда сайт открыт как приложение (своё окно, без адресной строки), уйти из
// раздела обратно к списку нечем: адресной строки нет, а жест «назад» есть не
// у всех. Этот файл рисует маленькую кнопку в углу — она ведёт на app.html.
//
// Показывается только там, где нужна: в окне приложения или если в раздел
// пришли из оболочки. В обычной вкладке браузера кнопка не появляется, чтобы
// не мешать.
//
// Подключается одной строкой в каждом разделе: <script src="menu.js"></script>
// (в подпапках — с ../).

(() => {
  'use strict';

  const ФЛАГ = 'из-оболочки';

  const приложение = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  // Переход из оболочки помним на всю вкладку: дальше человек ходит по
  // разделам, и кнопка должна оставаться.
  try {
    if (document.referrer && document.referrer.includes('app.html')) {
      sessionStorage.setItem(ФЛАГ, '1');
    }
  } catch (e) {}

  let надо = приложение();
  try { надо = надо || sessionStorage.getItem(ФЛАГ) === '1'; } catch (e) {}
  if (!надо) return;

  // Путь до оболочки: из подпапки (nte/, ef/) на уровень выше.
  const вверх = location.pathname.replace(/\/[^/]*$/, '/').split('/').filter(Boolean).length > 0
    && /\/(nte|ef)\//.test(location.pathname) ? '../app.html' : 'app.html';

  const кнопка = document.createElement('a');
  кнопка.href = вверх;
  кнопка.textContent = '☰ Разделы';
  кнопка.setAttribute('aria-label', 'Вернуться к списку разделов');
  кнопка.style.cssText = [
    'position:fixed', 'left:12px', 'bottom:12px', 'z-index:2147483000',
    'display:flex', 'align-items:center', 'gap:6px',
    'padding:9px 13px', 'border-radius:11px',
    'background:rgba(14,15,17,.92)', 'color:#edeef2',
    'border:1px solid rgba(255,255,255,.14)',
    'font:12px/1 Inter,"Segoe UI",system-ui,sans-serif', 'text-decoration:none',
    'box-shadow:0 8px 24px rgba(0,0,0,.45)', 'backdrop-filter:blur(8px)',
    'transition:.16s', 'user-select:none',
  ].join(';');
  кнопка.addEventListener('mouseenter', () => {
    кнопка.style.borderColor = 'rgba(255,255,255,.3)';
    кнопка.style.transform = 'translateY(-1px)';
  });
  кнопка.addEventListener('mouseleave', () => {
    кнопка.style.borderColor = 'rgba(255,255,255,.14)';
    кнопка.style.transform = 'none';
  });

  const поставить = () => document.body && document.body.appendChild(кнопка);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', поставить);
  } else {
    поставить();
  }
})();
