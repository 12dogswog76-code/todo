// Инструменты справочника Endfield: планировщик прокачки, дейлики и
// недельки, достижения, крутки (счётчики гаранта, «хватит ли», симулятор).
//
// Данные — ef-tools.json (дейлики, достижения, баннеры, таблицы опыта) и
// файлы операторов data/ch/<id>.json (стоимость повышений, навыков, талантов).
// Всё, что вписываешь сам, лежит в localStorage с префиксом ef- и уезжает в
// облако вместе с остальными отметками.

(function () {
'use strict';
const { $, эк, чис } = EF;
let ТЛ = null;
async function тл() { if (!ТЛ) ТЛ = await EF.грузить('ef-tools.json'); return ТЛ; }

// Опыт — не предмет, но в списке материалов он нужен наравне с остальным.
function псевдо() {
  const П = EF.БАЗА.предметы;
  if (!П._exp_ch) П._exp_ch = { н: 'Опыт оператора', р: 4, з: (П.item_expcard_stage1_high || {}).з || '' };
  if (!П._exp_wp) П._exp_wp = { н: 'Опыт оружия', р: 4, з: (П.item_weapon_expcard_high || {}).з || '' };
}

// ════════════════════════════════════════════════════════════════════════════
// ПЛАНИРОВЩИК
// ════════════════════════════════════════════════════════════════════════════
function план() { return EF.взять('ef-plan', { цели: [], склад: {} }); }
function планСохр(п) { EF.положить('ef-plan', п); }
const ГРУППЫ = ['NormalAttack', 'NormalSkill', 'ComboSkill', 'UltimateSkill'];
const ГРУППЫРУ = { NormalAttack: 'Базовая атака', NormalSkill: 'Боевой навык', ComboSkill: 'Комбонавык', UltimateSkill: 'Суперспособность' };
// Прорыв нужен, чтобы подняться выше 20, 40, 60 и 80 уровня.
const ПОРОГИ = [20, 40, 60, 80];
const этапДля = ур => ПОРОГИ.filter(p => ур > p).length;

EF.вПлан = function (id) {
  const п = план();
  if (!п.цели.some(ц => ц.тип === 'оп' && ц.id === id)) {
    const м = EF.мой(id);
    п.цели.push({ тип: 'оп', id, ур: [м ? м.ур : 1, 90], навыки: Object.fromEntries(ГРУППЫ.map(g => [g, [1, 9]])),
      снар: [0, 3], таланты: true });
    планСохр(п);
  }
  EF.перейти('plan');
};

async function стоимость(ц) {
  const итог = {};
  const T = await тл();
  if (ц.выкл) return итог;
  if (ц.тип === 'оп') {
    const д = await EF.подробно(ц.id);
    const [от, до] = ц.ур;
    T.уровни.forEach(([у, опыт, з]) => { if (у >= от && у < до) { итог._exp_ch = (итог._exp_ch || 0) + опыт; итог.item_gold = (итог.item_gold || 0) + з; } });
    const [э0, э1] = [этапДля(от), этапДля(до)];
    (д.прорывы || []).forEach(x => {
      if (x.тип === 'ур' && x.этап > э0 && x.этап <= э1) EF.сложить(итог, x.цена);
      if (x.тип !== 'ур' && x.этап > (ц.снар || [0, 0])[0] && x.этап <= (ц.снар || [0, 0])[1]) EF.сложить(итог, x.цена);
    });
    Object.entries(д.цены || {}).forEach(([gid, список]) => {
      const г = ГРУППЫ.find(k => gid.endsWith(k));
      const [н0, н1] = (ц.навыки || {})[г] || [1, 1];
      список.forEach(x => { if (x.ур > н0 && x.ур <= н1) { EF.сложить(итог, x.п); итог.item_gold = (итог.item_gold || 0) + x.з; } });
    });
    if (ц.таланты) (д.пассивки || []).concat(д.атрибуты || []).concat(д.заводУзлы || []).forEach(x => EF.сложить(итог, x.цена));
  } else {
    const w = EF.ствол(ц.id);
    if (!w) return итог;
    const [от, до] = ц.ур;
    (T.оружиеКривые[w.кривая] || []).forEach(([у, опыт, з]) => { if (у >= от && у < до) { итог._exp_wp = (итог._exp_wp || 0) + опыт; итог.item_gold = (итог.item_gold || 0) + з; } });
    // Прорыв на пороге 20/40/60/80 нужен, если цель выше порога, а сейчас не выше.
    (w.прорыв || []).forEach(x => {
      if (от <= x.ур && до > x.ур) { EF.сложить(итог, x.п); итог.item_gold = (итог.item_gold || 0) + x.з; }
    });
  }
  return итог;
}

function поле(имя, знач, мин, макс) {
  return '<input class="inp num" type="number" min="' + мин + '" max="' + макс + '" value="' + знач + '" data-pl="' + имя + '">';
}
function карточкаЦели(ц, i, мат) {
  const о = ц.тип === 'оп' ? EF.оп(ц.id) : EF.ствол(ц.id);
  if (!о) return '';
  const имя = ц.тип === 'оп' ? о.имяРу : (о.имяРу || о.имя);
  const зн = ц.тип === 'оп' ? '<img src="' + эк(о.значок) + '" alt="" style="width:46px;height:46px;border-radius:9px">' : EF.фишка(о.id);
  let h = '<div class="box' + (ц.выкл ? '' : ' brk') + '" style="' + (ц.выкл ? 'opacity:.55' : '') + '">' +
    '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">' + зн +
    '<div style="flex:1;min-width:0"><b style="margin:0;color:var(--tx);font-size:14px;letter-spacing:.02em">' + эк(имя) + '</b>' +
    '<div class="hint" style="margin:3px 0 0">' + (ц.тип === 'оп' ? эк(о.классРу) + ' · ' + о.редкость + '★' : эк(о.типРу) + ' · ' + о.редкость + '★') + '</div></div>' +
    '<button class="btn sm gh" data-plx="' + i + ':off">' + (ц.выкл ? 'включить' : 'пауза') + '</button>' +
    '<button class="btn sm bad" data-plx="' + i + ':del">✕</button></div>' +
    '<div class="kv" style="font-size:12.5px;align-items:center">' +
    '<span>уровень</span><b>' + поле(i + ':ур:0', ц.ур[0], 1, 90) + ' → ' + поле(i + ':ур:1', ц.ур[1], 1, 90) + '</b>';
  if (ц.тип === 'оп') {
    ГРУППЫ.forEach(g => {
      const [a, b] = (ц.навыки || {})[g] || [1, 1];
      h += '<span>' + ГРУППЫРУ[g] + '</span><b>' + поле(i + ':нав:' + g + ':0', a, 1, 12) + ' → ' + поле(i + ':нав:' + g + ':1', b, 1, 12) + '</b>';
    });
    h += '<span>доступ к снаряжению</span><b>' + поле(i + ':снар:0', (ц.снар || [0, 0])[0], 0, 3) + ' → ' + поле(i + ':снар:1', (ц.снар || [0, 0])[1], 0, 3) + '</b>' +
      '<span>все таланты и узлы</span><b><button class="btn sm ' + (ц.таланты ? '' : 'gh') + '" data-plx="' + i + ':tal">' + (ц.таланты ? 'да' : 'нет') + '</button></b>';
  }
  h += '</div>';
  if (мат) h += '<div class="mats" style="margin-top:12px">' + EF.вСписок(мат).map(([id, n]) => EF.фишка(id, n, true)).join('') + '</div>';
  return h + '</div>';
}

EF.раздел('plan', {
  имя: 'Планировщик', буква: '▤',
  async рисовать() {
    псевдо();
    await тл();
    const п = план();
    EF.шапка('ascension.planner', 'Планировщик', п.цели.filter(ц => !ц.выкл).length, 'целей');
    $('fbar').innerHTML =
      '<div class="fgrp"><i>оператор</i><select class="srch" id="pladdop"><option value="">— добавить —</option>' +
      EF.БАЗА.персонажи.slice().sort((a, b) => a.имяРу.localeCompare(b.имяРу, 'ru')).map(c => '<option value="' + эк(c.id) + '">' + эк(c.имяРу) + '</option>').join('') + '</select></div>' +
      '<div class="fgrp"><i>оружие</i><select class="srch" id="pladdw"><option value="">— добавить —</option>' +
      EF.БАЗА.оружие.filter(w => w.редкость >= 4).map(w => '<option value="' + эк(w.id) + '">' + w.редкость + '★ ' + эк(w.имяРу || w.имя) + '</option>').join('') + '</select></div>' +
      (п.цели.length ? '<button class="btn sm bad" data-plx="all:clear" style="margin-left:auto">очистить всё</button>' : '');
    if (!п.цели.length) {
      $('body').innerHTML = '<div class="box brk" style="max-width:720px"><b>пусто</b>Добавь оператора или оружие сверху — посчитаю опыт, креды и материалы ' +
        'от текущего уровня до цели. Из карточки оператора: вкладка «Прокачка» → «в планировщик».</div>';
      return;
    }
    const мат = await Promise.all(п.цели.map(стоимость));
    const всего = {};
    мат.forEach(m => Object.entries(m).forEach(([k, v]) => { всего[k] = (всего[k] || 0) + v; }));
    const сп = EF.вСписок(всего);
    const хват = сп.filter(([id, n]) => (+п.склад[id] || 0) >= n).length;
    $('body').innerHTML =
      '<div class="verdict brk" style="margin-bottom:16px"><b>итого</b>Нужно <span class="g">' + сп.length + '</span> видов материалов, ' +
        'хватает <span class="g">' + хват + '</span>. Кредов: <span class="g">' + чис(всего.item_gold || 0, 0) + '</span>' +
        (всего._exp_ch ? ', опыта операторов: <span class="g">' + чис(всего._exp_ch, 0) + '</span>' : '') +
        (всего._exp_wp ? ', опыта оружия: <span class="g">' + чис(всего._exp_wp, 0) + '</span>' : '') + '.</div>' +
      EF.блок('Цели', 'уровни — сейчас → цель') +
      '<div class="cols">' + п.цели.map((ц, i) => карточкаЦели(ц, i, мат[i])).join('') + '</div>' +
      EF.блок('Склад и недостача', 'впиши, сколько есть — посчитаю, чего не хватает') +
      '<div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">' + сп.map(([id, n]) => {
        const пр = EF.пр(id);
        const есть = +п.склад[id] || 0;
        const нехв = Math.max(0, n - есть);
        return '<div class="it">' + EF.фишка(id, null, true) + '<span><b class="r' + пр.р + ' rt">' + эк(пр.н) + '</b>' +
          '<i>нужно ' + чис(n, 0) + (нехв ? ' · <span class="warn">не хватает ' + чис(нехв, 0) + '</span>' : ' · <span class="ok">хватает</span>') + '</i></span>' +
          '<input class="inp num" type="number" min="0" value="' + есть + '" data-sklad="' + эк(id) + '" title="есть на складе"></div>';
      }).join('') + '</div>';
    EF.подвал('Стоимость — из таблиц игры (endfieldtools.dev). Опыт считается в единицах опыта: сколько это боевых записей, зависит от их вида. ' +
      'Прорыв считается нужным, если цель выше порога 20/40/60/80.');
  },
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'pladdop' && t.value) { EF.вПлан(t.value); return; }
  if (t.id === 'pladdw' && t.value) {
    const п = план();
    п.цели.push({ тип: 'ор', id: t.value, ур: [1, 90] });
    планСохр(п); EF.перерисовать(); return;
  }
  if (t.dataset.pl) {
    const п = план();
    const ч = t.dataset.pl.split(':');
    const ц = п.цели[+ч[0]];
    if (!ц) return;
    const v = Math.max(+t.min, Math.min(+t.max, Math.round(+t.value || 0)));
    if (ч[1] === 'ур') ц.ур[+ч[2]] = v;
    else if (ч[1] === 'снар') { ц.снар = ц.снар || [0, 0]; ц.снар[+ч[2]] = v; }
    else if (ч[1] === 'нав') { ц.навыки = ц.навыки || {}; ц.навыки[ч[2]] = ц.навыки[ч[2]] || [1, 1]; ц.навыки[ч[2]][+ч[3]] = v; }
    планСохр(п); EF.перерисовать(); return;
  }
  if (t.dataset.sklad) {
    const п = план();
    п.склад[t.dataset.sklad] = Math.max(0, Math.round(+t.value || 0));
    планСохр(п); EF.перерисовать();
  }
});
document.addEventListener('click', e => {
  const т = e.target.closest('[data-plx]');
  if (!т) return;
  const [i, что] = т.dataset.plx.split(':');
  const п = план();
  if (что === 'clear') { if (confirm('Удалить все цели планировщика?')) { п.цели = []; планСохр(п); EF.перерисовать(); } return; }
  const ц = п.цели[+i];
  if (!ц) return;
  if (что === 'del') п.цели.splice(+i, 1);
  else if (что === 'off') ц.выкл = !ц.выкл;
  else if (что === 'tal') ц.таланты = !ц.таланты;
  планСохр(п); EF.перерисовать();
});

// ════════════════════════════════════════════════════════════════════════════
// ДЕЙЛИКИ И НЕДЕЛЬКИ
// ════════════════════════════════════════════════════════════════════════════
// Сброс сервера — 04:00 по времени сервера. Для азиатского и европейского
// сервера это разные часы по UTC, поэтому время сброса настраивается; по
// умолчанию 20:00 UTC (04:00 UTC+8).
function дд() { return EF.взять('ef-daily', { v: {}, сброс: '20:00' }); }
function ддСохр(d) { EF.положить('ef-daily', d); }
function ключДня(сброс) {
  const [ч, м] = String(сброс || '20:00').split(':').map(Number);
  const t = new Date(Date.now() - ((ч || 0) * 60 + (м || 0)) * 60000);
  return t.toISOString().slice(0, 10);
}
function ключНедели(сброс) {
  const день = new Date(ключДня(сброс) + 'T00:00:00Z');
  const пн = new Date(день.getTime() - ((день.getUTCDay() + 6) % 7) * 86400000);
  return пн.toISOString().slice(0, 10);
}
function следСброс(сброс) {
  const [ч, м] = String(сброс || '20:00').split(':').map(Number);
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), ч || 0, м || 0));
  if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
  return t;
}
function обновитьСброс(d) {
  const kd = ключДня(d.сброс), kw = ключНедели(d.сброс);
  let сбр = false;
  if (d.день !== kd) {
    Object.keys(d.v).forEach(k => { if ((d.п || {})[k] !== 'weekly' && (d.п || {})[k] !== 'none') delete d.v[k]; });
    d.день = kd; сбр = true;
  }
  if (d.неделя !== kw) {
    Object.keys(d.v).forEach(k => { if ((d.п || {})[k] === 'weekly') delete d.v[k]; });
    d.неделя = kw; сбр = true;
  }
  return сбр;
}
let ДВКЛ = 'overview';
function пунктДейлика(п, d) {
  const v = d.v[п.id];
  if (п.т === 'display') {
    return '<div class="it" style="font-size:12.5px"><span><b style="font-size:12.5px">' + эк(п.н) + '</b>' + (п.value ? '<i>' + эк(п.value) + '</i>' : '') + '</span></div>';
  }
  if (п.т === 'counter') {
    let знач = +v || 0;
    let подпись = '';
    if (п.рассудок) {
      // Рассудок копится сам: 1 единица за п.рассудок секунд. Храним значение
      // и момент, когда его вписали, — текущее досчитываем.
      const р = d.рассудок || { знач: 0, когда: Date.now() };
      знач = Math.min(п.max || 125, р.знач + Math.floor((Date.now() - р.когда) / 1000 / п.рассудок));
      const доПолного = Math.max(0, ((п.max || 125) - знач) * п.рассудок - ((Date.now() - р.когда) / 1000 % п.рассудок));
      подпись = знач >= (п.max || 125) ? '<span class="warn">полный — трать</span>' : 'полный через ' + часы(доПолного);
    }
    const готово = п.target && знач >= п.target && !п.рассудок;
    return '<div class="chk' + (готово ? ' done' : '') + '" style="cursor:default">' + (п.з ? '<img src="' + эк(п.з) + '" alt="">' : '') +
      '<span class="t">' + эк(п.н) + (подпись ? '<br><small style="color:var(--tx3)">' + подпись + '</small>' : '') + '</span>' +
      '<span class="cnter"><button data-dc="' + эк(п.id) + ':-' + (п.step || 1) + '">−</button><b>' + знач + (п.target ? ' / ' + п.target : '') + '</b>' +
      '<button data-dc="' + эк(п.id) + ':' + (п.step || 1) + '">+</button></span></div>';
  }
  const on = !!v;
  return '<div class="chk' + (on ? ' done' : '') + '" data-dk="' + эк(п.id) + '"><span class="bx">' + (on ? '✓' : '') + '</span>' +
    (п.з ? '<img src="' + эк(п.з) + '" alt="" loading="lazy">' : '') + '<span class="t">' + эк(п.н) + '</span>' +
    (п.points ? '<span class="p">+' + п.points + '</span>' : '') + '</div>';
}
function часы(сек) {
  const ч = Math.floor(сек / 3600), м = Math.floor(сек % 3600 / 60);
  return (ч ? ч + ' ч ' : '') + м + ' мин';
}
EF.раздел('daily', {
  имя: 'Дейлики', буква: '✓',
  async рисовать() {
    const T = await тл();
    const d = дд();
    d.п = {};
    T.дейлики.forEach(в => в.секции.forEach(с => с.блоки.forEach(б => б.пункты.forEach(п => { d.п[п.id] = п.п; }))));
    if (обновитьСброс(d)) ддСохр(d);
    const вк = T.дейлики.find(в => в.id === ДВКЛ) || T.дейлики[0];
    const пункты = [];
    вк.секции.forEach(с => с.блоки.forEach(б => б.пункты.forEach(п => { if (п.т === 'check') пункты.push(п); })));
    const сделано = пункты.filter(п => d.v[п.id]).length;
    EF.шапка('daily.checklist', 'Дейлики', сделано + '/' + пункты.length, 'во вкладке');
    const сл = следСброс(d.сброс);
    $('fbar').innerHTML = '<div class="seg">' + T.дейлики.map(в => '<button class="' + (в.id === вк.id ? 'on' : '') + '" data-dt="' + в.id + '">' + эк(в.н) + '</button>').join('') + '</div>' +
      '<span class="fcnt">сброс через ' + часы((сл - Date.now()) / 1000) + '</span>' +
      '<button class="btn sm gh" data-dreset="time">сброс: ' + эк(d.сброс) + ' UTC</button>' +
      '<button class="btn sm gh" data-dreset="tab">сбросить вкладку</button>';
    $('body').innerHTML = '<div class="bar" style="margin-bottom:16px"><i style="width:' + (пункты.length ? сделано / пункты.length * 100 : 0) + '%"></i></div>' +
      вк.секции.map(с => EF.блок(с.н) + '<div class="cols">' + с.блоки.map(б =>
        '<div class="box"><b>' + эк(б.н) + '</b><div style="display:flex;flex-direction:column;gap:6px">' +
        б.пункты.map(п => пунктДейлика(п, d)).join('') + '</div></div>').join('') + '</div>').join('');
    EF.подвал('Список — чек-лист endfieldtools.dev, названия предметов — из игры. Отметки сбрасываются сами: дневные в час сброса, недельные в понедельник.');
  },
});
document.addEventListener('click', e => {
  const т = e.target.closest('[data-dk],[data-dc],[data-dt],[data-dreset]');
  if (!т) return;
  const d = дд();
  const д = т.dataset;
  if (д.dt) { ДВКЛ = д.dt; EF.перерисовать(); return; }
  if (д.dreset === 'time') {
    const v = prompt('Время ежедневного сброса по UTC (ЧЧ:ММ). Азия — 20:00, Европа/Америка — узнай в игре.', d.сброс || '20:00');
    if (v && /^\d{1,2}:\d{2}$/.test(v.trim())) { d.сброс = v.trim().padStart(5, '0'); ддСохр(d); EF.перерисовать(); }
    return;
  }
  if (д.dreset === 'tab') {
    if (!confirm('Снять все отметки на этой вкладке?')) return;
    ТЛ.дейлики.find(в => в.id === ДВКЛ).секции.forEach(с => с.блоки.forEach(б => б.пункты.forEach(п => { delete d.v[п.id]; })));
    ддСохр(d); EF.перерисовать(); return;
  }
  if (д.dk) { if (d.v[д.dk]) delete d.v[д.dk]; else d.v[д.dk] = 1; ддСохр(d); EF.перерисовать(); return; }
  if (д.dc) {
    const [id, шаг] = д.dc.split(':');
    let п = null;
    ТЛ.дейлики.forEach(в => в.секции.forEach(с => с.блоки.forEach(б => б.пункты.forEach(x => { if (x.id === id) п = x; }))));
    if (!п) return;
    if (п.рассудок) {
      const р = d.рассудок || { знач: 0, когда: Date.now() };
      const сейчас = Math.min(п.max || 125, р.знач + Math.floor((Date.now() - р.когда) / 1000 / п.рассудок));
      d.рассудок = { знач: Math.max(0, Math.min(п.max || 125, сейчас + +шаг)), когда: Date.now() };
    } else {
      d.v[id] = Math.max(п.min || 0, Math.min(п.max || 9999, (+d.v[id] || 0) + +шаг));
    }
    ддСохр(d); EF.перерисовать();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ДОСТИЖЕНИЯ
// ════════════════════════════════════════════════════════════════════════════
const ФА = { кат: '', статус: '', поиск: '' };
function ач() { return EF.взять('ef-ach', {}); }
EF.раздел('ach', {
  имя: 'Достижения', буква: '✦',
  async рисовать() {
    const T = await тл();
    const А = T.достижения;
    const мои = ач();
    const всего = А.список.reduce((s, a) => s + a.ур.length, 0);
    const взято = А.список.reduce((s, a) => s + Math.min(a.ур.length, мои[a.id] || 0), 0);
    EF.шапка('achievement.tracker', 'Достижения', взято + '/' + всего, 'уровней');
    $('fbar').innerHTML = '<div class="seg"><button class="' + (!ФА.кат ? 'on' : '') + '" data-ak="">все</button>' +
      А.категории.map(к => '<button class="' + (ФА.кат === к.id ? 'on' : '') + '" data-ak="' + эк(к.id) + '">' + эк(к.н) + '</button>').join('') + '</div>' +
      '<div class="fgrp">' + [['', 'все'], ['нет', 'не закрытые'], ['да', 'закрытые']].map(([k, и]) =>
        '<button class="fb' + (ФА.статус === k ? ' on' : '') + '" data-as="' + k + '">' + и + '</button>').join('') + '</div>' +
      '<input class="srch" id="aq" placeholder="поиск" value="' + эк(ФА.поиск) + '">';
    $('body').innerHTML = тело();
    function тело() {
      const q = ФА.поиск.trim().toLowerCase();
      return А.категории.filter(к => !ФА.кат || к.id === ФА.кат).map(к => {
        const сп = А.список.filter(a => a.к === к.id);
        const в = сп.reduce((s, a) => s + Math.min(a.ур.length, мои[a.id] || 0), 0);
        const вс = сп.reduce((s, a) => s + a.ур.length, 0);
        const группы = (к.группы.length ? к.группы : [{ id: '', н: '' }]).map(г => {
          const а = сп.filter(a => !г.id || a.г === г.id).filter(a => {
            const полн = (мои[a.id] || 0) >= a.ур.length;
            if (ФА.статус === 'да' && !полн) return false;
            if (ФА.статус === 'нет' && полн) return false;
            return !q || (a.н + ' ' + a.ур.map(x => x.т).join(' ')).toLowerCase().includes(q);
          });
          if (!а.length) return '';
          return (г.н ? '<div class="eyebrow" style="margin:14px 0 8px">' + эк(г.н) + '</div>' : '') +
            '<div class="wide" style="grid-template-columns:repeat(auto-fill,minmax(400px,1fr))">' + а.map(a => {
              const у = мои[a.id] || 0;
              const тек = a.ур[Math.min(у, a.ур.length - 1)];
              return '<div class="ach' + (у >= a.ур.length ? ' done' : '') + '">' + (a.з ? '<img src="' + эк(a.з) + '" alt="" loading="lazy">' : '<span></span>') +
                '<div style="min-width:0"><b>' + эк(a.н) + '</b><p>' + богатый(тек.т) + '</p></div>' +
                '<div class="lvbtn">' + a.ур.map((x, i) => '<button class="' + (у > i ? 'on' : '') + '" data-al="' + эк(a.id) + ':' + (i + 1) + '" title="' + эк(x.т) + '">' +
                  (a.ур.length > 1 ? ['I', 'II', 'III', 'IV', 'V'][i] : '✓') + '</button>').join('') + '</div></div>';
            }).join('') + '</div>';
        }).join('');
        if (!группы) return '';
        return EF.блок(к.н, в + ' / ' + вс) + '<div class="bar ok" style="margin:-4px 0 12px"><i style="width:' + (вс ? в / вс * 100 : 0) + '%"></i></div>' + группы;
      }).join('') || '<div class="empty">ничего не нашлось</div>';
    }
    EF.телоДост = тело;
    EF.подвал('Список и условия — данные игры через endfieldtools.dev. Отметки уровней хранятся у тебя и складываются между устройствами через облако.');
  },
});
const богатый = s => EF.богат(s || '');
document.addEventListener('click', e => {
  const т = e.target.closest('[data-ak],[data-as],[data-al]');
  if (!т) return;
  const д = т.dataset;
  if (д.ak != null) { ФА.кат = д.ak; EF.перерисовать(); return; }
  if (д.as != null) { ФА.статус = д.as; EF.перерисовать(); return; }
  if (д.al) {
    const [id, у] = д.al.split(':');
    const м = ач();
    м[id] = (м[id] || 0) === +у ? +у - 1 : +у;
    if (!м[id]) delete м[id];
    EF.положить('ef-ach', м);
    const y = window.scrollY;
    EF.перерисовать();
    window.scrollTo(0, y);
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'aq' && EF.телоДост) { ФА.поиск = e.target.value; $('body').innerHTML = EF.телоДост(); }
});

// ════════════════════════════════════════════════════════════════════════════
// КРУТКИ
// ════════════════════════════════════════════════════════════════════════════
// Вероятности — прикидка: в открытых данных есть только пороги (мягкий с 65,
// жёсткий 80 у операторов; у оружия мягкий 40, жёсткий 80), базовых шансов
// нет. Берём общепринятые для игры: 0,8 % на 6★ у операторов, +5 % за каждую
// крутку после мягкого порога; 8 % на 5★ и 5★+ раз в 10; фокус 50 %, после
// проигрыша следующая 6★ — фокусная. У оружия база 4 %, +2,5 % после порога.
const МОДЕЛЬ = {
  character: { база: 0.008, мягкий: 65, шаг: 0.05, жёсткий: 80, п5: 0.08 },
  weapon: { база: 0.04, мягкий: 40, шаг: 0.025, жёсткий: 80, п5: 0.15 },
};
function шанс6(м, n) { // n — номер крутки с последней 6★ (1…жёсткий)
  if (n >= м.жёсткий) return 1;
  return Math.min(1, м.база + Math.max(0, n - м.мягкий) * м.шаг);
}
// Вероятность получить фокусную 6★ за N круток при текущем счётчике и гаранте.
function хватитЛи(м, pity, гарант, N) {
  let состояния = new Map([[pity + '|' + (гарант ? 1 : 0), 1]]);
  let успех = 0;
  for (let i = 0; i < N; i++) {
    const след = new Map();
    for (const [к, p] of состояния) {
      const [n, г] = к.split('|').map(Number);
      const q = шанс6(м, n + 1);
      if (q > 0) {
        if (г) успех += p * q;
        else { успех += p * q * 0.5; const k = '0|1'; след.set(k, (след.get(k) || 0) + p * q * 0.5); }
      }
      if (q < 1) { const k = (n + 1) + '|' + г; след.set(k, (след.get(k) || 0) + p * (1 - q)); }
    }
    состояния = след;
  }
  return успех;
}
function гача() {
  return EF.взять('ef-gacha', { счёт: { limited: { n: 0, г: false }, standard: { n: 0 }, weapon: { n: 0, г: false } }, круток: 0, журнал: [] });
}
function гачаСохр(g) { EF.положить('ef-gacha', g); }
let СИМ = { баннер: '', n: 0, г: false, итог: [], всего: 0 };
function крутка(б) {
  const м = МОДЕЛЬ[б.тип] || МОДЕЛЬ.character;
  СИМ.n++; СИМ.всего++;
  const пул = б.пул.map(id => б.тип === 'weapon' ? EF.ствол(id) : EF.оп(id)).filter(Boolean);
  const с6 = пул.filter(x => x.редкость === 6), с5 = пул.filter(x => x.редкость === 5), с4 = пул.filter(x => x.редкость <= 4);
  const фокус = (б.фокус.length ? б.фокус : [б.фокусОруж]).filter(Boolean);
  let итог;
  if (Math.random() < шанс6(м, СИМ.n)) {
    let кто;
    if (фокус.length && б.огр && (СИМ.г || Math.random() < 0.5)) { кто = фокус[Math.floor(Math.random() * фокус.length)]; СИМ.г = false; }
    else {
      const прочие = с6.filter(x => фокус.indexOf(x.id) < 0);
      кто = (прочие.length ? прочие : с6)[Math.floor(Math.random() * (прочие.length || с6.length))].id;
      if (фокус.length && б.огр) СИМ.г = true;
    }
    итог = { id: кто, р: 6, n: СИМ.n };
    СИМ.n = 0;
  } else if ((СИМ.всего % 10 === 0 && !СИМ.итог.slice(-9).some(x => x.р >= 5)) || Math.random() < м.п5) {
    итог = { id: (с5[Math.floor(Math.random() * с5.length)] || {}).id, р: 5 };
  } else {
    итог = { id: (с4[Math.floor(Math.random() * с4.length)] || {}).id, р: 4 };
  }
  СИМ.итог.push(итог);
  return итог;
}
function фишкаКрутки(x, тип) {
  const о = тип === 'weapon' ? EF.ствол(x.id) : EF.оп(x.id);
  const src = о ? (тип === 'weapon' ? о.значок : (о.карта || о.значок)) : '';
  return '<span class="pull r' + x.р + '" title="' + эк(о ? (о.имяРу || о.имя) : '') + (x.n ? ' · на ' + x.n : '') + '">' +
    (src ? '<img src="' + эк(src) + '" alt="" loading="lazy">' : '') + '</span>';
}
EF.раздел('gacha', {
  имя: 'Крутки', буква: '✧',
  async рисовать() {
    const T = await тл();
    const g = гача();
    const Б = T.баннеры.filter(б => б.тип === 'character' || б.тип === 'weapon');
    if (!СИМ.баннер) СИМ.баннер = (Б.find(б => б.огр && б.тип === 'character') || Б[0]).id;
    const б = Б.find(x => x.id === СИМ.баннер) || Б[0];
    EF.шапка('headhunt.tracker', 'Крутки', g.круток || 0, 'круток есть');
    const счёт = (к, имя, м, гарант) => {
      const с = g.счёт[к] || { n: 0 };
      const до = м.жёсткий - с.n;
      return '<div class="box brk"><b>' + имя + '</b>' +
        '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px"><span style="font:800 34px/1 var(--head);color:var(--acid)">' + с.n + '</span>' +
        '<span class="hint" style="margin:0">из ' + м.жёсткий + ' · до гаранта ' + до + (с.n >= м.мягкий ? ' · <span class="warn">мягкий гарант идёт</span>' : '') + '</span></div>' +
        '<div class="bar" style="margin-bottom:10px"><i style="width:' + с.n / м.жёсткий * 100 + '%"></i></div>' +
        '<div class="fld" style="margin:0"><button class="btn sm sec" data-gc="' + к + ':1">+1</button><button class="btn sm sec" data-gc="' + к + ':10">+10</button>' +
        '<button class="btn sm gh" data-gc="' + к + ':-1">−1</button><button class="btn sm gh" data-gc="' + к + ':0">выпала 6★</button>' +
        (гарант ? '<button class="btn sm ' + (с.г ? '' : 'gh') + '" data-gg="' + к + '">' + (с.г ? 'гарант фокуса есть' : '50/50') + '</button>' : '') + '</div></div>';
    };
    const N = g.круток || 0;
    const лим = g.счёт.limited || { n: 0 };
    const p = хватитЛи(МОДЕЛЬ.character, лим.n, лим.г, N);
    const нужно = [0.5, 0.9, 0.99].map(ц => { let n = 0; while (n < 400 && хватитЛи(МОДЕЛЬ.character, лим.n, лим.г, n) < ц) n += 5; return n; });
    const шестёрки = СИМ.итог.filter(x => x.р === 6);
    $('body').innerHTML =
      '<div class="cols">' +
        счёт('limited', 'Лимитированный баннер', МОДЕЛЬ.character, true) +
        счёт('standard', 'Стандартный баннер', МОДЕЛЬ.character, false) +
        счёт('weapon', 'Оружейный баннер', МОДЕЛЬ.weapon, true) +
        '<div class="verdict brk"><b>хватит ли на фокус</b>' +
          '<div class="fld" style="margin:0 0 10px"><span>круток есть</span><input class="inp num" type="number" min="0" value="' + N + '" id="gpulls"></div>' +
          'С текущим счётчиком <span class="g">' + лим.n + '</span>' + (лим.г ? ' и гарантом' : '') + ' шанс получить фокусного на лимитке: ' +
          '<span class="g" style="font-size:18px">' + EF.проц(p) + '</span>.<br>' +
          '50 % — за <span class="g">' + нужно[0] + '</span>, 90 % — за <span class="g">' + нужно[1] + '</span>, 99 % — за <span class="g">' + нужно[2] + '</span> круток.</div>' +
      '</div>' +
      EF.блок('Симулятор', 'прикидка по общепринятым шансам') +
      '<div class="fbar" style="margin-bottom:12px"><select class="srch" id="gban">' + Б.map(x => '<option value="' + эк(x.id) + '"' + (x.id === б.id ? ' selected' : '') + '>' +
        (x.тип === 'weapon' ? 'Оружие · ' : '') + эк(x.н) + (x.огр ? ' ★' : '') + '</option>').join('') + '</select>' +
        '<button class="btn" data-gs="1">×1</button><button class="btn" data-gs="10">×10</button><button class="btn sec" data-gs="focus">до фокуса</button>' +
        '<button class="btn gh" data-gs="reset">сброс</button>' +
        '<span class="fcnt">круток ' + СИМ.всего + ' · 6★ ' + шестёрки.length + (шестёрки.length ? ' · в среднем на ' + Math.round(шестёрки.reduce((s, x) => s + x.n, 0) / шестёрки.length) : '') +
        ' · счётчик ' + СИМ.n + (СИМ.г ? ' · гарант' : '') + '</span></div>' +
      (б.фокус.length || б.фокусОруж ? '<div class="hint" style="margin:0 0 10px">Фокус: ' + (б.тип === 'weapon' ? эк((EF.ствол(б.фокусОруж) || {}).имя || '') :
        б.фокус.map(id => эк((EF.оп(id) || {}).имяРу || id)).join(', ')) + '</div>' : '') +
      '<div class="pulls">' + СИМ.итог.slice(-120).reverse().map(x => фишкаКрутки(x, б.тип)).join('') + '</div>';
    EF.подвал('Пороги гаранта — из таблиц баннеров игры (endfieldtools.dev). Базовые шансы в открытых данных не публикуются — ' +
      'в расчётах общепринятые: 0,8 % на 6★ и +5 % за крутку после 65-й. Считай это прикидкой.');
  },
});
document.addEventListener('click', e => {
  const т = e.target.closest('[data-gc],[data-gg],[data-gs]');
  if (!т) return;
  const д = т.dataset;
  const g = гача();
  if (д.gc) {
    const [к, v] = д.gc.split(':');
    const с = g.счёт[к] = g.счёт[к] || { n: 0 };
    const м = к === 'weapon' ? МОДЕЛЬ.weapon : МОДЕЛЬ.character;
    if (+v === 0) с.n = 0; else с.n = Math.max(0, Math.min(м.жёсткий, с.n + +v));
    гачаСохр(g); EF.перерисовать(); return;
  }
  if (д.gg) { const с = g.счёт[д.gg]; с.г = !с.г; гачаСохр(g); EF.перерисовать(); return; }
  if (д.gs) {
    const б = ТЛ.баннеры.find(x => x.id === СИМ.баннер);
    if (д.gs === 'reset') СИМ = { баннер: СИМ.баннер, n: 0, г: false, итог: [], всего: 0 };
    else if (д.gs === 'focus') {
      const ф = (б.фокус.length ? б.фокус : [б.фокусОруж]).filter(Boolean);
      for (let i = 0; i < 400; i++) { const x = крутка(б); if (x.р === 6 && ф.indexOf(x.id) >= 0) break; }
    } else for (let i = 0; i < +д.gs; i++) крутка(б);
    EF.перерисовать();
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'gban') { СИМ = { баннер: e.target.value, n: 0, г: false, итог: [], всего: 0 }; EF.перерисовать(); }
  if (e.target.id === 'gpulls') { const g = гача(); g.круток = Math.max(0, Math.round(+e.target.value || 0)); гачаСохр(g); EF.перерисовать(); }
});
})();
