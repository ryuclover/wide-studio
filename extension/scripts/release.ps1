$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Falha no build.' }
  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $releaseRoot = Join-Path (Split-Path $PWD -Parent) 'release'
  New-Item -ItemType Directory -Force $releaseRoot | Out-Null
  $bundlePath = Join-Path $releaseRoot "Wide-Studio-$version"
  if (Test-Path -LiteralPath $bundlePath) { throw "Pacote já existe: $bundlePath. Mova-o antes de gerar novamente." }
  New-Item -ItemType Directory $bundlePath | Out-Null
  Copy-Item -LiteralPath 'dist' -Destination (Join-Path $bundlePath 'extensao') -Recurse
  Copy-Item -LiteralPath 'scripts/COMO-USAR.html' -Destination $bundlePath
  $zipPath = "$bundlePath.zip"
  Compress-Archive -Path "$bundlePath\*" -DestinationPath $zipPath
  $stream = [System.IO.File]::OpenRead($zipPath)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose(); $stream.Dispose() }
  "$hash  Wide-Studio-$version.zip" | Set-Content -LiteralPath "$zipPath.sha256" -Encoding ascii
  Write-Output "Pronto: $zipPath"
} finally { Pop-Location }
