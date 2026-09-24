// Выгрузка аккаунта SKPORT — скрипт для консоли на www.skport.com.
//
// Как было и почему не работало. Раньше человек копировал ключи skport
// (cred и токен подписи) к нам, и страница alextask сама ходила в
// zonai.skport.com. Это ломалось в трёх местах:
//   1) cred лежит не в localStorage, а в cookie SK_OAUTH_CRED_KEY — команда
//      копировала «null|токен»;
//   2) токен подписи живёт недолго, его надо обновлять (/web/v1/auth/refresh);
//   3) главное — zonai.skport.com не отдаёт CORS чужим сайтам: запрос с
//      alextask.ru браузер просто не пропускает.
//
// Как теперь. Функция ниже НЕ выполняется на нашей странице — её текст
// показывается в разделе «Хроника», человек вставляет его в консоль (F12) на
// www.skport.com, где он уже вошёл. Там запросы к zonai разрешены. Скрипт сам
// берёт cred из cookie, обновляет токен, находит игровой аккаунт Endfield,
// забирает данные и копирует в буфер ТОЛЬКО ответы — без cred и токена.
// Ключи не покидают страницу skport, к нам приходят одни игровые данные.
//
// Подпись (как у их веб-клиента):
//   sign = md5( hex( HMAC-SHA256( путь + query + timestamp +
//          '{"platform":"3","timestamp":"…","dId":"","vName":"1.0.0"}', токен ) ) )

'use strict';

async function skЭкспорт() {
  const HOST = 'https://zonai.skport.com';
  const cookie = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
  const ls = k => { try { return (localStorage.getItem(k) || '').replace(/^"|"$/g, ''); } catch (e) { return ''; } };
  const cred = cookie('SK_OAUTH_CRED_KEY') || ls('SK_OAUTH_CRED_KEY');
  if (!cred) { alert('alextask: не вижу входа в SKPORT. Открой www.skport.com, войди в аккаунт и повтори.'); return; }
  const base = { platform: '3', vName: '1.0.0' };
  const log = [];

  // токен подписи: свежий через refresh, запасной — из кеша их сайта
  let token = '';
  try {
    const r = await (await fetch(HOST + '/web/v1/auth/refresh', { headers: Object.assign({ cred }, base) })).json();
    if (r && r.data && r.data.token) token = r.data.token; else log.push('refresh: ' + (r && (r.message || r.code)));
  } catch (e) { log.push('refresh: ' + e.message); }
  if (!token) token = ls('SK_TOKEN_CACHE_KEY');
  if (!token) { alert('alextask: не получил токен подписи. Перезайди в SKPORT и повтори.'); return; }

  // md5 — в браузере его нет
  const md5 = s => { s = unescape(encodeURIComponent(s)); const k = [], r = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]; for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    let h = [1732584193, -271733879, -1732584194, 271733878]; const n = s.length, w = []; for (let i = 0; i < n; i++) w[i >> 2] |= s.charCodeAt(i) << (i % 4 * 8); w[n >> 2] |= 128 << (n % 4 * 8); const L = ((n + 8 >> 6) + 1) * 16; w[L - 2] = n * 8; for (let i = 0; i < L; i++) w[i] |= 0;
    for (let j = 0; j < L; j += 16) { let [a, b, c, d] = h; for (let i = 0; i < 64; i++) { let f, g; if (i < 16) { f = b & c | ~b & d; g = i; } else if (i < 32) { f = d & b | ~d & c; g = (5 * i + 1) % 16; } else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = 7 * i % 16; }
      const t = d; d = c; c = b; const x = a + f + k[i] + w[j + g] | 0, sh = r[(i >> 4) * 4 + i % 4]; b = b + (x << sh | x >>> 32 - sh) | 0; a = t; } h = [h[0] + a | 0, h[1] + b | 0, h[2] + c | 0, h[3] + d | 0]; }
    return h.map(v => [0, 1, 2, 3].map(i => (v >>> i * 8 & 255).toString(16).padStart(2, '0')).join('')).join(''); };
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const enc = new TextEncoder();
  const hkey = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  async function get(path, params, role) {
    const q = params ? new URLSearchParams(params).toString() : '';
    const ts = String(Math.floor(Date.now() / 1000));
    const str = path + q + ts + JSON.stringify({ platform: '3', timestamp: ts, dId: '', vName: '1.0.0' });
    const sign = md5(hex(await crypto.subtle.sign('HMAC', hkey, enc.encode(str))));
    const h = Object.assign({ cred, timestamp: ts, sign, 'sk-language': 'ru_RU' }, base);
    if (role) h['sk-game-role'] = role;
    const r = await fetch(HOST + path + (q ? '?' + q : ''), { headers: h });
    const t = await r.text();
    try { return JSON.parse(t); } catch (e) { return { code: -1, message: 'не json (' + r.status + '): ' + t.slice(0, 80) }; }
  }
  // все объекты с roleId+serverId внутри ответа
  function roles(o, out, app) {
    if (!o || typeof o !== 'object') return out;
    if (Array.isArray(o)) { o.forEach(x => roles(x, out, app)); return out; }
    const a = o.appCode || o.gameCode || app;
    if (o.roleId && o.serverId) out.push({ roleId: String(o.roleId), serverId: String(o.serverId), nick: o.nickname || o.nickName || '', level: o.level, app: a });
    Object.values(o).forEach(v => roles(v, out, a));
    return out;
  }

  const out = { mark: 'alextask-skport', v: 1, at: new Date().toISOString(), data: {}, log };
  // Профиль skport нужен только ради userId — сам профиль (почта, телефон)
  // в выгрузку не кладём.
  const user = await get('/web/v2/user');
  if (user.code !== 0) log.push('user: ' + (user.message || user.code));
  const userId = user && user.data && user.data.user && (user.data.user.id || user.data.user.userId) || '';

  const bind = await get('/api/v1/game/player/binding');
  if (bind.code !== 0) { log.push('binding: ' + (bind.message || bind.code)); }
  else out.data.binding = bind.data;
  const все = roles(bind.data, [], '');
  const ro = все.find(r => /endfield/i.test(r.app || '')) || все[0];
  if (!ro) {
    alert('alextask: в SKPORT не нашёлся привязанный аккаунт Endfield. ' + log.join('; '));
    return;
  }
  out.role = ro;
  const role = '3_' + ro.roleId + '_' + ro.serverId;

  // Подробная карточка: пробуем варианты параметров, берём первый успешный.
  const варианты = [
    { roleId: ro.roleId, serverId: ro.serverId, userId: userId },
    { roleId: ro.roleId, serverId: ro.serverId },
  ];
  for (const path of ['/api/v1/game/endfield/card/detail', '/web/v1/game/endfield/card/detail']) {
    for (const p of варианты) {
      if (!p.userId && 'userId' in p) continue;
      const r = await get(path, p, role);
      if (r.code === 0) { out.data.card = r.data; out.cardPath = path; break; }
      log.push(path + ' ' + JSON.stringify(Object.keys(p)) + ': ' + (r.message || r.code));
    }
    if (out.data.card) break;
  }

  const текст = JSON.stringify(out);
  let ok = false;
  try { if (typeof copy === 'function') { copy(текст); ok = true; } } catch (e) {}
  if (!ok) try { await navigator.clipboard.writeText(текст); ok = true; } catch (e) {}
  if (!ok) { console.log(текст); alert('alextask: не смог положить в буфер — скопируй текст из консоли.'); return; }
  alert('alextask: готово, в буфере ' + Math.round(текст.length / 1024) + ' КБ.\n' +
    (out.data.card ? 'Карточка аккаунта есть.' : 'Карточка не пришла: ' + log.slice(-2).join('; ')) +
    '\nВставь в alextask → Endfield → Хроника.');
}
