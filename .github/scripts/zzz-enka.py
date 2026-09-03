# Забирает данные с enka.network и складывает их в один файл рядом с сайтом.
#
# Профилей может быть несколько — свой и друзей. Перечисляются через запятую
# в переменных репозитория ZZZ_UID / ZZZ_USER / ZZZ_HASH, позиции соответствуют
# друг другу. Пустое место в списке пропускается.
#
# Витрина в игре вмещает шесть агентов, поэтому основной источник — сохранённые
# сборки в аккаунте Enka: их сколько угодно, и там копится вся коллекция.

import json
import os
import time
import urllib.error
import urllib.request

UA = 'alextask-zzz-tracker/1.0 (+https://alextask.ru)'
API = 'https://enka.network'

# Профиль по умолчанию — чтобы ничего не настраивать руками.
# Переменные репозитория ZZZ_UID / ZZZ_USER / ZZZ_HASH, если заданы, важнее.
DEFAULTS = {
    'ZZZ_UID':  '1502024259',
    'ZZZ_USER': '12dogswog76',
    'ZZZ_HASH': '2gGW9D',
}


def split(name):
    raw = (os.environ.get(name) or '').strip() or DEFAULTS.get(name, '')
    return [x.strip() for x in raw.split(',')]


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        print('   не вышло:', url, '—', e)
        return None


uids = split('ZZZ_UID')
users = split('ZZZ_USER')
hashes = split('ZZZ_HASH')
count = max(len(uids), len(users))

profiles = []
for i in range(count):
    uid = uids[i] if i < len(uids) else ''
    user = users[i] if i < len(users) else ''
    hsh = hashes[i] if i < len(hashes) else ''
    if not uid and not user:
        continue

    print('Профиль', i + 1, '· uid:', uid or '—', '· ник:', user or '—')
    showcase = get('%s/api/zzz/uid/%s/' % (API, uid)) if uid else None

    builds = None
    if user:
        if not hsh:
            hoyos = get('%s/api/profile/%s/hoyos/' % (API, user)) or {}
            hsh = next(iter(hoyos), '')
            if hsh:
                print('   хеш профиля:', hsh)
        if hsh:
            builds = get('%s/api/profile/%s/hoyos/%s/builds/' % (API, user, hsh))

    if not showcase and not builds:
        print('   пусто, пропускаю')
        continue

    # имя для выбора в трекере: ник в игре, иначе ник на Enka, иначе UID
    nick = ''
    try:
        nick = showcase['PlayerInfo']['SocialDetail']['ProfileDetail']['Nickname']
    except Exception:
        pass

    shown = (((showcase or {}).get('PlayerInfo') or {})
             .get('ShowcaseDetail') or {}).get('AvatarList') or []
    print('   сборок:', len(builds or {}), '· в витрине:', len(shown))

    profiles.append({
        'uid': uid,
        'user': user,
        'hash': hsh,
        'nick': nick or user or uid,
        'showcase': showcase,
        'builds': builds,
    })

if not profiles:
    raise SystemExit('нечего сохранять: ни один профиль не ответил')

out = {'built': time.strftime('%Y-%m-%d %H:%M', time.gmtime()), 'profiles': profiles}

# первый профиль дублируем на верхнем уровне — так понимают старые версии трекера
out['uid'] = profiles[0]['uid']
out['showcase'] = profiles[0]['showcase']
out['builds'] = profiles[0]['builds']

with open('zzz-enka.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

print('готово, профилей:', len(profiles))
