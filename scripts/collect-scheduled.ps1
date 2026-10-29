param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$repoPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoPath
$runnerPath = Join-Path $repoPath 'node_modules\tsx\dist\cli.mjs'
$commandPath = Join-Path $repoPath 'scripts\cli.ts'
$logPath = Join-Path $repoPath 'data\collector-scheduled.log'
New-Item -ItemType Directory -Path (Join-Path $repoPath 'data') -Force | Out-Null
try {
  & $NodePath $runnerPath $commandPath 'collect:twitchtracker:once' *> $logPath
  $collectorExit = $LASTEXITCODE
  if ($null -eq $collectorExit) { $collectorExit = 1 }
  exit $collectorExit
} catch {
  'Scheduled collection failed; inspect the local Node installation and collection:status.' | Set-Content -LiteralPath $logPath
  exit 1
}
