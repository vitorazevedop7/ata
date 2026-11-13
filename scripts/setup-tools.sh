#!/usr/bin/env bash
# Installs the local tools and models Ata needs on macOS, with Homebrew:
#   - ffmpeg, whisper.cpp (Metal on Apple Silicon) and Ollama
#   - Whisper large-v3-turbo q5_0 and Silero VAD models, and qwen3.5:4b in Ollama,
#     into ~/Library/Application Support/ata/models
# Anything already in place is skipped, so the script can be run again safely.
# Total download: about 4 GB.
set -euo pipefail

MODELS="${ATA_MODELS_DIR:-$HOME/Library/Application Support/ata/models}"
WHISPER_MODEL='https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'
VAD_MODEL='https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin'
SUMMARY_MODEL='qwen3.5:4b'

step() { printf '\n==> %s\n' "$1"; }

if ! command -v brew >/dev/null 2>&1; then
  echo 'Homebrew não encontrado. Instale em https://brew.sh e rode de novo.' >&2
  exit 1
fi

step 'ffmpeg, whisper.cpp e Ollama (Homebrew)'
for formula in ffmpeg whisper.cpp ollama; do
  if brew list --formula "$formula" >/dev/null 2>&1; then
    echo "    $formula já instalado"
  else
    brew install "$formula"
  fi
done

step 'Modelos do Whisper'
mkdir -p "$MODELS"
for url in "$WHISPER_MODEL" "$VAD_MODEL"; do
  file="$MODELS/$(basename "$url")"
  if [ -f "$file" ]; then
    echo "    $(basename "$file") já instalado em $MODELS"
  else
    echo "    Baixando $url"
    curl -L --fail --retry 3 --progress-bar -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
done

step "Modelo de resumo ($SUMMARY_MODEL)"
OLLAMA_MODELS_DIR="$MODELS/ollama"
manifest="$OLLAMA_MODELS_DIR/manifests/registry.ollama.ai/library/${SUMMARY_MODEL%%:*}/${SUMMARY_MODEL##*:}"
if [ -f "$manifest" ]; then
  echo "    $SUMMARY_MODEL já instalado em $OLLAMA_MODELS_DIR"
else
  # Same models folder the app uses; a separate port so a running Ollama is left alone.
  export OLLAMA_MODELS="$OLLAMA_MODELS_DIR"
  export OLLAMA_HOST='127.0.0.1:11435'
  ollama serve >/dev/null 2>&1 &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT
  for _ in $(seq 30); do
    curl -sf "http://$OLLAMA_HOST/api/version" >/dev/null && break
    sleep 1
  done
  ollama pull "$SUMMARY_MODEL"
fi

printf '\nPronto. Abra o app com: npm run dev\n'
