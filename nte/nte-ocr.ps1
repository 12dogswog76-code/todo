<#
  nte-ocr.ps1 — читает характеристики эспера со скриншота своим компьютером.

  Зачем. До сих пор скриншот уходил в Cloudflare Worker, там его смотрела
  модель зрения и переписывала текст. Работает, но: секунд десять ожидания,
  лимиты Workers AI, лицензия Meta на лучшую модель и вечная беда — модель
  ленится и не дочитывает нижние строки, из-за чего терялись крит. урон и
  интенсивность цикла.

  В Windows встроен свой распознаватель — Windows.Media.Ocr. Он локальный,
  бесплатный, без интернета и лимитов, и на ровном экранном тексте точнее
  модели зрения: она «понимает» картинку, а тут обычное OCR по глифам, что
  для интерфейса игры ровно то, что нужно.

  Запуск (Windows PowerShell, НЕ pwsh — см. ниже):
      1. В игре открой экран эспера с характеристиками.
      2. Win+Shift+S, выдели область с числами — скрин уйдёт в буфер.
      3. Запусти скрипт. Проще всего правой кнопкой по файлу →
         «Выполнить с помощью PowerShell». Из консоли, если файл скачан
         в «Загрузки»:
             powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\nte-ocr.ps1"
         Ту же строку выдаёт кнопка на сайте: эспер → «Мои характеристики» →
         «Читать на своём компьютере».
      4. Скрипт распознаёт и кладёт результат обратно в буфер строкой
         NTE:{...}. На сайте открой эспера → «Мои характеристики» → Ctrl+V.

  Папка, из которой запускаешь, значения не имеет: скрипт берёт картинку из
  буфера обмена, а не с диска.

  Можно и файлом:
      .\nte-ocr.ps1 -Path "C:\shot.png"
  Посмотреть, что именно прочиталось:
      .\nte-ocr.ps1 -Show

  Все эсперы за один заход. Двадцать четыре раза запускать скрипт — то ещё
  удовольствие, поэтому есть папочный режим:
      .\nte-ocr.ps1 -Folder "C:\Users\Имя\Pictures\NTE"

  Скрин на каждого эспера, имя файла — имя эспера. Годится и русское, и
  английское, и слаг: «Линко.png», «linko.png», «Akane Rin.png». Регистр и
  пробелы не важны, лишнее в конце тоже: «линко-статы 2.png» подойдёт.
  Скрипт разберёт все картинки, скажет, у кого что прочиталось, и положит в
  буфер одну строку на всех. На сайте её принимает любая карточка эспера:
  «Мои характеристики» → Ctrl+V — числа разойдутся по своим.

  Почему именно Windows PowerShell 5.1. Классы WinRT (Windows.Media.Ocr и
  соседние) проецируются в PowerShell только в версии 5.1 на .NET Framework.
  В PowerShell 7 запись [Windows.Media.Ocr.OcrEngine,Windows.Foundation,
  ContentType=WindowsRuntime] не работает — тип просто не находится. Если
  привычно живёшь в pwsh, запускай так:
      powershell -ExecutionPolicy Bypass -File .\nte-ocr.ps1
  Скрипт сам проверяет версию и говорит об этом, а не падает с невнятным
  «не удалось найти тип».

  Языковой пакет. Распознаватель берёт языки из профиля Windows. Русского
  распознавания может не быть даже при русском интерфейсе: это отдельный
  необязательный компонент. Проверить и поставить:
      Параметры → Время и язык → Язык и регион → у языка «…» →
      Параметры языка → Основные компоненты → Распознавание текста.
  Английского почти всегда хватает: подписи в игре можно переключить, а
  числа читаются одинаково.
#>

[CmdletBinding()]
param(
    [string]$Path,          # файл со скриншотом; без него берём из буфера
    [string]$Folder,        # папка со скринами — разобрать все за один заход
    [switch]$Show,          # напечатать весь распознанный текст
    [switch]$NoCopy,        # не класть результат в буфер
    [int]$Scale = 2         # во сколько раз увеличить перед распознаванием
)

$ErrorActionPreference = 'Stop'
function Say($m, $c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Step($m) { Write-Host "`n>> $m" -ForegroundColor Cyan }

if ($PSVersionTable.PSVersion.Major -ge 6) {
    Say "Этот скрипт работает только в Windows PowerShell 5.1: в pwsh нет проекции WinRT." Red
    Say "Запусти так:" Yellow
    Say "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"" DarkGray
    exit 1
}

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# ── мостик из WinRT в PowerShell ─────────────────────────────────────────────
# Методы WinRT возвращают IAsyncOperation<T>, а не Task. Штатного await в
# PowerShell 5.1 нет, поэтому берём расширение AsTask из System.Runtime.
# WindowsRuntime и дожидаемся руками. Способ известный и единственный рабочий.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
    $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}

# Типы подтягиваем заранее: без обращения к ним проекция не создаётся.
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

# ── разбор ───────────────────────────────────────────────────────────────────
# Те же подписи и те же правила, что в воркере (OCR_FIELDS в alextask-worker.js):
# разбор один, источник текста разный. Порядок важен — «Крит. урон» должен
# проверяться раньше «Урона», иначе первое совпадёт со вторым.
$FIELDS = @(
    @('cr',  '(шанс\s*крит|crit\s*rate)'),
    @('cd',  '(крит\.?\s*урон|crit\s*d[mа]g)'),
    @('cyc', '(интенсивност\S*\s*цик|cycle\s*intens)'),
    @('brk', '(интенсивност\S*\s*разр|break\s*intens)'),
    @('hp',  '(^|[\s|])([оo0][зz3]|hp|health|очки\s*здоров)([\s|:]|$)'),
    @('atk', '(^|[\s|])(атака|attack|atk)([\s|:]|$)'),
    @('def', '(^|[\s|])(защита|def(ense)?)([\s|:]|$)'),
    @('dmg', '(бонус\s*к\s*урону|universal\s*d[mа]g|d[mа]g\s*bonus)')
)
$RU = @{ cr = 'Шанс крит. удара'; cd = 'Крит. урон'; cyc = 'Интенсивность цикла';
         brk = 'Интенсивность разрушения'; hp = 'ОЗ'; atk = 'Атака';
         def = 'Защита'; dmg = 'Бонус к урону' }

# «11418 + 6028» — база и прибавка со снаряжения, в игре показаны раздельно,
# а нужен итог. Пробелы внутри числа — разделитель тысяч.
function LineValue([string]$line) {
    $tail = $line -replace '^[^:]*:', ''
    $nums = @()
    foreach ($m in [regex]::Matches($tail, '\d[\d\s.,]*')) {
        $t = ($m.Value -replace '\s', '') -replace ',(\d{3})\b', '$1'
        $t = $t -replace ',', '.'
        $v = 0.0
        if ([double]::TryParse($t, [ref]$v) -and $v -gt 0) { $nums += $v }
    }
    if (-not $nums.Count) { return $null }
    if ($nums.Count -eq 2 -and $tail -match '\+') { return [math]::Round($nums[0] + $nums[1], 1) }
    return [math]::Round($nums[0], 1)
}

# ── распознавание одной картинки ─────────────────────────────────────────────
# Вынесено в функцию, чтобы одним и тем же кодом читать и картинку из буфера,
# и каждый файл в папке.
function ReadShot([System.Drawing.Bitmap]$src, [bool]$показать) {
# Подготовка. Игровой текст мелкий и лежит на полупрозрачной подложке —
# распознаватель на нём спотыкается. Поэтому увеличиваем и переводим в
# серый с растяжкой контраста: тонкие светлые цифры на тёмном фоне после
# этого читаются заметно вернее, а рамки и блики уходят в чёрное.

$w = [int]($src.Width * $Scale); $h = [int]($src.Height * $Scale)
# предел WinRT на сторону — 16 384 пикселя, но столько и не нужно
if ($w -gt 6000) { $k = 6000 / $w; $w = [int]($w * $k); $h = [int]($h * $k) }
$big = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($big)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($src, 0, 0, $w, $h)
$g.Dispose()

# серый + контраст, через LockBits: GetPixel на шести миллионах точек — минуты
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$data = $big.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite,
                      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($data.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
for ($i = 0; $i -lt $bytes.Length; $i += 4) {
    # BGRA, яркость по стандартным весам
    $v = [int](0.114 * $bytes[$i] + 0.587 * $bytes[$i + 1] + 0.299 * $bytes[$i + 2])
    # растяжка: всё темнее 60 — фон, светлее 190 — текст
    if ($v -lt 60) { $v = 0 } elseif ($v -gt 190) { $v = 255 }
    else { $v = [int](($v - 60) * 255 / 130) }
    $bytes[$i] = $v; $bytes[$i + 1] = $v; $bytes[$i + 2] = $v; $bytes[$i + 3] = 255
}
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$big.UnlockBits($data)

$tmp = Join-Path $env:TEMP ('nte-ocr-' + [guid]::NewGuid().ToString('N') + '.png')
$big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose(); $src.Dispose()


# ── распознавание ────────────────────────────────────────────────────────────

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
    foreach ($tag in @('ru-RU', 'en-US')) {
        try {
            $lang = New-Object Windows.Globalization.Language $tag
            $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
        } catch {}
        if ($engine) { break }
    }
}
if (-not $engine) {
    Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
    Say 'В системе нет ни одного языка распознавания.' Red
    Say 'Параметры → Время и язык → Язык и регион → «…» у языка →' Yellow
    Say 'Параметры языка → Основные компоненты → Распознавание текста.' Yellow
    exit 1
}


$file    = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
$stream  = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bmp     = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$res     = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
$stream.Dispose()
Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue

$lines = @()
foreach ($ln in $res.Lines) { $lines += [string]$ln.Text }

if ($показать) {
    Write-Host ''
    foreach ($l in $lines) { Say "  | $l" DarkGray }
}

# Распознаватель режет экран на строки, и подпись с числом обычно в одной
# строке. Но в две колонки («Атака 2 480   Защита 940») тоже бывает, поэтому
# строку сначала пробуем целиком, а потом по кускам.
$stats = [ordered]@{}
$flat = @()
foreach ($l in $lines) {
    $flat += $l
    if ($l -match '\d.*\S.*\d') { $flat += ($l -split '\s{3,}') }
}
foreach ($raw in $flat) {
    $line = ([string]$raw).Trim()
    if (-not $line -or $line -notmatch '\d') { continue }
    foreach ($f in $FIELDS) {
        if ($stats.Contains($f[0])) { continue }
        # подпись должна стоять слева от числа, иначе «до 6 стаков» уедет в ОЗ
        $head = ($line -split ':')[0]
        if ($head -notmatch $f[1]) { continue }
        $v = LineValue $line
        if ($null -ne $v) { $stats[$f[0]] = $v }
    }
}
    return $stats
}
# ── кто на скрине ────────────────────────────────────────────────────────────
# В папочном режиме эспер определяется по имени файла. Сверяемся со своей же
# базой: там лежат и русское имя, и английское, и слаг. Сравниваем в упрощён-
# ном виде — только буквы, в нижнем регистре, — чтобы «Akane Rin.png»,
# «akane-rin.png» и «Аканэ Рин 2.png» одинаково находились.
function Прост([string]$s) {
    return (($s -replace '[^\p{L}\p{Nd}]', '').ToLower())
}
function ЗагрузитьЭсперов($папкаСкрипта) {
    $путь = Join-Path $папкаСкрипта 'nte-db.json'
    if (-not (Test-Path -LiteralPath $путь)) { return @() }
    try {
        $db = Get-Content -LiteralPath $путь -Raw -Encoding UTF8 | ConvertFrom-Json
        return @($db.agents)
    } catch { return @() }
}
function УгадатьЭспера($имяФайла, $эсперы) {
    $ч = Прост ([IO.Path]::GetFileNameWithoutExtension($имяФайла))
    if (-not $ч) { return $null }
    # сначала точное совпадение, потом «начинается с» — на случай «линко 2»
    foreach ($точно in @($true, $false)) {
        foreach ($a in $эсперы) {
            foreach ($вар in @($a.slug, $a.ru, $a.en)) {
                $в = Прост $вар
                if (-not $в) { continue }
                if ($точно) { if ($ч -eq $в) { return $a } }
                else { if ($ч.StartsWith($в) -or $в.StartsWith($ч)) { return $a } }
            }
        }
    }
    return $null
}
function СтрокаСтатов($stats) {
    return '{' + (($stats.GetEnumerator() | ForEach-Object {
        '"' + $_.Key + '":' + $_.Value }) -join ',') + '}'
}

$здесь = Split-Path -Parent $PSCommandPath

# ── папочный режим ───────────────────────────────────────────────────────────
if ($Folder) {
    if (-not (Test-Path -LiteralPath $Folder)) { Say "Нет папки: $Folder" Red; exit 1 }
    $эсперы = ЗагрузитьЭсперов $здесь
    if (-not $эсперы.Count) {
        Say 'Рядом со скриптом нет nte-db.json — без него не понять, кто на скрине.' Red
        Say 'Положи скрипт в папку nte или скачай nte-db.json с сайта туда же.' Yellow
        exit 1
    }
    $картинки = @(Get-ChildItem -LiteralPath $Folder -File |
        Where-Object { $_.Extension -match '^\.(png|jpg|jpeg|bmp)$' } | Sort-Object Name)
    Step "Разбираю папку: $($картинки.Count) картинок"
    if (-not $картинки.Count) { Say '  картинок не нашлось.' Red; exit 1 }

    $итог = [ordered]@{}
    $ничего = @(); $чужие = @()
    $н = 0
    foreach ($ф in $картинки) {
        $н++
        $кто = УгадатьЭспера $ф.Name $эсперы
        $подпись = "[$н/$($картинки.Count)] $($ф.Name)"
        if (-not $кто) {
            Say "  $подпись — не понял, чей это скрин" DarkYellow
            $чужие += $ф.Name
            continue
        }
        $bmp = $null
        try { $bmp = [System.Drawing.Bitmap]::new($ф.FullName) }
        catch { Say "  $подпись — не открылась картинка" DarkYellow; continue }
        $st = ReadShot $bmp $Show.IsPresent
        if (-not $st -or -not $st.Count) {
            Say "  $подпись → $($кто.ru): ничего не прочиталось" DarkYellow
            $ничего += $кто.ru
            continue
        }
        $итог[$кто.slug] = $st
        $что = ($st.Keys | ForEach-Object { $RU[$_] }) -join ', '
        Say ("  {0} → {1}: {2} из 8 ({3})" -f $подпись, $кто.ru, $st.Count, $что) Green
    }

    Write-Host ''
    Say '===================================' Green
    Say " Разобрано эсперов: $($итог.Count) из $($картинки.Count)" Green
    Say '===================================' Green
    if ($ничего.Count) { Say "  не прочиталось: $($ничего -join ', ')" DarkYellow }
    if ($чужие.Count)  { Say "  непонятные имена файлов: $($чужие -join ', ')" DarkYellow }
    if (-not $итог.Count) { exit 2 }

    # Строка на всех сразу. Приставка своя, чтобы страница отличила её от
    # одиночной: там NTE:{…}, здесь NTEALL:{"слаг":{…},…}.
    $json = 'NTEALL:{' + (($итог.GetEnumerator() | ForEach-Object {
        '"' + $_.Key + '":' + (СтрокаСтатов $_.Value) }) -join ',') + '}'
    if (-not $NoCopy) {
        Set-Clipboard -Value $json
        Write-Host ''
        Say 'Строка на всех разобранных скопирована в буфер.' Cyan
        Say 'На сайте открой любого эспера → «Мои характеристики» → Ctrl+V.' DarkGray
        Say 'Числа сами разойдутся по своим карточкам.' DarkGray
    } else {
        Write-Host ''
        Write-Host $json
    }
    exit 0
}

# ── один скрин: из файла или из буфера ───────────────────────────────────────
Step 'Беру картинку'
$src = $null
if ($Path) {
    if (-not (Test-Path -LiteralPath $Path)) { Say "Нет файла: $Path" Red; exit 1 }
    $src = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Path).Path)
    Say "  файл: $Path"
} else {
    $src = [System.Windows.Forms.Clipboard]::GetImage()
    if (-not $src) {
        Say 'В буфере нет картинки.' Red
        Say 'Сними область экрана: Win+Shift+S, потом запусти скрипт снова.' Yellow
        Say 'Если скринов много, удобнее папкой: -Folder "путь к папке"' DarkGray
        exit 1
    }
    Say "  из буфера: $($src.Width)x$($src.Height)"
}
Step 'Распознаю'
$stats = ReadShot $src $Show.IsPresent

Write-Host ''
if (-not $stats -or -not $stats.Count) {
    Say 'Ничего не разобралось.' Red
    Say 'Посмотри, что прочиталось: .\nte-ocr.ps1 -Show' Yellow
    Say 'Чаще всего помогает снимок покрупнее — только блок характеристик, без всего экрана.' DarkGray
    exit 2
}
Say '===================================' Green
foreach ($k in $stats.Keys) {
    Say ("  {0,-28} {1}" -f $RU[$k], $stats[$k]) Green
}
Say '===================================' Green

# ── отдаём на сайт ───────────────────────────────────────────────────────────
# Через буфер обмена: сайт локальные файлы читать не может, а поднимать ради
# восьми чисел локальный сервер — из пушки по воробьям. Строка с приставкой
# NTE: чтобы страница отличила её от случайного текста.
$json = 'NTE:' + (СтрокаСтатов $stats)
if (-not $NoCopy) {
    Set-Clipboard -Value $json
    Write-Host ''
    Say 'Строка скопирована в буфер.' Cyan
    Say 'Открой на сайте эспера → «Мои характеристики» → Ctrl+V.' DarkGray
} else {
    Write-Host ''
    Write-Host $json
}
