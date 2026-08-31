/**
 * pryd.js v4 — забирает с prydwen.gg тир-лист и данные по сборкам агентов
 *              за один прогон и складывает всё в один файл.
 *
 * Зачем через браузер: сайт закрыт проверкой Cloudflare, скрипту снаружи он
 * отдаёт заглушку. Внутри уже открытой вкладки проверка пройдена, и запросы к
 * своим же страницам идут как обычные.
 *
 * Как пользоваться:
 *   1. Открыть https://www.prydwen.gg/zenless/bangboo
 *      (можно любую страницу раздела, но со страницы бангбу заодно соберутся
 *      и они: их пассивки читаются только из живой страницы)
 *   2. F12 → вкладка Console
 *   3. Вставить весь этот файл, нажать Enter
 *   4. Ждать. В консоли идёт счётчик, всего около пяти минут
 *   5. Результат сам скопируется в буфер. Сохранить его как zzz-guide.json
 *      в папку сайта и выложить:  .\go.ps1 -OnlyDeploy -SkipWorkflows
 *
 * Если буфер оказался пустым (вкладка была неактивна) — выполнить в консоли:
 *      copy(__pryd)
 *
 * Что собирается по каждому агенту:
 *   disk4/5/6  — главный стат диска, как написано на сайте
 *   substats   — приоритет дополнительных характеристик
 *   goals      — целевые значения, разобранные в числа: { atk:[2500,3600], cr:[75,95] }
 *   set4       — комплекты на 4 предмета
 *   set2       — комплекты на 2 предмета: { n: имя, rec: рекомендованный }
 *   engines    — движки: { n: имя, r: копия S1..S5, pct: сила от лучшего }
 *   skills     — порядок прокачки навыков
 *   faction    — фракция агента (в игровых данных Enka её нет)
 *   teams      — составы из статистики: shiyu (Оборона Шиюй) и da (Deadly
 *                Assault), в каждом ранг, частота и средний результат
 *   mates      — варианты напарников из авторского разбора, только состав
 *
 * Плюс общий список бангбу с условием пассивки — если запуск был со страницы
 * /zenless/bangboo.
 *
 * Разница с v1 и v2: комплекты и движки берутся по классам разметки, а не из
 * текста. Разметка на сервере и в браузере разная: имя движка лежит в
 * <span class="zzz-set-name">, а рядом в alt у картинки, и при удалении тегов
 * оно терялось — в файл приезжали пустые списки. Классы одинаковы и там, и там.
 * Диски, цели и приоритет доп. характеристик по-прежнему разбираются по тексту:
 * они лежат простыми абзацами и собираются без ошибок.
 *
 * Только сборки, без гайдов: авторские тексты не забираем.
 */

(async () => {
  const PAUSE = 5000;          // пауза между страницами
  const TIER_URL = '/zenless/tier-list';

  // адрес агента на сайте -> id в трекере
  const SLUGS = {
    'anby-demara':1011,'nekomata':1021,'nicole-demara':1031,'soldier-11':1041,
    'yidhari':1051,'corin':1061,'caesar':1071,'billy-kid':1081,'miyabi':1091,
    'koleda':1101,'anton':1111,'ben':1121,'soukaku':1131,'lycaon':1141,'lucy':1151,
    'lighter':1161,'burnice':1171,'grace-howard':1181,'ellen':1191,'harumasa':1201,
    'rina':1211,'yanagi':1221,'zhu-yuan':1241,'qingyi':1251,'jane-doe':1261,
    'seth':1271,'piper':1281,'hugo':1291,'orphie-and-magus':1301,'astra-yao':1311,
    'evelyn':1321,'vivian':1331,'zhao':1341,'pulchra':1351,'trigger':1361,
    'yixuan':1371,'anby-demara-soldier-0':1381,'ju-fufu':1391,'alice':1401,
    'ukinami-yuzuha':1411,'pan-yinhu':1421,'ye-shunguang':1431,'manato':1441,
    'lucia':1451,'seed':1461,'banyue':1471,'dialyn':1481,'sunna':1491,'aria':1501,
    'nangong-yu':1511,'cissia':1521,'billy-starlight':1531,'promeia':1541,
    'pyrois':1551,'velina':1561,'norma':1571,'remielle':1581,'sigrid':1591
  };
  const TIER_MAP = { 'T0':'S+', 'T0.5':'S', 'T1':'A', 'T1.5':'B', 'T2':'C', 'T3':'D' };
  const ROLE_MAP = { 'Crit DPS':'dmg', 'Anomaly DPS':'anomaly', 'Support':'support' };

  // подпись характеристики на сайте -> ключ в трекере
  const STAT = {
    'ATK':'atk', 'HP':'hp', 'DEF':'def', 'CRIT RATE':'cr', 'CRIT DMG':'cd',
    'IMPACT':'im', 'ANOMALY MASTERY':'am', 'ANOMALY PROFICIENCY':'ap',
    'PEN RATIO':'penp', 'PEN':'pen', 'SHEER FORCE':'sheer', 'ENERGY REGEN':'er'
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();

  const getDoc = async url => {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  };

  // ── HTML в построчный текст ───────────────────────────────────────────────
  // Каждый блочный тег даёт перенос строки: именно на разбиении по строкам
  // держится весь дальнейший разбор.
  function toText(raw) {
    let t = raw.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    t = t.replace(/<\/(div|p|li|h[1-6]|tr|section|td|th)>/gi, '\n');
    t = t.replace(/<br\s*\/?>/gi, '\n');
    t = t.replace(/<[^>]+>/g, ' ');
    const d = document.createElement('textarea');
    d.innerHTML = t;
    t = d.value;
    return t.replace(/[ \t ]+/g, ' ')
            .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  }

  // кусок текста от подписи раздела до ближайшей из следующих подписей
  function between(txt, from, to) {
    const i = txt.indexOf(from);
    if (i < 0) return '';
    const rest = txt.slice(i + from.length);
    let end = rest.length;
    for (const t of to) { const j = rest.indexOf(t); if (j >= 0 && j < end) end = j; }
    return rest.slice(0, end).trim();
  }

  // ── тир-лист ──────────────────────────────────────────────────────────────
  // Идём по документу подряд: метка тира, потом роль, потом ссылки на агентов.
  // Смотрим текстовые узлы, а не элементы: раньше метка бралась только у
  // элемента без детей, и любая обёртка вокруг «T0» ломала весь разбор.
  // Названия ролей встречаются и выше, в кнопках фильтра, но там ещё нет тира,
  // и такие ссылки просто не набираются.
  function readTiers(doc) {
    const walker = doc.createTreeWalker(doc.body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    const tiers = {}, seen = new Set(), miss = [], marks = [];
    let curTier = '', curRole = '', links = 0, node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) {                    // текстовый узел
        const t = clean(node.nodeValue);
        if (!t) continue;
        if (TIER_MAP[t]) { curTier = t; curRole = ''; marks.push(t); }
        else if (ROLE_MAP[t]) { curRole = ROLE_MAP[t]; }
        continue;
      }
      if (node.tagName !== 'A') continue;
      const m = (node.getAttribute('href') || '').match(/\/zenless\/characters\/([a-z0-9\-]+)/);
      if (!m) continue;
      links++;
      if (!curTier || !curRole) continue;
      const id = SLUGS[m[1]];
      if (!id) { if (miss.indexOf(m[1]) < 0) miss.push(m[1]); continue; }
      // ниже тир-листа идут составы команд и футер — каждого берём один раз
      if (seen.has(id)) continue;
      seen.add(id);
      const letter = TIER_MAP[curTier];
      tiers[letter] = tiers[letter] || { dmg: [], anomaly: [], support: [] };
      tiers[letter][curRole].push(id);
    }
    return { tiers: tiers, miss: miss, links: links, marks: marks };
  }

  // ── баннеры ───────────────────────────────────────────────────────────────
  // Страница /zenless/banners. Опорная точка — ссылка на агента: от неё
  // поднимаемся вверх, пока в тексте блока не встретится «Patch 3.1 Phase 2»,
  // и оттуда достаём фазу, даты и пометку new/rerun. Разметку не трогаем: она
  // тут заметно сложнее, чем на страницах сборок, а текст стабильный.
  const MON = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6,
                Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
  function isoDate(s) {
    const m = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(s || '');
    if (!m) return '';
    const mm = MON[m[1]];
    if (!mm) return '';
    return m[3] + '-' + String(mm).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0');
  }
  function readBanners(doc) {
    const out = [], seen = {};
    const today = new Date().toISOString().slice(0, 10);
    doc.querySelectorAll('a[href*="/zenless/characters/"]').forEach(a => {
      const m = (a.getAttribute('href') || '').match(/\/zenless\/characters\/([a-z0-9\-]+)/);
      if (!m) return;
      const slug = m[1];
      // поднимаемся до блока, где написаны патч и даты
      let box = a, txt = '';
      for (let i = 0; i < 7 && box; i++) {
        box = box.parentElement;
        if (!box) break;
        const t = clean(box.textContent);
        if (/Patch \d+\.\d+ Phase \d/.test(t)) { txt = t; break; }
      }
      if (!txt) return;
      const ph = /Patch (\d+\.\d+) Phase (\d)/.exec(txt);
      const dt = /([A-Z][a-z]{2} \d{1,2}, \d{4})\s*[–-]\s*([A-Z][a-z]{2} \d{1,2}, \d{4})/.exec(txt);
      if (!ph || !dt) return;
      const key = slug + '|' + ph[1] + '|' + ph[2];
      if (seen[key]) return;
      seen[key] = 1;
      const from = isoDate(dt[1]), to = isoDate(dt[2]);
      out.push({
        slug: slug, id: SLUGS[slug] || null,
        name: (function () {
          const n = box.querySelector('.banner-name, h4, h5');
          return n ? clean(n.textContent) : slug;
        })(),
        kind: /rerun/i.test(txt) ? 'rerun' : 'new',
        patch: ph[1], phase: +ph[2], from: from, to: to,
        eng: (function () {
          const e = /alongside (?:her|his|its) (?:Signature )?W-Engine ([^.]+)\./.exec(txt);
          return e ? clean(e[1]) : '';
        })(),
        cur: !!(from && to && from <= today && today <= to)
      });
    });
    return out;
  }

  // ── страница агента ───────────────────────────────────────────────────────
  // Нужный блок — первый .build-tips, в котором есть заголовок «Best W-Engines».
  // Такой же блок повторяется ниже в статистике профилей и в разделе про
  // созвездия, но там уже другие данные, и брать их нельзя.
  function buildBox(doc) {
    const boxes = doc.querySelectorAll('.build-tips');
    for (let i = 0; i < boxes.length; i++) {
      const hs = boxes[i].querySelectorAll('.content-header');
      for (let j = 0; j < hs.length; j++) {
        if (clean(hs[j].textContent) === 'Best W-Engines') return boxes[i];
      }
    }
    return null;
  }

  // Движки. У боевых агентов в .percentage лежит сила относительно лучшего
  // («100.00%»), у поддержки расчёта урона нет и там просто номер («1»).
  // Сигнатурное оружие иногда встречается дважды — в разных копиях, берём
  // первое вхождение.
  function readEngines(box) {
    const out = [], seen = {};
    box.querySelectorAll('.single-item').forEach(it => {
      const nm = it.querySelector('.zzz-set-name');
      if (!nm) return;                       // это не движок, а комплект дисков
      const name = clean(nm.textContent);
      const key = name.toLowerCase();
      if (!name || seen[key]) return;
      seen[key] = 1;
      const pe = it.querySelector('.percentage p') || it.querySelector('.percentage');
      const raw = pe ? clean(pe.textContent) : '';
      const rk = it.querySelector('.cone-super');
      out.push({
        n: name,
        pct: raw.indexOf('%') >= 0 ? parseFloat(raw) : null,
        r: rk ? clean(rk.textContent).replace(/[()]/g, '') : ''
      });
    });
    return out.slice(0, 6);
  }

  // Комплекты: на четыре предмета — в .zzz-weapon-name с пометкой «(4-PC)»,
  // на два — списком .small-sets у лучшего варианта. Пометку «рекомендовано»
  // сохраняем: на сайте она стоит не всегда и означает выбор по умолчанию.
  function readSets(box) {
    const s4 = [], s2 = [];
    box.querySelectorAll('.zzz-weapon-name').forEach(el => {
      const m = /^(.+?)\s*\(4-PC\)$/.exec(clean(el.textContent));
      if (m && s4.indexOf(m[1]) < 0) s4.push(m[1]);
    });
    const ul = box.querySelector('ul.small-sets');
    if (ul) ul.querySelectorAll('li').forEach(li => {
      const p = li.querySelector('.zzz-set-min p') || li.querySelector('p');
      const n = p ? clean(p.textContent) : '';
      if (!n || s2.some(x => x.n === n)) return;
      s2.push({ n: n, rec: /recommended/i.test(li.textContent) });
    });
    return { s4: s4.slice(0, 3), s2: s2.slice(0, 4) };
  }

  // ── команды ───────────────────────────────────────────────────────────────
  // На странице агента два блока .team-container-moc: сверху статистика по
  // Обороне Шиюй (в строках «Avg. time»), снизу по Deadly Assault («Avg. score»).
  // Это не чьё-то мнение, а срез по реальным прохождениям: ранг состава,
  // как часто его берут и средний результат. Порядок блоков не фиксируем —
  // определяем по подписи, иначе смена вёрстки молча перепутает местами.
  function readTeams(doc) {
    const out = { shiyu: [], da: [] };
    doc.querySelectorAll('.team-container-moc').forEach(box => {
      const isDA = /Avg\.\s*score/i.test(box.textContent);
      const dst = isDA ? out.da : out.shiyu;
      box.querySelectorAll('.team-row').forEach(row => {
        const info = clean((row.querySelector('.column.info') || {}).textContent || '');
        const rank = (info.match(/Rank\s+(\d+)/i) || [])[1];
        const rate = (info.match(/rate:\s*([\d.]+)%/i) || [])[1];
        const val  = (info.match(/(?:time|score):\s*([\d,]+)/i) || [])[1];
        const ids = [];
        row.querySelectorAll('.column.characters a[href*="/characters/"]').forEach(a => {
          const m = (a.getAttribute('href') || '').match(/\/characters\/([a-z0-9\-]+)/);
          const id = m ? SLUGS[m[1]] : 0;
          if (id && ids.indexOf(id) < 0) ids.push(id);
        });
        if (ids.length >= 2) dst.push({
          r: rank ? +rank : 0,
          u: rate ? +rate : 0,
          v: val ? +val.replace(/,/g, '') : 0,
          ids: ids
        });
      });
    });
    return (out.shiyu.length || out.da.length) ? out : null;
  }

  // Варианты напарников из авторского разбора: берём только состав, сам текст
  // не трогаем — он чужой. Признак блока: в одном пункте списка стоят подряд
  // несколько ссылок-агентов .inline-character-zzz.
  function readMates(doc) {
    const out = [];
    doc.querySelectorAll('li').forEach(li => {
      const links = li.querySelectorAll('.inline-character-zzz');
      if (links.length < 2) return;
      const ids = [];
      links.forEach(el => {
        const a = el.matches('a') ? el : el.querySelector('a');
        const m = a ? (a.getAttribute('href') || '').match(/\/characters\/([a-z0-9\-]+)/) : null;
        const id = m ? SLUGS[m[1]] : 0;
        if (id && ids.indexOf(id) < 0) ids.push(id);
      });
      if (ids.length >= 2 && !out.some(x => x.join() === ids.join())) out.push(ids);
    });
    return out.slice(0, 6);
  }

  function readAgent(doc, slug) {
    const box = buildBox(doc);
    if (!box) throw new Error('нет блока сборки');
    const txt = toText(box.innerHTML);
    const out = { slug: slug, id: SLUGS[slug] };

    // главные статы дисков и приоритет доп. характеристик
    const st = between(txt, 'Best Disk Drives Stats', ['Best Endgame Stats', 'Skill priority']);
    [4, 5, 6].forEach(n => {
      const m = st.match(new RegExp('Disk ' + n + '\\s*\\n(.+)'));
      out['disk' + n] = m ? m[1].trim() : '';
    });
    const sub = st.match(/Substats:?\s*(.+)/);
    out.substats = sub ? sub[1].trim() : '';

    // Целевые значения: «ATK: 2,500 - 3,600» -> atk:[2500,3600].
    // Подпись может быть и строчными («Anomaly Proficiency», «Energy Regen»),
    // а число иногда стоит на следующей строке — поэтому склеиваем блок в одну
    // строку и ищем все пары «подпись: число» подряд.
    const eg = between(txt, 'Best Endgame Stats', ['Skill priority', 'Video guides'])
      .replace(/\s*\n\s*/g, ' ');
    const goals = {};
    // «CRIT RATE: max. 50%» — перед числом бывает приписка, её пропускаем
    const gre = /([A-Za-z][A-Za-z .]*?)\s*:\s*(?:max\.?|min\.?|about|around|~)?\s*([\d,]+)\s*\+?\s*(?:-\s*([\d,]+))?/g;
    let gm;
    while ((gm = gre.exec(eg))) {
      const k = STAT[gm[1].trim().replace(/\.$/, '').toUpperCase()];
      if (!k) continue;
      const lo = parseInt(gm[2].replace(/,/g, ''), 10);
      const hi = gm[3] ? parseInt(gm[3].replace(/,/g, ''), 10) : lo;
      if (isFinite(lo)) goals[k] = [lo, hi];
    }
    out.goals = goals;

    // комплекты и движки — по классам разметки
    const st2 = readSets(box);
    out.set4 = st2.s4;
    out.set2 = st2.s2;
    out.engines = readEngines(box);

    // приоритет навыков лежит вне блока сборки, ищем его по всей странице
    const page = toText(doc.body ? doc.body.innerHTML : '');
    const sk = page.match(/Skill priority\n((?:.+\n){1,6}?)(?:Video guides|Teams)/);
    out.skills = sk ? sk[1].split('\n').map(x => x.trim()).filter(Boolean).slice(0, 5) : [];

    // Фракция — из вводного абзаца. Она нужна не сама по себе: половина бангбу
    // включает пассивку только при двух агентах одной фракции, а в игровых
    // данных Enka фракций нет вовсе.
    const fm = page.replace(/\n/g, ' ')
      .match(/is part of the (.+?) faction/i);
    out.faction = fm ? clean(fm[1]) : '';

    out.teams = readTeams(doc);
    out.mates = readMates(doc);
    return out;
  }

  // ── бангбу ────────────────────────────────────────────────────────────────
  // Условие пассивки («когда в отряде двое из Cunning Hares») лежит не в
  // разметке, а в данных, которые страница подставляет уже в браузере: в
  // исходном HTML на его месте стоит ссылка вида «$32», и её содержимое
  // приезжает отдельно. Поэтому бангбу читаются только из живой страницы —
  // если скрипт запущен на /zenless/bangboo. Вкладку «SKILL 2 — PASSIVE» надо
  // сначала открыть: обычный el.click() React игнорирует, нужна полная цепочка
  // событий мыши.
  function readBangboo() {
    if (location.pathname.indexOf('/zenless/bangboo') < 0) return null;
    const cards = document.querySelectorAll('.single-bangboo');
    if (!cards.length) return null;
    const fire = el => ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']
      .forEach(t => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })));
    cards.forEach(one => {
      const tab = [].slice.call(one.querySelectorAll('[role="tab"]'))
        .filter(t => /passive/i.test(t.textContent || ''))[0];
      if (tab) fire(tab);
    });
    return cards;
  }
  function collectBangboo(cards) {
    const seen = {}, out = [];
    [].forEach.call(cards, one => {
      const nm = clean((one.querySelector('.name') || {}).textContent || '');
      if (!nm || seen[nm]) return;
      const img = one.querySelector('img');
      const txt = clean(one.textContent || '');
      const m = txt.match(/STATS\s+(.+?)\s+Level\.?\s*1\s+(.+?)(?:\s*Multipliers|$)/);
      if (!m) return;
      seen[nm] = 1;
      out.push({
        n: nm,
        r: img && /rarity-S/.test(img.parentElement.className) ? 'S' : 'A',
        icon: img ? img.src.split('/').pop() : '',
        pn: clean(m[1]).slice(0, 60),
        p: clean(m[2]).slice(0, 400)
      });
    });
    return out;
  }

  // ── поехали ───────────────────────────────────────────────────────────────
  const slugs = Object.keys(SLUGS);
  console.log('%cprydwen: тир-лист + ' + slugs.length + ' агентов, примерно ' +
              Math.ceil((slugs.length + 1) * PAUSE / 60000) + ' мин',
              'color:#ffd54a;font-size:14px');

  let tierRes = { tiers: {}, miss: [] };
  try {
    const doc = location.pathname.indexOf('tier-list') >= 0 ? document : await getDoc(TIER_URL);
    tierRes = readTiers(doc);
    const n = Object.values(tierRes.tiers).reduce(
      (s, r) => s + r.dmg.length + r.anomaly.length + r.support.length, 0);
    console.log('  тир-лист: ' + n + ' агентов');
    Object.keys(tierRes.tiers).forEach(t => {
      const r = tierRes.tiers[t];
      console.log('    ' + t.padEnd(3) + ' урон ' + r.dmg.length +
                  ' · аномалия ' + r.anomaly.length + ' · поддержка ' + r.support.length);
    });
    if (tierRes.miss.length) console.warn('    не сопоставились: ' + tierRes.miss.join(', '));
    if (!n) {
      console.warn('    ссылок на агентов: ' + (tierRes.links || 0) +
        ', меток тиров найдено: ' + ((tierRes.marks || []).join(' ') || 'ни одной') +
        '\n    Разметка изменилась — пришли мне эту строку.');
    }
  } catch (e) {
    console.warn('  тир-лист не собрался: ' + e.message);
  }
  await sleep(PAUSE);

  const agents = {};
  let ok = 0, fail = 0;
  const thin = [];        // разобрались не полностью — покажем в конце
  window.__prydBad = null;
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    try {
      const doc = await getDoc('/zenless/characters/' + slug);
      const a = readAgent(doc, slug);
      if (!a.disk4 && !a.engines.length) throw new Error('пусто');
      agents[a.id] = a;
      ok++;
      if (!a.engines.length || !a.set4.length) {
        thin.push(slug);
        // первый сбойный блок оставляем целиком: по нему видно, что за разметка
        if (!window.__prydBad) {
          const box = buildBox(doc);
          window.__prydBad = { slug: slug, html: box ? box.innerHTML.slice(0, 4000) : 'блока нет' };
        }
      }
      const tn = a.teams ? (a.teams.shiyu.length + a.teams.da.length) : 0;
      console.log('  ' + (i + 1) + '/' + slugs.length + '  ' + slug +
                  '  диски ' + (a.disk5 ? '✓' : '·') +
                  '  цели ' + (Object.keys(a.goals).length || '·') +
                  '  сеты ' + (a.set4.length || '·') +
                  '  движки ' + (a.engines.length || '·') +
                  '  команды ' + (tn || '·') +
                  '  фракция ' + (a.faction || '·'));
    } catch (e) {
      fail++;
      console.warn('  ' + (i + 1) + '/' + slugs.length + '  ' + slug + '  — ' + e.message);
    }
    if (i < slugs.length - 1) await sleep(PAUSE);
  }
  if (thin.length) {
    console.warn('%cБез комплектов или движков: ' + thin.length + ' — ' + thin.join(', ') +
      '\nРазметка изменилась. Выполни  copy(JSON.stringify(__prydBad))  и пришли результат.',
      'color:#fbbf24;font-size:13px');
  }

  // ── баннеры ───────────────────────────────────────────────────────────────
  let banners = null;
  try {
    await sleep(PAUSE);
    const bdoc = await getDoc('/zenless/banners');
    const list = readBanners(bdoc);
    if (list.length) {
      banners = { updated: new Date().toISOString().slice(0, 10),
                  src: 'https://www.prydwen.gg/zenless/banners', list: list };
      const cur = list.filter(x => x.cur).length;
      console.log('  баннеры: ' + list.length + ' (сейчас идут ' + cur + ')');
      list.forEach(x => console.log('    ' + (x.cur ? '▶ ' : '· ') + x.slug +
        '  ' + x.patch + ' ф.' + x.phase + '  ' + x.from + ' – ' + x.to +
        (x.id ? '' : '  (нет в базе)')));
    } else {
      console.warn('  баннеры не разобрались — разметка страницы изменилась');
    }
  } catch (e) {
    console.warn('  баннеры не собрались: ' + e.message);
  }

  // ── бангбу ────────────────────────────────────────────────────────────────
  let bangboo = null;
  try {
    const cards = readBangboo();
    if (cards) {
      await sleep(1500);                 // ждём, пока откроются вкладки пассивок
      const list = collectBangboo(cards);
      if (list.length) {
        bangboo = { updated: new Date().toISOString().slice(0, 10),
                    src: 'https://www.prydwen.gg/zenless/bangboo', list: list };
        console.log('  бангбу: ' + list.length +
                    ' (с условием: ' + list.filter(x => /squad/i.test(x.p)).length + ')');
      }
    } else {
      console.log('%c  бангбу пропущены: чтобы собрать и их, запусти скрипт со страницы ' +
                  'https://www.prydwen.gg/zenless/bangboo', 'color:#8ab4f8');
    }
  } catch (e) {
    console.warn('  бангбу не собрались: ' + e.message);
  }

  const json = JSON.stringify({
    sourceName: 'prydwen.gg',
    source: 'https://www.prydwen.gg/zenless/',
    note: 'Тир-лист и рекомендации по сборкам. Источник: prydwen.gg, шкала T0–T3 переведена в буквы.',
    built: new Date().toISOString().slice(0, 16).replace('T', ' '),
    roles: { dmg: 'Урон', anomaly: 'Урон аномалии', support: 'Поддержка' },
    tiers: tierRes.tiers,
    // если баннеры или бангбу не разобрались, поле не пишем — трекер оставит прежние
    banners: banners || undefined,
    bangboo: bangboo || undefined,
    agents: agents
  });

  console.log('%cГотово: агентов собрано ' + ok + ', не вышло ' + fail,
              'color:#4ade80;font-size:14px');
  window.__pryd = json;
  try {
    await navigator.clipboard.writeText(json);
    console.log('%cСкопировано в буфер — сохрани как zzz-guide.json', 'color:#4ade80;font-size:13px');
  } catch (e) {
    console.log('%cБуфер недоступен. Выполни:  copy(__pryd)', 'color:#fbbf24;font-size:13px');
  }
})();
