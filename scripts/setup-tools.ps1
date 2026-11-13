<#
.SYNOPSIS
  Downloads the local tools and models Ata needs, into the folders the app looks in.

.DESCRIPTION
  - ffmpeg (gyan.dev essentials build)        -> <Programs>\ffmpeg\bin\ffmpeg.exe
  - whisper.cpp CPU build                     -> <Programs>\whisper-cpu\Release\whisper-cli.exe
  - whisper.cpp CUDA build (NVIDIA GPU only)  -> <Programs>\whisper-cuda\Release\whisper-cli.exe
  - Ollama                                    -> <Programs>\ollama\ollama.exe
  - Whisper large-v3-turbo q5_0 and Silero VAD models, and qwen3.5:4b in Ollama -> <Models>

  Anything already in place is skipped, so the script can be run again safely.
  Total download: about 4 GB (8 GB with the CUDA build).

.EXAMPLE
  npm run setup:tools
  powershell -ExecutionPolicy Bypass -File scripts\setup-tools.ps1 -NoCuda
#>
[CmdletBinding()]
param(
  [string]$Programs = (Join-Path $env:LOCALAPPDATA 'Programs'),
  [string]$Models = (Join-Path $env:LOCALAPPDATA 'ata\models'),
  [switch]$NoCuda
)

$ErrorActionPreference = 'Stop'

# Pinned to the builds measured in docs/benchmark.md.
$WhisperRelease = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454'
$Downloads = @{
  ffmpeg      = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
  whisperCpu  = "$WhisperRelease/whisper-bin-x64.zip"
  whisperCuda = "$WhisperRelease/whisper-bin-win-cuda-12.4.0-x64.zip"
  ollama      = 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip'
  whisperModel = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'
  vadModel    = 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin'
}
$SummaryModel = 'qwen3.5:4b'

# Before the rename the data folder was called granola-local; the app moves it the same way.
$legacy = Join-Path $env:LOCALAPPDATA 'granola-local'
$current = Join-Path $env:LOCALAPPDATA 'ata'
if (-not $PSBoundParameters.ContainsKey('Models') -and -not (Test-Path $current) -and (Test-Path $legacy)) {
  Rename-Item $legacy 'ata'
}

$Temp = Join-Path ([IO.Path]::GetTempPath()) ("ata-setup-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $Temp, $Programs, $Models | Out-Null

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Skip([string]$What, [string]$Path) { Write-Host "    $What já instalado em $Path" }

function Download([string]$Url, [string]$Destination) {
  Write-Host "    Baixando $Url"
  # curl.exe ships with Windows 10+ and shows progress; Invoke-WebRequest is very slow on PowerShell 5.1.
  & curl.exe -L --fail --retry 3 --progress-bar -o $Destination $Url
  if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar $Url" }
}

function Expand([string]$Url) {
  $zip = Join-Path $Temp ([IO.Path]::GetFileName($Url))
  Download $Url $zip
  $out = Join-Path $Temp ([IO.Path]::GetFileNameWithoutExtension($zip))
  Expand-Archive -Path $zip -DestinationPath $out -Force
  return $out
}

# Copies the folder that holds $Exe (wherever it sits in the archive) to $Target.
function Install-FolderOf([string]$Extracted, [string]$Exe, [string]$Target) {
  $found = Get-ChildItem -Path $Extracted -Recurse -Filter $Exe | Select-Object -First 1
  if (-not $found) { throw "$Exe não encontrado no arquivo baixado." }
  New-Item -ItemType Directory -Force $Target | Out-Null
  Copy-Item -Path (Join-Path $found.DirectoryName '*') -Destination $Target -Recurse -Force
}

try {
  Step 'ffmpeg'
  $ffmpeg = Join-Path $Programs 'ffmpeg\bin\ffmpeg.exe'
  if (Test-Path $ffmpeg) { Skip 'ffmpeg' $ffmpeg }
  else { Install-FolderOf (Expand $Downloads.ffmpeg) 'ffmpeg.exe' (Split-Path $ffmpeg) }

  Step 'whisper.cpp (CPU)'
  $cpu = Join-Path $Programs 'whisper-cpu\Release\whisper-cli.exe'
  if (Test-Path $cpu) { Skip 'whisper.cpp CPU' $cpu }
  else { Install-FolderOf (Expand $Downloads.whisperCpu) 'whisper-cli.exe' (Split-Path $cpu) }

  Step 'whisper.cpp (CUDA)'
  $cuda = Join-Path $Programs 'whisper-cuda\Release\whisper-cli.exe'
  $nvidia = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' }
  if ($NoCuda) { Write-Host '    Pulado (-NoCuda).' }
  elseif (-not $nvidia) { Write-Host '    Sem GPU NVIDIA; a transcrição vai usar a CPU.' }
  elseif (Test-Path $cuda) { Skip 'whisper.cpp CUDA' $cuda }
  else { Install-FolderOf (Expand $Downloads.whisperCuda) 'whisper-cli.exe' (Split-Path $cuda) }

  Step 'Ollama'
  $ollama = Join-Path $Programs 'ollama\ollama.exe'
  if (Test-Path $ollama) { Skip 'Ollama' $ollama }
  else { Install-FolderOf (Expand $Downloads.ollama) 'ollama.exe' (Split-Path $ollama) }

  Step 'Modelos do Whisper'
  foreach ($url in @($Downloads.whisperModel, $Downloads.vadModel)) {
    $file = Join-Path $Models ([IO.Path]::GetFileName($url))
    if (Test-Path $file) { Skip ([IO.Path]::GetFileName($file)) $Models; continue }
    Download $url "$file.part"
    Move-Item -Force "$file.part" $file
  }

  Step "Modelo de resumo ($SummaryModel)"
  $ollamaModels = Join-Path $Models 'ollama'
  $name, $tag = $SummaryModel.Split(':')
  $manifest = Join-Path $ollamaModels "manifests\registry.ollama.ai\library\$name\$tag"
  if (Test-Path $manifest) { Skip $SummaryModel $ollamaModels }
  else {
    # Same models folder the app uses; a separate port so a running Ollama is left alone.
    $env:OLLAMA_MODELS = $ollamaModels
    $env:OLLAMA_HOST = '127.0.0.1:11435'
    $server = Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden -PassThru
    try {
      $ready = $false
      for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
        Start-Sleep -Seconds 1
        try { Invoke-RestMethod "http://$env:OLLAMA_HOST/api/version" | Out-Null; $ready = $true } catch { }
      }
      if (-not $ready) { throw 'O Ollama não iniciou.' }
      & $ollama pull $SummaryModel
      if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar $SummaryModel" }
    }
    finally {
      Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
  }

  Write-Host "`nPronto. Abra o app com: npm run dev" -ForegroundColor Green
}
finally {
  Remove-Item -Recurse -Force $Temp -ErrorAction SilentlyContinue
}
