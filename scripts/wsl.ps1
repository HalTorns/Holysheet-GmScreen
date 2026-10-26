param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('setup', 'doctor', 'dev', 'backend:dev', 'backend:push', 'services:up', 'services:down', 'services:status', 'check', 'test:e2e:local')]
  [string]$Command
)

$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$env:WSL_UTF8 = '1'
& wsl.exe --distribution Ubuntu-24.04 --user root --cd $projectDirectory --exec pnpm $Command
exit $LASTEXITCODE
