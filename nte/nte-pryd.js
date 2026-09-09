/**
 * nte-pryd.js v1.7 — забирает с prydwen.gg данные по Neverness to Everness:
 *                    список эсперов, тир-лист, сборки, Arc'и, картриджи,
 *                    баннеры, команды, синергии и коды активации.
 *
 * Зачем через браузер: сайт закрыт проверкой Cloudflare, скрипту снаружи он
 * отдаёт заглушку. Внутри уже открытой вкладки проверка пройдена, и запросы к
 * своим же страницам идут как обычные. Тот же приём, что в pryd.js для ZZZ.
 *
 * Как пользоваться:
 *   1. Открыть https://www.prydwen.gg/neverness-to-everness/characters
 *   2. F12 → вкладка Console
 *   3. Вставить весь этот файл, нажать Enter
 *   4. Ждать. В консоли идёт счётчик, всего пара минут на 24 эспера
 *   5. Результат сам скопируется в буфер. Сохранить его как nte-guide.json
 *      в папку сайта и выложить
 *
 * Если буфер оказался пустым (вкладка была неактивна) — выполнить в консоли:
 *      copy(__nte)
 *
 * Что собирается по каждому эсперу:
 *   name, el, role, pic   — имя, стихия, роль, файл портрета
 *   tier                  — место в тир-листе (T0…T3 → S+…D)
 *   ratings               — оценки по режимам, как их пишет prydwen
 *   arcs                  — оружие: { n, m (копия M1..M5), pct, note }
 *   carts                 — картриджи: { n, pct, note }
 *   main / subs           — приоритет главных и дополнительных характеристик
 *   goals / goalNotes     — целевые значения из «Recommended endgame stats»
 *   set                   — рекомендованный набор: имя и тексты бонусов 2 и 4
 *   trait                 — Character Console Trait, бонус за типы модулей
 *   pieces                — какие типы модулей нужны: ['II','III','III','IV']
 *   grid                  — тип сетки Console
 *   skills                — порядок прокачки
 *   synergy               — с кем играется: [{ with:[слаги], notes:[строки] }]
 *   teams                 — готовые составы с его страницы
 *
 * Плюс общие справочники: elements/roles, тир-лист команд и коды активации.
 *
 * Разбор целей взят из pryd.js v4.5 вместе с исправлениями: процент после
 * первого числа («38% - 72%»), дробные значения, подпись, приклеенная к концу
 * предыдущего предложения. В NTE формат тот же самый, грабли те же.
 */

(async () => {
  const VER = 'v1.8';
  const PAUSE = 4000;                 // пауза между страницами
  const BASE = '/neverness-to-everness';

  const TIER_MAP = { 'T0':'S+', 'T0.5':'S', 'T1':'A', 'T1.5':'B', 'T2':'C', 'T3':'D' };

  // Подпись характеристики на сайте -> ключ в трекере. Стихийный урон у NTE
  // называется по стихии («Anima DMG»), поэтому все шесть ведут в один ключ
  // elem: у эспера стихия всегда одна, и различать их незачем.
  const STAT = {
    'HP':'hp', 'ATK':'atk', 'DEF':'def',
    'CRIT RATE':'cr', 'CRIT DMG':'cd',
    'UNIVERSAL DMG':'dmg', 'DMG':'dmg',
    'BREAK':'brk', 'BREAK EFFECT':'brk',
    'ENERGY REGEN':'er', 'CYCLE INTENSITY':'cyc',
    'ANIMA DMG':'elem', 'CHAOS DMG':'elem', 'COSMOS DMG':'elem',
    'INCANTATION DMG':'elem', 'LAKSHANA DMG':'elem', 'PSYCHE DMG':'elem'
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const txtOf = el => clean(el ? el.textContent : '');

  const getDoc = async url => {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  };

  // кусок текста от подписи раздела до ближайшей из следующих подписей
  function between(txt, from, to) {
    const i = txt.indexOf(from);
    if (i < 0) return '';
    const rest = txt.slice(i + from.length);
    let end = rest.length;
    for (const t of to) { const j = rest.indexOf(t); if (j >= 0 && j < end) end = j; }
    return rest.slice(0, end).trim();
  }

  // ── целевые характеристики ────────────────────────────────────────────────
  // «Crit Rate: 60%+», «HP: 17,000+», «Crit DMG: 100%+ before 56% from ...»
  const NUM = '([\\d,]+(?:\\.\\d+)?)';
  const GRE = new RegExp(
    '([A-Za-z][A-Za-z .]*?)\\s*:\\s*(?:max\\.?|min\\.?|about|around|~)?\\s*' +
    NUM + '\\s*(%?)\\s*\\+?\\s*(?:(?:-|–|—|to)\\s*' + NUM + '\\s*(%?)\\s*\\+?)?' +
    '\\s*(?:\\(([^)]{0,160})\\))?', 'g');

  // «… bonus Crit DMG» → 'cd'. Ищем самое длинное совпадение с конца подписи.
  function statKey(raw) {
    const w = String(raw || '').toUpperCase().split(/[^A-Z%]+/).filter(Boolean);
    for (let n = Math.min(3, w.length); n >= 1; n--) {
      const k = STAT[w.slice(w.length - n).join(' ')];
      if (k) return k;
    }
    return null;
  }

  function readGoals(block) {
    const goals = {}, notes = {};
    const eg = block.replace(/\s*\n\s*/g, ' ');
    let m;
    GRE.lastIndex = 0;
    while ((m = GRE.exec(eg))) {
      // Подпись бывает приклеена к концу предыдущего предложения, причём
      // предыдущее может кончаться цифрой: «Crit Rate: 30%+ before Passive 1 or
      // Street Boxer set bonus Crit DMG: 120%+». Из-за цифры совпадение
      // начиналось с середины пояснения, ключ не узнавался и крит. урон
      // терялся целиком. Поэтому пробуем хвосты подписи: три слова, два, одно.
      const k = statKey(m[1]);
      if (!k) continue;
      const toN = s => parseFloat(String(s).replace(/,/g, ''));
      const lo = toN(m[2]), hi = m[4] != null ? toN(m[4]) : lo;
      if (!isFinite(lo)) continue;
      goals[k] = [lo, hi];
      const note = clean(m[6] || '');
      if (note && note.length > 12 && !/^optional$/i.test(note)) notes[k] = note;
    }
    return { goals, notes };
  }

  // Строка приоритета — это статы через «>» и «=», а сразу за последним из них
  // без всякого разделителя начинается пояснение: «… > ATKCrit Rate main stat
  // is only worthwhile …». Резать по звёздочке нельзя: она чаще помечает сам
  // стат в середине строки («Break Intensity* > Chaos DMG %»), и первая версия
  // так потеряла у Chaos весь приоритет, оставив «Crit Rate».
  //
  // Ищем место склейки: конец аббревиатуры перед началом слова (ATK|Chaos) или
  // звёздочка перед заглавной буквой (Break Intensity*Break Intensity increases).
  const STAT_GLUE = /\*[A-Z]|[A-Z]{2,}(?=[A-Z][a-z])/;
  function statCut(s) {
    const t = clean(s);
    const m = STAT_GLUE.exec(t);
    if (!m || m.index < 4) return { line: t, rest: '' };
    // у звёздочки отрезаем её саму, у аббревиатуры — оставляем её в строке
    const at = m[0][0] === '*' ? m.index : m.index + m[0].length;
    return { line: clean(t.slice(0, at)), rest: clean(t.slice(at)) };
  }
  function statLine(s) {
    // звёздочки-пометки внутри строки убираем: они отсылают к сноске, которая
    // теперь и так лежит отдельным полем
    return statCut(s).line.replace(/\*/g, '').replace(/[>=]+\s*$/, '').trim();
  }

  // «Damage [A6]T1.5Endgame PVE» → роль, пробуждение, тир, режим
  function readRatings(s) {
    const t = clean(s);
    const m = t.match(/^([A-Za-z]+)\s*\[(A[\d+]+)\]\s*(T[\d.]+)\s*(.*)$/);
    if (!m) return { raw: t.slice(0, 120) };
    return { role: m[1], awk: m[2], tier: TIER_MAP[m[3]] || m[3], mode: clean(m[4]).slice(0, 40) };
  }

  // ── список эсперов ────────────────────────────────────────────────────────
  // Имя на карточке слипается с меткой версии: «Akane Rin1.4», «ZankouNew».
  // Отрезаем хвост, иначе он приедет прямо в базу.
  function cardName(s) {
    return clean(String(s || '').replace(/(New|Soon|\d+\.\d+)\s*$/i, ''));
  }
  function readList(doc) {
    return [...doc.querySelectorAll('.avatar-card')].map(c => {
      const a = c.querySelector('a[href*="/characters/"]');
      const imgs = [...c.querySelectorAll('img')];
      const src = i => (i && (i.getAttribute('src') || i.getAttribute('data-src') || '')) || '';
      const byPart = p => imgs.filter(i => src(i).indexOf(p) >= 0)[0] || null;
      const el = byPart('element_'), role = byPart('role_');
      return {
        slug: a ? a.getAttribute('href').split('/').pop() : '',
        name: cardName(c.textContent),
        el:   el ? clean(el.getAttribute('alt')) : '',
        role: role ? clean(role.getAttribute('alt')) : '',
        pic:  (src(imgs[0]).split('/').pop() || '').split('?')[0]
      };
    }).filter(x => x.slug);
  }

  // ── тир-лист ──────────────────────────────────────────────────────────────
  // Идём по документу подряд: метка тира, потом ссылки на эсперов под ней.
  // Смотрим текстовые узлы, а не элементы: обёртка вокруг «T0» ломала бы разбор.
  function readTiers(doc) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    const out = {}, seen = new Set();
    let cur = '', node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) {
        const t = clean(node.nodeValue);
        if (TIER_MAP[t]) cur = t;
        continue;
      }
      if (node.tagName !== 'A' || !cur) continue;
      const m = (node.getAttribute('href') || '').match(/\/characters\/([a-z0-9\-]+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      out[m[1]] = TIER_MAP[cur];
    }
    return out;
  }

  // ── Arc'и и картриджи со страницы эспера ──────────────────────────────────
  // Берём по классам разметки, а не из текста: имя лежит в аккордеоне, рядом
  // процент и копия, а сплошной текст их склеивает в кашу.
  // Блоков сборки на странице бывает больше двух: у Zero их три — основные
  // Arc'и, альтернативный Arc под другой стиль игры и только потом картриджи.
  // Брать по номеру нельзя, иначе картриджи теряются целиком; ищем по тому,
  // какие аккордеоны внутри. Плюс вся секция продублирована в разметке (вёрстка
  // под разную ширину), поэтому в конце дедупликация по имени и копии.
  function readAll(doc, kind) {
    const sel = kind === 'arc' ? '.nte-weapon-accordion' : '.nte-set-accordion';
    const out = [], seen = new Set();
    [...doc.querySelectorAll('.build-setup.weapons')].forEach(box => {
      if (!box.querySelector(sel)) return;
      readPicks(box, kind).forEach(x => {
        const key = x.n + '|' + x.m;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(x);
      });
    });
    return out.map((x, i) => Object.assign({}, x, { i: i + 1 }));
  }

  function readPicks(box, kind) {
    const sel = kind === 'arc' ? '.nte-weapon-accordion' : '.nte-set-accordion';
    // Процент лежит отдельным узлом перед аккордеоном и ни к чему не привязан
    // классом. Соседний элемент брать нельзя — у картриджей его просто нет.
    // Поэтому собираем все проценты блока по порядку и раздаём по индексу:
    // порядок в разметке тот же, что у самих карточек. Узлы внутри аккордеонов
    // отсекаем — там проценты из описаний бонусов («Anima DMG +10%»).
    const pcts = [...box.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && !e.closest('.pw-accordion') &&
                   /^\d+(\.\d+)?%$/.test(clean(e.textContent)))
      .map(e => parseFloat(clean(e.textContent)));
    return [...box.querySelectorAll(sel)].map((el, i) => {
      const head = clean(el.textContent).slice(0, 400);
      // «Fluff of Fleetness(M5)» → имя и копия отдельно
      const nm = (el.querySelector('.nte-weapon-name, .sets, h5, h4, strong') || {}).textContent;
      const name = clean(nm || head.split('(')[0]);
      const mm = head.match(/\((M\d)\)/);
      const rar = (el.querySelector('[class*="rarity-"]') || {}).className || '';
      const rm = rar.match(/rarity-([SAB])/);
      return {
        n: name.replace(/\(M\d\)\s*$/, '').trim(),
        m: mm ? mm[1] : '',
        pct: pcts[i] != null ? pcts[i] : null,
        r: rm ? rm[1] : '',
        i: i + 1
      };
    }).filter(x => x.n);
  }

  // ── команды и синергии ────────────────────────────────────────────────────
  // Классы у блоков команд на сайте свои и меняются от раздела к разделу,
  // поэтому опираемся не на них, а на структуру: ссылка на эспера ведёт на
  // /characters/<слаг>, и этого достаточно, чтобы опознать и участника состава,
  // и заголовок команды (он как раз ссылкой не является).
  const isCharLink = el => el && el.tagName === 'A' &&
    /\/characters\/[a-z0-9-]+/.test(el.getAttribute('href') || '');
  const slugOfLink = el => ((el.getAttribute('href') || '')
    .match(/\/characters\/([a-z0-9-]+)/) || [])[1] || '';
  const charLinks = el => isCharLink(el) ? [el] :
    [...el.querySelectorAll('a[href*="/characters/"]')].filter(isCharLink);

  // «Synergies»: разметка такая — .column содержит ссылку на союзника, а внутри
  // неё .synergy со списком пояснений. Ссылка списку не сосед и даже не родитель,
  // поэтому ищем её, поднимаясь от <ul> вверх на пару уровней. Первая версия
  // смотрела только на previousElementSibling и не находила ничего вообще.
  // Иногда один набор буллетов относится сразу к двум эсперам (Mint/Nanally) —
  // тогда в with окажутся оба слага.
  function readSynergy(doc) {
    const out = [], seen = new Set();
    [...doc.querySelectorAll('ul')].forEach(ul => {
      // у навигационных списков есть класс, у синергий — нет
      if (ul.className || ul.closest('.breadcrumb')) return;
      let box = ul.parentElement, links = [];
      for (let i = 0; i < 3 && box && !links.length; i++, box = box.parentElement) links = charLinks(box);
      if (!links.length) return;
      const notes = [...ul.children].map(li => clean(li.textContent))
        // в паре мест у prydwen внутри буллета остался незакрытый тег
        .map(x => x.replace(/\s*li>\s*$/, ''))
        .filter(x => x.length > 8).slice(0, 8);
      if (!notes.length) return;
      const withs = [...new Set(links.map(slugOfLink).filter(Boolean))];
      const key = withs.join('|');
      if (!withs.length || seen.has(key)) return;
      seen.add(key);
      out.push({ with: withs, notes: notes });
    });
    return out;
  }

  // Состав — контейнер (.team-row), у которого каждый ребёнок это слот с одним
  // эспером или с двумя-тремя взаимозаменяемыми. Опираться на классы нельзя:
  // они разные на странице эспера и в тир-листе команд. Зато признак «у всех
  // детей есть ссылка на персонажа, и больше трёх ни у кого» держится везде.
  function teamBoxes(root) {
    const out = [], seen = new Set();
    [...root.querySelectorAll('*')].forEach(el => {
      const kids = [...el.children];
      if (kids.length < 3 || kids.length > 6) return;
      if (!kids.every(k => charLinks(k).length)) return;
      const slots = kids.map(k => [...new Set(charLinks(k).map(slugOfLink).filter(Boolean))]);
      if (slots.some(s => !s.length || s.length > 3)) return;
      const key = slots.map(s => s.join('/')).join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ el: el, slots: slots });
    });
    return out;
  }
  // Название состава — ближайший заголовок перед контейнером в порядке
  // документа. Искать заголовок внутри предка нельзя: у второго состава на
  // странице так подхватывалось имя первого.
  function teamName(box) {
    let node = box;
    while (node) {
      let s = node.previousElementSibling;
      while (s) {
        if (!charLinks(s).length) {
          const h = s.matches('h3,h4,h5,h6') ? s : s.querySelector('h3,h4,h5,h6');
          const t = clean((h || s).textContent);
          if (t && t.length > 2 && t.length < 60 && !TIER_MAP[t]) return t;
        }
        s = s.previousElementSibling;
      }
      node = node.parentElement;
    }
    return '';
  }
  function readTeams(doc, self) {
    return teamBoxes(doc.body)
      .filter(b => !self || b.slots.some(s => s.indexOf(self) >= 0))
      .map(b => ({ name: teamName(b.el), slots: b.slots }));
  }

  // Тир-лист команд: сами составы читаются тем же разбором, а тир берётся из
  // текстовых узлов («T0», «T1.5»), которые идут по документу перед ними.
  function readTeamTiers(doc) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    const tierAt = new Map();
    let cur = '', node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) { const t = clean(node.nodeValue); if (TIER_MAP[t]) cur = TIER_MAP[t]; }
      else tierAt.set(node, cur);
    }
    return teamBoxes(doc.body).map(b => ({
      tier: tierAt.get(b.el) || '', name: teamName(b.el), slots: b.slots
    }));
  }

  // ── коды активации ────────────────────────────────────────────────────────
  // Разбирать видимый текст тут не нужно: коды приезжают готовым JSON внутри
  // потока данных Next.js — со статусом, пометкой и датами. Через текст же
  // доставались только код и награда, а дата терялась: она лежит отдельным
  // узлом, и «Released on» с ней не склеивается.
  function parseCodes(html) {
    const s = String(html).replace(/\\"/g, '"');
    const out = [], seen = new Set();
    const re = /"code":"([A-Za-z0-9]{4,32})"([\s\S]{0,500}?)"status":"([a-z]+)"/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[3] !== 'active' || seen.has(m[1])) continue;
      seen.add(m[1]);
      const b = m[2];
      const pick = rx => (b.match(rx) || [])[1] || '';
      out.push({
        code:  m[1],
        rew:   pick(/"rewards":"([^"]*)"/),
        note:  pick(/"description":"([^"]*)"/),
        date:  pick(/"validFrom":"[^"]*?(\d{4}-\d{2}-\d{2})/),
        until: pick(/"validUntil":"[^"]*?(\d{4}-\d{2}-\d{2})/)
      });
    }
    return { updated: (s.match(/"lastUpdated":"([^"]+)"/) || [])[1] || '', list: out };
  }
  async function readCodes() {
    const r = await fetch(BASE + '/codes', { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return parseCodes(await r.text());
  }

  // ── одна страница эспера ──────────────────────────────────────────────────
  async function readChar(base) {
    const doc = await getDoc(BASE + '/characters/' + base.slug);
    const txt = clean(doc.body ? doc.body.textContent : '');
    const out = Object.assign({}, base);

    out.arcs  = readAll(doc, 'arc');
    out.carts = readAll(doc, 'cart');

    // приоритет характеристик
    const st = between(txt, 'Best Stats', ['Recommended endgame stats', 'Modules setup', 'Skill Priority']);
    const mm = st.match(/Main Stats\s*(.+?)\s*Sub Stats/i);
    const sm = st.match(/Sub Stats\s*(.+)$/i);
    // В строку приоритета часто вклеена сноска и даже вторая сборка целиком
    // («SubDPS Main Stats …»). В сыром виде это читалось как один бесконечный
    // приоритет, где после «ATK» идёт абзац текста. Пояснения от обеих строк
    // складываем в одно поле — на странице они и так идут одним куском.
    const cm = statCut(mm ? mm[1] : ''), cs = statCut(sm ? sm[1] : '');
    out.main = statLine(mm ? mm[1] : '');
    out.subs = statLine(sm ? sm[1] : '');
    const note = clean([cm.rest, cs.rest].filter(Boolean).join(' '));
    if (note) out.statNote = note.slice(0, 400);

    // целевые значения
    const eg = between(txt, 'Recommended endgame stats',
      ['Modules setup', 'Skill Priority', 'Teams & Synergy', 'Console Grid']);
    const g = readGoals(eg);
    out.goals = g.goals;
    out.goalNotes = g.notes;

    // Рекомендованный набор модулей. Имя берём из карточки внутри блока
    // «Modules setup», а не первым попавшимся `.sets` на странице: тот же класс
    // носят все картриджи из списка выше, и у Zero в набор попадал Speedy
    // Hedgehog вместо Lost Radiance — с чужими бонусами в придачу.
    const ms = between(txt, 'Modules setup', ['Console Grid', 'Skill Priority', 'Teams & Synergy']);
    const card = doc.querySelector('.cartridge-item');
    const setName = txtOf(card && card.querySelector('.sets')) ||
                    clean((card ? card.textContent : '').split('(')[0]);
    const b2 = ms.match(/\(2\)\s*(.+?)\s*\(4\)/);
    const b4 = ms.match(/\(4\)\s*(.+?)(?:Character Console Trait|Required pieces|$)/);
    out.set = { n: setName || '', b2: b2 ? clean(b2[1]) : '', b4: b4 ? clean(b4[1]) : '' };

    // бонус эспера за типы модулей и какие типы нужны
    const tr = ms.match(/Character Console Trait:\s*(.+?)(?:Required pieces|Console Grid|$)/);
    out.trait = tr ? clean(tr[1]) : '';
    const rp = ms.match(/Required pieces:\s*(.+?)(?:Console Grid|Skill Priority|$)/);
    // «II✓III✓III✓IV✓» → ['II','III','III','IV']. Порядок в регулярке от
    // длинного к короткому: иначе «III» распадается на «II» и «I».
    out.pieces = rp ? (rp[1].match(/IV|III|II/g) || []) : [];
    const gr = txt.match(/Console Grid\s*Type:\s*(\d+)/);
    out.grid = gr ? +gr[1] : null;

    // порядок прокачки
    const sk = between(txt, 'Skill Priority', ['Teams & Synergy', 'Synergies', 'Video']);
    out.skills = clean(sk).slice(0, 160);

    // оценки по режимам: «Damage [A6] T1.5 Endgame PVE»
    out.ratings = readRatings(between(txt, 'Ratings', ['Best Build', 'Best Arcs']));

    // с кем играется и готовые составы с его же страницы
    out.synergy = readSynergy(doc).filter(s => s.with.indexOf(base.slug) < 0);
    out.teams = readTeams(doc, base.slug);

    return out;
  }

  // ── баннеры ───────────────────────────────────────────────────────────────
  // Особый случай: разметку баннеров нельзя разобрать через DOM. Она приезжает
  // строкой внутри потока данных Next.js — с экранированными кавычками, — и
  // DOMParser видит на странице ноль карточек, хотя в исходнике их восемь
  // десятков. Снять экранирование и распарсить целиком тоже не выходит: куски
  // сидят внутри <script>, парсер считает их текстом скрипта. Поэтому здесь,
  // единственный раз во всём файле, разбор идёт регулярками по строке.
  //
  // Заголовки подборок не нужны: у каждой сетки есть data-banner-grid со своим
  // ключом, а у карточек — точные даты в ISO.
  const GRID_RU = {
    'current-character':  'Идут сейчас',
    'current-weapon':     'Оружие — идёт сейчас',
    'upcoming-character': 'Следующие эсперы',
    'upcoming-weapon':    'Следующее оружие',
    'next-character':     'Следующие эсперы',
    'next-weapon':        'Следующее оружие'
  };
  function unescapeNext(s) {
    return String(s).replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>')
                    .replace(/\\u0026/gi, '&').replace(/\\"/g, '"');
  }
  const stripTags = s => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  async function readBanners() {
    const r = await fetch(BASE + '/banners', { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const src = unescapeNext(await r.text());
    const out = [], seen = new Set();
    // делим на сетки, каждую — на карточки
    const grids = src.split(/<div class="banner-grid[^"]*" data-banner-grid="/).slice(1);
    for (const g of grids) {
      const key = (g.match(/^([a-z-]+)"/) || [])[1] || '';
      const body = g.split('<div class="banner-grid')[0];
      for (const c of body.split('<article class="banner-card').slice(1)) {
        const cls = (c.match(/^([^"]*)"/) || [])[1] || '';
        const name = stripTags((c.match(/class="banner-name"[^>]*>([^<]+)</) || [])[1] || '');
        if (!name) continue;
        // слаг эспера лежит соседним классом с banner-art, порядок бывает любой
        const art = (c.match(/class="([^"]*\bbanner-art\b[^"]*)"/) || [])[1] || '';
        // «default» — заглушка у карточек будущих баннеров, где арта ещё нет
        const slug = art.split(/\s+/).filter(x =>
          x && x !== 'banner-art' && x !== 'lightcone-art' && x !== 'default' &&
          !/^arc-\d+$/.test(x))[0] || '';
        const meta = stripTags((c.match(/class="banner-phase-meta"[\s\S]{0,400}?<\/div>/) || [])[0] || '');
        const b = {
          group: GRID_RU[key] || key,
          key:   key,
          name:  name,
          slug:  slug,
          kind:  /weapon|lightcone/.test(key + ' ' + cls) ? 'arc' : 'esper',
          top:   cls.indexOf('featured') >= 0,
          patch: (meta.match(/Patch\s+[\d.]+(?:\s+Phase\s+\d+)?/) || [''])[0],
          dates: (c.match(/data-range-eu="([^"]+)"/) || [])[1] || '',
          from:  ((c.match(/data-start-eu="([^"]+)"/) || [])[1] || '').slice(0, 10),
          to:    ((c.match(/data-end-eu="([^"]+)"/) || [])[1] || '').slice(0, 10)
        };
        const k = b.key + '|' + b.name + '|' + b.from;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(b);
      }
    }
    return out;
  }

  // ── поехали ───────────────────────────────────────────────────────────────
  console.log('%cnte-pryd.js ' + VER + ' — собираю данные NTE с prydwen',
    'color:#4ade80;font-size:14px;font-weight:700');

  const listDoc = location.pathname.indexOf('/characters') >= 0 && !/characters\//.test(location.pathname)
    ? document : await getDoc(BASE + '/characters');
  const list = readList(listDoc);
  if (!list.length) {
    console.error('Список эсперов не прочитался. Разметка изменилась — пришли мне вывод ' +
      'document.querySelectorAll(".avatar-card").length');
    return;
  }
  console.log('эсперов в списке: ' + list.length);

  let tiers = {};
  try { tiers = readTiers(await getDoc(BASE + '/tier-list')); console.log('тир-лист: ' + Object.keys(tiers).length); }
  catch (e) { console.warn('тир-лист не забрался: ' + e.message); }

  let banners = [];
  try {
    banners = await readBanners();
    console.log('баннеров: ' + banners.length + ' (' +
      [...new Set(banners.map(b => b.group))].filter(Boolean).length + ' подборок)');
  } catch (e) { console.warn('баннеры не забрались: ' + e.message); }

  let teams = [];
  try {
    teams = readTeamTiers(await getDoc(BASE + '/team-tier-list'));
    console.log('команд в тир-листе: ' + teams.length);
  } catch (e) { console.warn('тир-лист команд не забрался: ' + e.message); }

  let codes = { updated: '', list: [] };
  try {
    codes = await readCodes();
    console.log('кодов: ' + codes.list.length + (codes.updated ? ' (обновлены ' + codes.updated + ')' : ''));
  } catch (e) { console.warn('коды не забрались: ' + e.message); }

  const agents = {};
  const thin = [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    try {
      const a = await readChar(b);
      a.tier = tiers[b.slug] || '';
      agents[b.slug] = a;
      const gk = Object.keys(a.goals).length;
      if (!a.arcs.length || !a.carts.length) thin.push(b.slug);
      console.log('  ' + (i + 1) + '/' + list.length + '  ' + b.slug.padEnd(20) +
        ' тир ' + (a.tier || '·').padEnd(3) +
        ' arc ' + String(a.arcs.length).padEnd(2) +
        ' карт ' + String(a.carts.length).padEnd(2) +
        ' цели ' + String(gk || '·').padEnd(2) +
        ' сет ' + (a.set.n ? '✓' : '·') +
        ' сетка ' + String(a.grid || '·').padEnd(2) +
        ' синерг ' + String(a.synergy.length || '·').padEnd(2) +
        ' команд ' + (a.teams.length || '·'));
    } catch (e) {
      console.warn('  ' + (i + 1) + '/' + list.length + '  ' + b.slug + '  — ' + e.message);
    }
    if (i < list.length - 1) await sleep(PAUSE);
  }
  if (thin.length) {
    console.warn('%cБез Arc или картриджей: ' + thin.length + ' — ' + thin.join(', ') +
      '\nВозможно, у них ещё нет сборки на сайте, но если это все подряд — разметка изменилась.',
      'color:#fbbf24;font-size:13px');
  }

  const outObj = {
    sourceName: 'prydwen.gg',
    source: 'https://www.prydwen.gg/neverness-to-everness/',
    note: 'Собрано nte-pryd.js ' + VER + '. Только сборки и оценки, авторские тексты не забираются.',
    built: new Date().toISOString().slice(0, 16).replace('T', ' '),
    elements: [...new Set(list.map(x => x.el).filter(Boolean))],
    roles: [...new Set(list.map(x => x.role).filter(Boolean))],
    tiers: tiers,
    banners: banners,
    teams: teams,
    teamsNote: 'Тир-лист команд prydwen, режимы Beyond the Rail и High Risk Commissions.',
    codes: codes,
    agents: agents
  };

  window.__nte = JSON.stringify(outObj);
  try { copy(window.__nte); console.log('%cГотово. JSON в буфере — сохрани как nte-guide.json',
    'color:#4ade80;font-size:14px;font-weight:700'); }
  catch (e) { console.log('%cГотово, но буфер не сработал. Выполни:  copy(__nte)',
    'color:#fbbf24;font-size:14px'); }
  console.log('размер: ' + Math.round(window.__nte.length / 1024) + ' КБ, эсперов: ' +
    Object.keys(agents).length);
})();
