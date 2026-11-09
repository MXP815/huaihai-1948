# Synthesize narration WAV via Windows SAPI (16 kHz / 16-bit / mono).
# Text comes from tools/cine_voice.json (exported from src/data.js).
param(
  [string]$Manifest,
  [string]$OutDir,
  [string]$Voice = 'Microsoft Huihui Desktop'
)

Add-Type -AssemblyName System.Speech
if (-not $Manifest) { $Manifest = Join-Path $PSScriptRoot 'cine_voice.json' }
if (-not $OutDir) { $OutDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets\voice' }
if (-not (Test-Path $Manifest)) { throw "manifest missing: $Manifest" }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$items = Get-Content -Raw -Encoding UTF8 $Manifest | ConvertFrom-Json
$syn = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $syn.SelectVoice($Voice) } catch { Write-Warning "voice not found: $Voice" }
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)
$syn.Rate = -1
$syn.Volume = 100

$fail = @()
foreach ($v in $items) {
  $path = Join-Path $OutDir $v.file
  try {
    $syn.SetOutputToWaveFile($path, $fmt)
    $syn.Speak($v.text)
    $syn.SetOutputToNull()
    $len = (New-Object System.IO.FileInfo $path).Length
    Write-Output ("OK`t{0}`t{1} bytes" -f $v.file, $len)
  } catch {
    $fail += $v.file
    Write-Output ("FAIL`t{0}`t{1}" -f $v.file, $_.Exception.Message)
  }
}
$syn.Dispose()
if ($fail.Count) { Write-Output ("FAILED {0}: {1}" -f $fail.Count, ($fail -join ', ')) }
