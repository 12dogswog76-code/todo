// Фабрика (AIC): справочник рецептов и калькулятор цепочки.
//
// Рецепты, машины и их энергопотребление — данные игры через endfieldtools.dev.
// Выбираешь предмет — видно, чем его делают, куда он идёт дальше, и сколько
// машин каждого вида нужно под заданную скорость выпуска (штук в минуту).
// Конструктор базы с сеткой и конвейерами — следующий шаг, он строится поверх
// этого же расчёта.

(function () {
'use strict';
const { $, эк, чис } = EF;
let Ф = null;
let ПО_ВЫХОДУ = null, ПО_ВХОДУ = null;
const СОСТ = { поиск: '', машина: '' };

async function данные() {
  if (Ф) return Ф;
  Ф = await EF.грузить('ef-factory.json');
  ПО_ВЫХОДУ = {}; ПО_ВХОДУ = {};
  Ф.рецепты.sort((a, b) => a.id.localeCompare(b.id));
  Ф.рецепты.forEach(r => {
    r.вых.forEach(([id]) => (ПО_ВЫХОДУ[id] = ПО_ВЫХОДУ[id] || []).push(r));
    r.вх.forEach(([id]) => (ПО_ВХОДУ[id] = ПО_ВХОДУ[id] || []).push(r));
  });
  return Ф;
}
const машина = id => (Ф.машины[id] || { н: id, эн: 0, з: '' });
// Выпуск в минуту одной машиной по рецепту.
const вМинуту = (r, id) => { const о = r.вых.find(x => x[0] === id); return о ? о[1] * 60 / Math.max(1, r.с) : 0; };

function строкаРецепта(r) {
  const м = машина(r.м);
  return '<div class="rcp"><span class="mats">' + r.вх.map(([id, n]) => EF.фишка(id, n, true)).join('') + '</span>' +
    '<span class="arr">→</span><span class="mats">' + r.вых.map(([id, n]) => EF.фишка(id, n, true)).join('') + '</span>' +
    '<span class="mc">' + (м.з ? '<img src="' + эк(м.з) + '" alt="">' : '') + '<span><b style="font:700 12px var(--head);color:var(--tx)">' + эк(м.н) + '</b><br>' +
    r.с + ' с · ' + (м.эн ? м.эн + ' эн.' : 'без энергии') + '</span></span></div>';
}

// ── калькулятор ─────────────────────────────────────────────────────────────
const выбор = {};        // предмет → id рецепта, выбранного вручную
function рецептДля(id, путь) {
  const сп = (ПО_ВЫХОДУ[id] || []).filter(r => !r.вх.some(([x]) => путь.has(x)));
  if (!сп.length) return null;
  return сп.find(r => r.id === выбор[id]) || сп[0];
}
// Схема цепочки (редизайн 28.10.2026, п. 33, вариант C): колонки слева
// направо — сырьё → шаги → итог. Колонка узла — его «высота» от сырья, так
// что каждая колонка — один шаг производства. Одинаковые предметы в колонке
// складываются.
function схема(id, скорость, путь, итог, кол) {
  const r = рецептДля(id, путь);
  const сюда = (h, узел) => { const к = кол[h] = кол[h] || {}; const б = к[id]; if (б) { б.с += узел.с; б.м += узел.м; } else к[id] = узел; };
  if (!r) {
    итог.сырьё[id] = (итог.сырьё[id] || 0) + скорость;
    сюда(0, { с: скорость, м: 0, маш: '' });
    return 0;
  }
  const машин = скорость / вМинуту(r, id);
  итог.машины[r.м] = (итог.машины[r.м] || 0) + машин;
  итог.энергия += Math.ceil(машин) * (машина(r.м).эн || 0);
  const путь2 = new Set(путь); путь2.add(id);
  const h = 1 + Math.max(...r.вх.map(([x, n]) => схема(x, скорость * n / r.вых.find(o => o[0] === id)[1], путь2, итог, кол)));
  сюда(h, { с: скорость, м: машин, маш: r.м });
  return h;
}
function узелСхемы(id, у) {
  const выборы = у.маш && (ПО_ВЫХОДУ[id] || []).length > 1
    ? '<select class="srch" data-frcp="' + эк(id) + '">' + ПО_ВЫХОДУ[id].map(x =>
      '<option value="' + эк(x.id) + '"' + (x.id === (рецептДля(id, new Set()) || {}).id ? ' selected' : '') + '>' +
      эк(x.вх.map(([i, n]) => n + '× ' + EF.пр(i).н).join(' + ') || x.id) + '</option>').join('') + '</select>' : '';
  return '<div class="fc-n">' + EF.фишка(id, null, true) + '<div><b>' + эк(EF.пр(id).н) + '</b>' +
    '<i>' + чис(у.с, 2) + '/мин' + (у.маш ? ' · ' + эк(машина(у.маш).н) + ' × ' + чис(у.м, 2) : '') + '</i>' + выборы + '</div></div>';
}
let ОТКР = null, СКОР = 10;
function открыть(id) {
  ОТКР = id;
  const п = EF.пр(id);
  const делают = ПО_ВЫХОДУ[id] || [];
  const идёт = (ПО_ВХОДУ[id] || []).slice(0, 30);
  const итог = { сырьё: {}, машины: {}, энергия: 0 };
  const кол = [];
  if (делают.length) схема(id, СКОР, new Set(), итог, кол);
  const ПОДП = i => i === 0 ? 'сырьё' : (i === кол.length - 1 ? 'итог' : 'шаг ' + i);
  const машинЦелых = Object.values(итог.машины).reduce((s, n) => s + Math.ceil(n - 1e-9), 0);
  const строки = сп => '<div class="fc-rows">' + сп.map(строкаРецепта).join('') + '</div>';
  EF.открыть(
    '<div class="fc-hd">' + EF.фишка(id) + '<div><h2 class="r' + п.р + '">' + эк(п.н) + '</h2>' +
      '<i>' + (делают.length ? делают.length + ' ' + (делают.length === 1 ? 'рецепт' : 'рецептов') : 'сырьё') +
      ((ПО_ВХОДУ[id] || []).length ? ' · идёт ещё в ' + ПО_ВХОДУ[id].length : '') + '</i></div></div>' +
    (делают.length
      ? '<div class="sec full"><div class="fc-sp"><span>Скорость на выходе</span><input class="inp num" type="number" min="0.1" step="0.5" value="' + СКОР + '" id="fspeed"><span>шт/мин</span></div>' +
          '<div class="fc-flow">' + кол.map((к, i) => '<div class="fc-col"><small>' + ПОДП(i) + '</small>' +
            Object.entries(к).map(([x, у]) => узелСхемы(x, у)).join('') + '</div>').join('<span class="fc-a">→</span>') + '</div>' +
          '<div class="fc-kpi"><div><b>' + машинЦелых + '</b><span>машин</span></div><div><b>' + чис(итог.энергия, 0) + '</b><span>энергии</span></div>' +
            '<div><b>' + Object.keys(итог.сырьё).length + '</b><span>вида сырья</span></div><div class="ok"><b>' + чис(СКОР, 2) + '</b><span>шт/мин на выходе</span></div></div></div>'
      : '') +
    '<div class="sec full"><h4>Чем делают</h4>' + (делают.length ? строки(делают) : '<div class="hint">Это сырьё — добывается или выращивается.</div>') + '</div>' +
    (идёт.length ? '<div class="sec full"><h4>Куда идёт дальше<em>' + (ПО_ВХОДУ[id] || []).length + ' рецептов</em></h4>' + строки(идёт) + '</div>' : ''));
}

EF.раздел('fac', {
  имя: 'Рецепты', значок: '', буква: '⚙',
  async рисовать() {
    await данные();
    const все = Object.keys(ПО_ВЫХОДУ);
    const машины = [...new Set(Ф.рецепты.map(r => r.м))];
    EF.шапка('factory.recipes', 'Рецепты AIC', Ф.рецепты.length, 'рецептов');
    $('fbar').innerHTML = '<div class="fgrp"><i>машина</i>' + машины.map(m => '<button class="fb' + (СОСТ.машина === m ? ' on' : '') + '" data-fm="' + эк(m) + '">' +
      (машина(m).з ? '<img src="' + эк(машина(m).з) + '" alt="">' : '') + эк(машина(m).н) + '</button>').join('') + '</div>' +
      '<input class="srch" id="fq" placeholder="поиск предмета" value="' + эк(СОСТ.поиск) + '">';
    const тело = () => {
      const q = СОСТ.поиск.trim().toLowerCase();
      const сп = все.filter(id => (!q || EF.пр(id).н.toLowerCase().includes(q)) &&
        (!СОСТ.машина || ПО_ВЫХОДУ[id].some(r => r.м === СОСТ.машина)))
        .sort((a, b) => EF.пр(a).н.localeCompare(EF.пр(b).н, 'ru'));
      const c = $('hdcnt'); if (c) c.textContent = сп.length;
      if (!сп.length) return '<div class="empty">ничего не нашлось</div>';
      return '<div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">' + сп.map(id => {
        const п = EF.пр(id), r = ПО_ВЫХОДУ[id][0];
        return '<div class="it go" data-fi="' + эк(id) + '">' + EF.фишка(id, null, true) + '<span><b class="r' + п.р + ' rt">' + эк(п.н) + '</b>' +
          '<i>' + эк(машина(r.м).н) + (ПО_ВЫХОДУ[id].length > 1 ? ' · рецептов ' + ПО_ВЫХОДУ[id].length : '') + '</i></span></div>';
      }).join('') + '</div>';
    };
    EF.телоФаб = тело;
    $('body').innerHTML = тело();
    EF.подвал('Рецепты, машины и энергопотребление — данные игры (endfieldtools.dev). Время — на одну партию; скорость считается по нему.');
  },
});
document.addEventListener('click', e => {
  const т = e.target.closest('[data-fi],[data-fm]');
  if (!т || !Ф) return;
  if (т.dataset.fi) { СКОР = 10; открыть(т.dataset.fi); return; }
  if (т.dataset.fm != null) { СОСТ.машина = СОСТ.машина === т.dataset.fm ? '' : т.dataset.fm; EF.перерисовать(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'fq' && EF.телоФаб) { СОСТ.поиск = e.target.value; $('body').innerHTML = EF.телоФаб(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'fspeed' && ОТКР) { СКОР = Math.max(0.1, +e.target.value || 1); открыть(ОТКР); }
  if (e.target.dataset && e.target.dataset.frcp && ОТКР) { выбор[e.target.dataset.frcp] = e.target.value; открыть(ОТКР); }
});
})();
