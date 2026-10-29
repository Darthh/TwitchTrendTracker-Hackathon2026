param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$repoPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskName = 'Upswing-TwitchTracker-Collection'
$runnerPath = Join-Path $repoPath 'scripts\collect-scheduled.ps1'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and @($existing.Actions | Where-Object { $_.Arguments -like "*$runnerPath*" }).Count -eq 0) {
  throw 'A task with this name belongs to another workspace. It was left unchanged.'
}
if ($Remove) {
  if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  Write-Output 'Removed this workspace collection schedule. Saved data is retained.'
  exit 0
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $repoPath 'node_modules\tsx\dist\cli.mjs'))) { throw 'Run npm ci in this repository first.' }
$powerShellPath = Join-Path $PSHOME 'powershell.exe'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runnerPath + '" -NodePath "' + $nodePath + '"'
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $repoPath
# The cheap local check runs every 15 minutes. The SQLite due-time gate limits provider requests to hourly.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$logon = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger,$logon) -Principal $principal -Settings $settings -Description 'Save public TwitchTracker category/channel summaries to Upswing SQLite. No keys or paid hosting. Hourly provider gate; 15-minute recovery checks. Runs while this user is logged in.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State
