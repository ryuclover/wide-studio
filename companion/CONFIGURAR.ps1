$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$state=Join-Path $PSScriptRoot '.local'
New-Item -ItemType Directory -Force -Path $state | Out-Null
$python=Get-Command python -ErrorAction SilentlyContinue
if(!$python){throw 'Instale Python 3.11 ou superior em python.org e execute novamente.'}
$runtime=Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if(!(Test-Path -LiteralPath $runtime)){
  & $python.Source -m venv (Join-Path $PSScriptRoot '.venv')
  if($LASTEXITCODE -ne 0){throw 'Falha ao criar o ambiente Python local.'}
}
& $runtime -m ensurepip --upgrade
if($LASTEXITCODE -ne 0){throw 'Falha ao preparar pip no ambiente local.'}
& $runtime -m pip install --upgrade 'yt-dlp[default]'
if($LASTEXITCODE -ne 0){throw 'Falha ao instalar yt-dlp. Confira sua conexão.'}
if(!(Get-Command ffmpeg -ErrorAction SilentlyContinue)){Write-Warning 'FFmpeg não encontrado. Instale-o (ffmpeg.org) e reinicie este script.'}
if(!(Get-Command node -ErrorAction SilentlyContinue)){Write-Warning 'Node.js não encontrado. Instale a versão LTS (nodejs.org) para suporte completo ao YouTube.'}
& (Join-Path $PSScriptRoot 'INICIAR.ps1') -ShowConnection
