param([switch]$ShowConnection)
$ErrorActionPreference='Stop'
$state=Join-Path $PSScriptRoot '.local'
$runtime=Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if(!(Test-Path -LiteralPath $runtime)){throw 'Execute CONFIGURAR.ps1 primeiro.'}
New-Item -ItemType Directory -Force -Path $state | Out-Null
$online=$false
$config=Join-Path $state 'connection.json'
if(Test-Path -LiteralPath $config){
  try{$pair=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json;$health=Invoke-RestMethod -Uri 'http://127.0.0.1:47831/health' -Headers @{Authorization=('Bearer '+$pair.token)} -TimeoutSec 2;if($health.protocol -eq 2){$online=$true}else{$null=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:47831/shutdown' -Headers @{Authorization=('Bearer '+$pair.token)} -ContentType 'application/json' -Body '{}' -TimeoutSec 5;Start-Sleep -Milliseconds 700}}catch{}
}
if(!$online){
  Start-Process -FilePath $runtime -ArgumentList @('"'+(Join-Path $PSScriptRoot 'extractor.py')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'service.log') -RedirectStandardError (Join-Path $state 'error.log')
  for($i=0;$i -lt 30;$i++){
    Start-Sleep -Milliseconds 300
    try{$pair=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json;$null=Invoke-RestMethod -Uri 'http://127.0.0.1:47831/health' -Headers @{Authorization=('Bearer '+$pair.token)} -TimeoutSec 1;$online=$true;break}catch{}
  }
}
if(!$online){throw 'O auxiliar não iniciou. Veja .local/error.log; a porta 47831 pode estar ocupada.'}
& (Join-Path $PSScriptRoot 'REGISTRAR.ps1')
Write-Output 'Pronto. Abra Extrair, cole o link e clique Adicionar à Biblioteca.'
