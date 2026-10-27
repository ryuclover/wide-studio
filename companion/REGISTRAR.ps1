$ErrorActionPreference='Stop'
$state=Join-Path $PSScriptRoot '.local'
New-Item -ItemType Directory -Force -Path $state | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw 'Compilador .NET do Windows indisponível.'}
$exe=Join-Path $state 'native-bridge.exe'
& $compiler /nologo /target:exe ('/out:'+$exe) /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'NativeBridge.cs')
if($LASTEXITCODE -ne 0){throw 'Falha ao preparar a conexão nativa.'}
$base=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$candidates=@((Join-Path $base 'extensao'))
if(Test-Path -LiteralPath (Join-Path $base 'extension/manifest.json')){
  $candidates+=Join-Path $base 'extension/dist'
  $candidates+=Join-Path $base 'extension/.browser/drive-test'
  $release=Join-Path $base 'release'
  if(Test-Path -LiteralPath $release){foreach($folder in Get-ChildItem -LiteralPath $release -Directory){$candidates+=Join-Path $folder.FullName 'extensao'}}
}
$origins=@()
foreach($candidate in $candidates){
  $target=[IO.Path]::GetFullPath($candidate)
  if(!$target.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Destino inválido.'}
  if(!(Test-Path -LiteralPath (Join-Path $target 'manifest.json'))){continue}
  $manifest=Get-Content -LiteralPath (Join-Path $target 'manifest.json') -Raw | ConvertFrom-Json
  if($manifest.name -ne 'Wide Studio'){continue}
  # Chromium GenerateIdForPath on Windows hashes the native UTF-16 path.
  if($manifest.key){$bytes=[Convert]::FromBase64String($manifest.key)}else{$bytes=[Text.Encoding]::Unicode.GetBytes($target.Substring(0,1).ToUpperInvariant()+$target.Substring(1))}
  $sha=[Security.Cryptography.SHA256]::Create();try{$digest=$sha.ComputeHash($bytes)}finally{$sha.Dispose()}
  $id='';foreach($n in $digest[0..15]){$id += [char](97+($n -shr 4));$id += [char](97+($n -band 15))}
  $origins+='chrome-extension://'+$id+'/'
}
if(!$origins.Count){throw 'Não encontrei a pasta da extensão ao lado do auxiliar.'}
$hostPath=Join-Path $state 'native-host.json'
$hostData=@{name='com.widestudio.extractor';description='Wide Studio video service';path=$exe;type='stdio';allowed_origins=@($origins | Select-Object -Unique)} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($hostPath,$hostData,[Text.UTF8Encoding]::new($false))
foreach($vendor in @('Google/Chrome','Microsoft/Edge','Chromium')){
  $key='HKCU:\Software\'+$vendor.Replace('/','\')+'\NativeMessagingHosts\com.widestudio.extractor'
  New-Item -Path $key -Force | Out-Null
  Set-Item -LiteralPath $key -Value $hostPath
}
Write-Output 'Conexão nativa registrada somente para as extensões Wide Studio deste projeto.'
