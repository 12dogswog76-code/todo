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
function дерево(id, скорость, путь, итог) {
  const r = рецептДля(id, путь);
  if (!r) {
    итог.сырьё[id] = (итог.сырьё[id] || 0) + скорость;
    return '<div class="row2">' + EF.фишка(id, null, true) + '<span>' + эк(EF.пр(id).н) + ' <span class="tag gh">сырьё</span></span>' +
      '<span class="num">' + чис(скорость, 2) + '/мин</span></div>';
  }
  const одна = вМинуту(r, id);
  const машин = скорость / одна;
  итог.машины[r.м] = (итог.машины[r.м] || 0) + машин;
  итог.энергия += Math.ceil(машин) * (машина(r.м).эн || 0);
  const м = машина(r.м);
  const выборы = (ПО_ВЫХОДУ[id] || []).length > 1
    ? '<select class="srch" data-frcp="' + эк(id) + '" style="min-width:0;padding:3px 8px;font-size:11px">' + ПО_ВЫХОДУ[id].map(x =>
      '<option value="' + эк(x.id) + '"' + (x === r ? ' selected' : '') + '>' + эк(x.вх.map(([i, n]) => n + '× ' + EF.пр(i).н).join(' + ') || x.id) + '</option>').join('') + '</select>' : '';
  const путь2 = new Set(путь); путь2.add(id);
  return '<div class="row2">' + EF.фишка(id, null, true) + '<span><b style="font:700 12.5px var(--head)">' + эк(EF.пр(id).н) + '</b> · ' +
    (м.з ? '<img src="' + эк(м.з) + '" alt="" style="width:18px;height:18px;vertical-align:middle">' : '') + эк(м.н) + ' × <span class="hl">' + чис(машин, 2) + '</span></span>' +
    выборы + '<span class="num">' + чис(скорость, 2) + '/мин</span></div>' +
    '<div class="tree">' + r.вх.map(([x, n]) => дерево(x, скорость * n / r.вых.find(o => o[0] === id)[1], путь2, итог)).join('') + '</div>';
}
let ОТКР = null, СКОР = 10;
function открыть(id) {
  ОТКР = id;
  const п = EF.пр(id);
  const делают = ПО_ВЫХОДУ[id] || [];
  const идёт = (ПО_ВХОДУ[id] || []).slice(0, 30);
  const итог = { сырьё: {}, машины: {}, энергия: 0 };
  const дер = делают.length ? дерево(id, СКОР, new Set(), итог) : '';
  EF.открыть('<div class="hd" style="margin-top:0"><div style="display:flex;gap:14px;align-items:center">' + EF.фишка(id) +
    '<div class="ttl"><span class="eyebrow">// factory.item</span><h1 class="r' + п.р + ' rt">' + эк(п.н) + '</h1></div></div></div>' +
    '<div class="cols">' +
    '<div class="sec full"><h4>чем делают</h4>' + (делают.length ? делают.map(строкаРецепта).join('<div style="height:6px"></div>') : '<div class="hint">это сырьё — добывается или выращивается</div>') + '</div>' +
    (делают.length ? '<div class="sec full"><h4>цепочка под скорость<em>штук в минуту</em></h4>' +
      '<div class="fld"><input class="inp num" type="number" min="0.1" step="0.5" value="' + СКОР + '" id="fspeed"><span class="hint" style="margin:0">шт/мин на выходе · свой рецепт выбирается в строке</span></div>' +
      '<div class="box" style="margin-bottom:12px">' + дер + '</div>' +
      '<div class="cols"><div class="box"><b>машины</b>' + Object.entries(итог.машины).map(([m, n]) =>
        '<div class="it" style="margin-bottom:6px">' + (машина(m).з ? '<img src="' + эк(машина(m).з) + '" alt="" style="width:30px;height:30px;object-fit:contain">' : '') +
        '<span><b>' + эк(машина(m).н) + '</b><i>' + чис(n, 2) + ' → ставить ' + Math.ceil(n - 1e-9) + '</i></span><span class="rt2">' + Math.ceil(n - 1e-9) + '</span></div>').join('') +
        '<p class="hint">Энергия: ~' + чис(итог.энергия, 0) + ' (по целым машинам)</p></div>' +
      '<div class="box"><b>сырьё в минуту</b>' + EF.материалы(Object.entries(итог.сырьё).map(([k, v]) => [k, Math.round(v * 100) / 100])) + '</div></div></div>' : '') +
    (идёт.length ? '<div class="sec full"><h4>куда идёт дальше<em>' + (ПО_ВХОДУ[id] || []).length + ' рецептов</em></h4>' + идёт.map(строкаРецепта).join('<div style="height:6px"></div>') + '</div>' : '') +
    '</div>');
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
