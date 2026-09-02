<#
  get-signal-link.ps1 — достаёт ссылку на историю круток ZZZ и кладёт в буфер.

  Как это работает. Игра не отдаёт историю круток наружу, но когда ты
  открываешь в ней «Записи сигналов», клиент ходит на сервер HoYoverse по
  адресу с временным ключом authkey. Этот адрес оседает в локальном кеше
  игры (webCaches\...\Cache\Cache_Data\data_2). Скрипт читает файл, находит
  последний такой адрес и кладёт его в буфер обмена.

  Ничего никуда не отправляется: файл читается локально, ссылка остаётся у
  тебя в буфере. Вставишь её в трекер сам.

  Порядок:
    1. Запусти игру и открой «Записи сигналов» (историю круток).
    2. Запусти этот скрипт.
    3. Вставь ссылку в трекере: Меню → Крутки → поле «Ссылка из игры».

  Запуск одной строкой (Windows PowerShell, ничего скачивать не надо):
      iex ([Text.Encoding]::UTF8.GetString((iwr -useb https://alextask.ru/zzz-signal.ps1).RawContentStream.ToArray()))

  Байты читаются напрямую и разбираются как UTF-8: короткое «iwr … | iex» не
  подходит, потому что GitHub Pages отдаёт .ps1 как application/octet-stream
  без charset, а PowerShell такой ответ декодирует как latin1 — и весь русский
  текст превращается в «????».

  Или скачай файл и запусти локально:
      .\zzz-signal.ps1

  Если игра стоит не по умолчанию — укажи папку с данными:
      .\zzz-signal.ps1 -GameDir "D:\Games\ZenlessZoneZero Game\ZenlessZoneZero_Data"

  Скрипт ничего не отправляет в сеть и не меняет файлы: читает кеш игры,
  находит ссылку, кладёт в буфер обмена. Исходник открыт по тому же адресу —
  https://alextask.ru/zzz-signal.ps1

  authkey живёт около суток и открывает доступ только к истории круток —
  ни к аккаунту, ни к почте, ни к платежам. Но в чужие руки его отдавать
  всё равно не стоит.
#>

[CmdletBinding()]
param(
    [string]$GameDir = "",
    # не копировать в буфер, только показать
    [switch]$NoCopy
)

$ErrorActionPreference = "Stop"
# Консоль по умолчанию в кодировке 866, а скрипт в UTF-8 — без этой строки
# русский текст выводится вопросительными знаками.
try {
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    $OutputEncoding = [Text.Encoding]::UTF8
} catch {}
function Say($m, $c = "Gray") { Write-Host $m -ForegroundColor $c }

Write-Host ""
Say "Ссылка на историю круток ZZZ" Cyan
Say ("─" * 46) DarkGray

# ── где стоит игра ───────────────────────────────────────────────────────────
# Путь ищем по порядку: заданный вручную → лаунчер в реестре → обычные места.
# У лаунчера ключ свой на каждую игру, у ZZZ это ZenlessZoneZero.
function Find-GameDir {
    if ($GameDir) { return $GameDir }

    # Самый надёжный способ: игра запущена (иначе истории круток и не будет),
    # значит путь можно взять прямо у процесса — никакого гадания по дискам.
    foreach ($nm in @('ZenlessZoneZero', 'ZenlessZoneZeroBeta')) {
        try {
            $pr = Get-Process -Name $nm -ErrorAction Stop | Select-Object -First 1
            if ($pr -and $pr.Path) {
                $d = Join-Path (Split-Path $pr.Path -Parent) 'ZenlessZoneZero_Data'
                if (Test-Path $d) { return $d }
            }
        } catch {}
    }

    $reg = @(
        'HKCU:\Software\Cognosphere\HYP\1_1\ZenlessZoneZero',
        'HKCU:\Software\Cognosphere\HYP\standalone\1_1\ZenlessZoneZero',
        'HKLM:\SOFTWARE\Cognosphere\HYP\1_1\ZenlessZoneZero'
    )
    foreach ($k in $reg) {
        try {
            $v = (Get-ItemProperty -Path $k -ErrorAction Stop).GameInstallPath
            if ($v -and (Test-Path $v)) { return (Join-Path $v 'ZenlessZoneZero_Data') }
        } catch {}
    }
    # список установленных программ: лаунчер прописывает туда путь установки
    foreach ($un in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
                      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                      'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
        try {
            $app = Get-ItemProperty $un -ErrorAction SilentlyContinue |
                   Where-Object { $_.DisplayName -match 'Zenless' -and $_.InstallLocation } |
                   Select-Object -First 1
            if ($app) {
                $d = Join-Path $app.InstallLocation 'ZenlessZoneZero_Data'
                if (Test-Path $d) { return $d }
            }
        } catch {}
    }

    # запасной вариант: пробуем обычные места установки на всех дисках
    foreach ($d in (Get-PSDrive -PSProvider FileSystem).Name) {
        foreach ($tail in @('Program Files\ZenlessZoneZero Game\ZenlessZoneZero_Data',
                            'Games\ZenlessZoneZero Game\ZenlessZoneZero_Data',
                            'ZenlessZoneZero Game\ZenlessZoneZero_Data')) {
            $p = "${d}:\$tail"
            if (Test-Path $p) { return $p }
        }
    }
    return $null
}

# При запуске через «iwr … | iex» параметры не передать, поэтому путь можно
# положить в переменную заранее — так же, как это делают другие трекеры.
if (-not $GameDir -and $env:ZZZ_GAME_DIR) { $GameDir = $env:ZZZ_GAME_DIR }
if (-not $GameDir -and (Get-Variable -Name zzzPath -Scope Global -ErrorAction SilentlyContinue)) {
    $GameDir = $global:zzzPath
}
$dir = Find-GameDir
if (-not $dir -or -not (Test-Path $dir)) {
    Say "Не нашёл папку игры." Red
    Write-Host ""
    Say "Проще всего: запусти игру и повтори команду — тогда путь возьмётся" Yellow
    Say "прямо у запущенного процесса." Yellow
    Write-Host ""
    Say "Либо укажи вручную. Где смотреть: правый клик по ярлыку игры →" DarkGray
    Say "«Расположение файла». Нужна папка ZenlessZoneZero_Data рядом с exe." DarkGray
    Write-Host ""
    Say '$zzzPath="D:\Games\ZenlessZoneZero Game\ZenlessZoneZero_Data"' Cyan
    Say 'iex ([Text.Encoding]::UTF8.GetString((iwr -useb https://alextask.ru/zzz-signal.ps1).RawContentStream.ToArray()))' Cyan
    exit 1
}
Say ("   игра: {0}" -f $dir)

# ── кеш веб-вью ──────────────────────────────────────────────────────────────
# Версий кеша бывает несколько (webCaches\2.x\, 2.y\...), нужна самая свежая.
$webRoot = Join-Path $dir 'webCaches'
if (-not (Test-Path $webRoot)) {
    Say "В папке игры нет webCaches — открой в игре «Записи сигналов» хотя бы раз." Red
    exit 1
}
$data2 = Get-ChildItem $webRoot -Recurse -Filter 'data_2' -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $data2) {
    Say "Не нашёл файл кеша data_2." Red
    Say "Открой в игре «Записи сигналов» и запусти скрипт снова." Yellow
    exit 1
}
Say ("   кеш:  {0} ({1:N1} МБ, изменён {2:HH:mm})" -f $data2.Name,
     ($data2.Length / 1MB), $data2.LastWriteTime)

# ── читаем и ищем ссылки ─────────────────────────────────────────────────────
# Файл занят игрой, поэтому копируем во временный и читаем копию. Внутри лежит
# бинарь с обрывками текста — вытаскиваем строки регуляркой по всему содержимому.
$tmp = Join-Path $env:TEMP ("zzz-cache-" + [Guid]::NewGuid().ToString('N') + ".bin")
try {
    Copy-Item $data2.FullName $tmp -Force
    $text = [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8)
} catch {
    Say ("Не смог прочитать кеш: {0}" -f $_.Exception.Message) Red
    exit 1
} finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

$rx = [regex]'https://[^\x00-\x1F"]*?(?:getGachaLog|gacha_record)[^\x00-\x1F"]*?authkey=[^\x00-\x1F"&]+[^\x00-\x1F"]*'
$hits = @($rx.Matches($text) | ForEach-Object { $_.Value })
if (-not $hits.Count) {
    # запасной проход: ссылка бывает и без getGachaLog в пути
    $rx2 = [regex]'https://[^\x00-\x1F"]*?authkey=[^\x00-\x1F"&]+[^\x00-\x1F"]*'
    $hits = @($rx2.Matches($text) | ForEach-Object { $_.Value } |
              Where-Object { $_ -match 'nap|zzz' })
}
if (-not $hits.Count) {
    Say "Ссылку не нашёл." Red
    Say "Что проверить:" Yellow
    Say "  1) игра запущена и в ней открыты «Записи сигналов»" DarkGray
    Say "  2) историю нужно пролистать хотя бы на одну страницу" DarkGray
    Say "  3) после этого запусти скрипт, не закрывая игру" DarkGray
    exit 1
}

# Берём последнюю: игрок мог открывать историю несколько раз, свежая ссылка
# лежит ближе к концу файла.
$link = $hits[-1].Trim()
# Хвост после параметров иногда прилипает мусором — обрезаем по последнему
# известному параметру.
$link = [regex]::Replace($link, '(&[a-z_]+=[^&]*)+$', { param($m) $m.Value })

Say ("   найдено ссылок: {0}" -f $hits.Count)
Write-Host ""
Say "Готово." Green
Say ("   длина ссылки: {0} символов" -f $link.Length)

if (-not $NoCopy) {
    try {
        Set-Clipboard -Value $link
        Say "   ссылка скопирована в буфер обмена" Green
    } catch {
        Say "   в буфер не положил, скопируй руками из строки ниже" DarkYellow
        Write-Host ""
        Write-Host $link
    }
} else {
    Write-Host ""
    Write-Host $link
}

Write-Host ""
Say "Дальше: открой трекер → Меню → Крутки → вставь ссылку → «Загрузить»." Cyan
Say "Ключ в ссылке живёт около суток, потом нужно получить её заново." DarkGray
