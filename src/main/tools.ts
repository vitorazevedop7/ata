import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { adoptLegacyDir, LEGACY_NAME } from './legacy'

export interface Tools {
  ffmpeg: string
  /** whisper-cli builds to try in order (GPU first, then CPU). */
  whisperCli: string[]
  model: string
  vadModel: string
}

export interface OllamaTools {
  /** ollama.exe, or null when only an already-running server can be used. */
  exe: string | null
  modelsDir: string
  model: string
  host: string
}

const WHISPER_MODEL = 'ggml-large-v3-turbo-q5_0.bin'
const VAD_MODEL = 'ggml-silero-v6.2.0.bin'
const SUMMARY_MODEL = 'qwen3.5:4b'

function localAppData(): string {
  return process.env.LOCALAPPDATA ?? join(app.getPath('appData'), '..', 'Local')
}

function programs(): string {
  return join(localAppData(), 'Programs')
}

function modelsDir(): string {
  if (process.env.ATA_MODELS_DIR) return process.env.ATA_MODELS_DIR
  const base = adoptLegacyDir(join(localAppData(), 'ata'), join(localAppData(), LEGACY_NAME))
  return join(base, 'models')
}

/** ffmpeg alone: importing a file doesn't need Whisper or its models. */
export function resolveFfmpeg(): string {
  const bundled = join(programs(), 'ffmpeg', 'bin', 'ffmpeg.exe')
  return process.env.ATA_FFMPEG ?? (existsSync(bundled) ? bundled : 'ffmpeg')
}

/**
 * Finds ffmpeg, whisper.cpp and the models. Defaults match the setup in
 * the README (scripts/setup-tools.ps1); ATA_FFMPEG, ATA_WHISPER_CLI and ATA_MODELS_DIR override them.
 */
export function resolveTools(): Tools {
  const ffmpeg = resolveFfmpeg()

  const whisperCli = process.env.ATA_WHISPER_CLI
    ? [process.env.ATA_WHISPER_CLI]
    : ['whisper-cuda', 'whisper-cpu']
        .map((dir) => join(programs(), dir, 'Release', 'whisper-cli.exe'))
        .filter((path) => existsSync(path))
  if (whisperCli.length === 0) {
    throw new Error(`whisper.cpp não encontrado em ${programs()} (whisper-cuda ou whisper-cpu).`)
  }

  const model = join(modelsDir(), WHISPER_MODEL)
  const vadModel = join(modelsDir(), VAD_MODEL)
  for (const file of [model, vadModel]) {
    if (!existsSync(file)) throw new Error(`Modelo não encontrado: ${file}`)
  }

  return { ffmpeg, whisperCli, model, vadModel }
}

/** ATA_OLLAMA, ATA_OLLAMA_MODEL and OLLAMA_HOST override the defaults. */
export function resolveOllama(): OllamaTools {
  const bundled = join(programs(), 'ollama', 'ollama.exe')
  const exe = process.env.ATA_OLLAMA ?? (existsSync(bundled) ? bundled : null)
  const host = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
  return {
    exe,
    modelsDir: join(modelsDir(), 'ollama'),
    model: process.env.ATA_OLLAMA_MODEL ?? SUMMARY_MODEL,
    host: host.startsWith('http') ? host : `http://${host}`
  }
}
