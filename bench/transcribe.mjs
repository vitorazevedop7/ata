// Benchmark de transcrição com whisper.cpp.
// Uso: node bench/transcribe.mjs <audio-ou-video> <whisper-cli.exe> <modelo.bin> <rótulo> [args extras do whisper]
// Gera bench/out/<rótulo>.{txt,srt,log} e imprime o tempo total.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const [input, whisperCli, model, label, ...extra] = process.argv.slice(2)
if (!input || !whisperCli || !model || !label) {
  console.error('uso: node bench/transcribe.mjs <entrada> <whisper-cli> <modelo> <rótulo> [args]')
  process.exit(2)
}

const outDir = resolve('bench/out')
mkdirSync(outDir, { recursive: true })

// whisper.cpp espera WAV 16 kHz mono; converte uma vez e reaproveita.
const wav = join(outDir, basename(input).replace(/\.[^.]+$/, '') + '.16k.wav')
if (!existsSync(wav)) {
  const ff = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav],
    { stdio: 'inherit' }
  )
  if (ff.status !== 0) process.exit(ff.status ?? 1)
}

const outBase = join(outDir, label)
const args = ['-m', model, '-f', wav, '-l', 'pt', '-otxt', '-osrt', '-of', outBase, ...extra]

const start = performance.now()
const run = spawnSync(whisperCli, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const seconds = (performance.now() - start) / 1000

writeFileSync(`${outBase}.log`, `${run.stdout}\n${run.stderr}`)
if (run.status !== 0) {
  console.error(run.stderr.split('\n').slice(-20).join('\n'))
  process.exit(run.status ?? 1)
}
console.log(`${label}: ${seconds.toFixed(1)} s`)
