# Чистий рестарт Next.js dev-сервера на Windows.
#
# Навіщо: Turbopack блокує файли в .next\dev\... поки процес node живий.
# Якщо попередній `npm run dev` не встиг коректно завершитись (Ctrl+C під
# час активної збірки, вбитий термінал, фоновий запуск, який лишився
# висіти) - наступний запуск падає з EPERM: operation not permitted,
# rename '...\.next\dev\server\...'. Прибирання .next БЕЗ вбивання
# старого процесу не допомагає - він встигає створити нові файли й знову
# їх заблокувати. Тому порядок дій важливий: спочатку вбити процеси,
# потім прибрати кеш, і тільки потім стартувати заново.

Write-Host "Stopping lingering node processes..."
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Write-Host "Clearing stale build cache ($projectRoot\.next)..."
Remove-Item -Recurse -Force "$projectRoot\.next" -ErrorAction SilentlyContinue

$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location $projectRoot
Write-Host "Starting dev server..."
npm run dev
