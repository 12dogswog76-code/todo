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

  // Окно приложения узнаём тремя способами: установленное из браузера
  // (display-mode), запущенное alextask.exe (метка ?app=1 в адресе оболочки)
  // и iOS. Окно Chrome, открытое с ключом --app без установки, по
  // display-mode неотличимо от вкладки — поэтому exe и ставит метку.
  const приложение = () =>
    ['standalone', 'minimal-ui', 'window-controls-overlay', 'fullscreen']
      .some(m => window.matchMedia('(display-mode: ' + m + ')').matches) ||
    window.navigator.standalone === true;

  // Переход из оболочки помним на всю вкладку: дальше человек ходит по
  // разделам, и кнопка должна оставаться.
  try {
    if ((document.referrer && document.referrer.includes('app.html')) ||
        /[?&]app=1\b/.test(location.search)) {
      sessionStorage.setItem(ФЛАГ, '1');
    }
  } catch (e) {}
  // В самой оболочке кнопка не нужна — это и есть список разделов.
  if (/\/app\.html$/.test(location.pathname)) return;

  let надо = приложение();
  try { надо = надо || sessionStorage.getItem(ФЛАГ) === '1'; } catch (e) {}
  if (!надо) return;

  // Путь до оболочки: из подпапки (nte/, ef/) на уровень выше.
  const вверх = location.pathname.replace(/\/[^/]*$/, '/').split('/').filter(Boolean).length > 0
    && /\/(nte|ef)\//.test(location.pathname) ? '../app.html' : 'app.html';

  const кнопка = document.createElement('a');
  кнопка.href = вверх;
  кнопка.textContent = '← Разделы';
  кнопка.setAttribute('aria-label', 'Вернуться к списку разделов');

  // Где стоять. Раньше кнопка висела поверх страницы в левом нижнем углу и
  // закрывала карточки персонажей. Теперь она встаёт в шапку раздела, в
  // начало строки с логотипом. Порядок важен: у NTE тоже есть .top .logo,
  // поэтому .top-in проверяется раньше.
  const МЕСТА = [
    ['.top-in', 'строка'],        // NTE
    ['.top .logo', 'строка'],     // ZZZ
    ['#sb .sb-foot', 'блок'],     // Endfield — низ боковой панели
    ['.topbar', 'строка'],        // Мои дела
    ['.wrap > h1', 'строка'],     // Мои деньги
  ];
  const общий = [
    'align-items:center', 'justify-content:center', 'gap:6px', 'flex:none',
    'padding:7px 11px', 'border-radius:10px',
    'background:rgba(74,222,128,.09)', 'color:#e6fff0',
    'border:1px solid rgba(74,222,128,.55)',
    'font:700 11.5px/1 Inter,"Segoe UI",system-ui,sans-serif', 'letter-spacing:.05em',
    'text-decoration:none', 'white-space:nowrap', 'transition:.16s', 'user-select:none',
    'vertical-align:middle',
  ];
  const ВИД = {
    'строка': общий.concat(['display:inline-flex', 'margin-right:6px']),
    'блок': общий.concat(['display:flex', 'margin:0 0 8px', 'padding:9px 11px']),
    // запасной: если шапки не нашлось — маленькая плашка сверху слева
    'поверх': общий.concat(['display:inline-flex', 'position:fixed', 'left:10px', 'top:10px',
      'z-index:2147483000', 'background:rgba(14,15,17,.94)', 'box-shadow:0 8px 24px rgba(0,0,0,.45)']),
  };
  кнопка.addEventListener('mouseenter', () => {
    кнопка.style.borderColor = 'rgba(74,222,128,1)';
    кнопка.style.background = 'rgba(74,222,128,.18)';
  });
  кнопка.addEventListener('mouseleave', () => {
    кнопка.style.borderColor = 'rgba(74,222,128,.55)';
    кнопка.style.background = '';
    if (кнопка.dataset.vid === 'поверх') кнопка.style.background = 'rgba(14,15,17,.94)';
  });

  const поставить = () => {
    if (!document.body || кнопка.isConnected) return;
    for (const [сел, вид] of МЕСТА) {
      const куда = document.querySelector(сел);
      if (!куда) continue;
      кнопка.dataset.vid = вид;
      кнопка.style.cssText = ВИД[вид].join(';');
      куда.insertBefore(кнопка, куда.firstChild);
      return;
    }
    кнопка.dataset.vid = 'поверх';
    кнопка.style.cssText = ВИД['поверх'].join(';');
    document.body.appendChild(кнопка);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', поставить);
  } else {
    поставить();
  }
})();
