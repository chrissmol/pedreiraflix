param(
  [string]$RepoDir = "C:\Users\christian.mol\Documents\Codex\2026-09-24\cl\pedreiraflix",
  [string]$TaskName = "PedreiraFlix Claude Worker",
  [int]$Minutes = 5
)

$ErrorActionPreference = "Stop"
$node = (Get-Command node.exe -ErrorAction Stop).Source
$logDir = Join-Path $RepoDir ".pedreira\claude-worker\scheduler"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$script = "`"$node`" tools\claude-worker\worker.ts 1>> `"$logDir\scheduled.log`" 2>> `"$logDir\scheduled.err.log`""
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/d /s /c `"$script`"" -WorkingDirectory $RepoDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 60)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Processa uma issue pedreira:claude-ready por vez e abre PR para revisão." -Force | Out-Null
Write-Host "Tarefa agendada criada: $TaskName"
