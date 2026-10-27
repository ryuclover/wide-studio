$ErrorActionPreference='Stop'
$expected=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.local/native-host.json'))
foreach($vendor in @('Google/Chrome','Microsoft/Edge','Chromium')){
 $key='HKCU:\Software\'+$vendor.Replace('/','\')+'\NativeMessagingHosts\com.widestudio.extractor'
 if(Test-Path -LiteralPath $key){$value=(Get-Item -LiteralPath $key).GetValue('');if($value -eq $expected){Remove-Item -LiteralPath $key -Force}}
}
