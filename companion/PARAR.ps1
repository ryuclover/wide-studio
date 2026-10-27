$ErrorActionPreference='Stop'
$file=Join-Path $PSScriptRoot '.local/connection.json'
if(Test-Path -LiteralPath $file){
  $pair=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
  try{$null=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:47831/shutdown' -Headers @{Authorization=('Bearer '+$pair.token)} -ContentType 'application/json' -Body '{}' -TimeoutSec 5;Write-Output 'Auxiliar encerrando; temporários serão limpos.'}catch{Write-Output 'Auxiliar indisponível ou já encerrado.'}
}
