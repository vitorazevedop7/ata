import { app } from 'electron'
import { existsSync } from 'fs'
import { join, posix, win32 } from 'path'
import { adoptLegacyDir, LEGACY_NAME } from './legacy'

export interface Tools {
  ffmpeg: string
  /** whisper-cli builds to try in order (GPU first, then CPU). */
  whisperCli: string[]
  model: string
  vadModel: string
}

export interface OllamaTools {
  /** The ollama binary, or null when only an already-running server can be used. */
  exe: string | null
  modelsDir: string
  model: string
  host: string
}

/** Where each tool may be installed, in order of preference. */
export interface ToolLocations {
  ffmpeg: string[]
  whisperCli: string[]
  ollama: string[]
  /** Folder for app data outside the roaming profile (models). */
  dataRoot: string
}

const WHISPER_MODEL = 'ggml-large-v3-turbo-q5_0.bin'
const VAD_MODEL = 'ggml-silero-v6.2.0.bin'
const SUMMARY_MODEL = 'qwen3.5:4b'

/**
 * Default install locations per platform. On Windows they match
 * scripts/setup-tools.ps1; elsewhere they are where Homebrew (or the Ollama app)
 * puts the tools. Apps opened from Finder don't get the shell's PATH, so the
 * Homebrew folders are listed explicitly.
 */
export function toolLocations(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  appData: string
): ToolLocations {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? win32.join(appData, '..', 'Local')
    const programs = win32.join(local, 'Programs')
    return {
      ffmpeg: [win32.join(programs, 'ffmpeg', 'bin', 'ffmpeg.exe')],
      whisperCli: ['whisper-cuda', 'whisper-cpu'].map((dir) =>
        win32.join(programs, dir, 'Release', 'whisper-cli.exe')
      ),
      ollama: [win32.join(programs, 'ollama', 'ollama.exe')],
      dataRoot: local
    }
  }
  const bins = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
  return {
    ffmpeg: bins.map((dir) => posix.join(dir, 'ffmpeg')),
    whisperCli: bins.map((dir) => posix.join(dir, 'whisper-cli')),
    ollama: [
      ...bins.map((dir) => posix.join(dir, 'ollama')),
      '/Applications/Ollama.app/Contents/Resources/ollama'
    ],
    dataRoot: appData
  }
}

function locations(): ToolLocations {
  return toolLocations(process.platform, process.env, app.getPath('appData'))
}

function modelsDir(): string {
  if (process.env.ATA_MODELS_DIR) return process.env.ATA_MODELS_DIR
  const root = locations().dataRoot
  const base = adoptLegacyDir(join(root, 'ata'), join(root, LEGACY_NAME))
  return join(base, 'models')
}

/** ffmpeg alone: importing a file doesn't need Whisper or its models. */
export function resolveFfmpeg(): string {
  if (process.env.ATA_FFMPEG) return process.env.ATA_FFMPEG
  return locations().ffmpeg.find((path) => existsSync(path)) ?? 'ffmpeg'
}

/**
 * Finds ffmpeg, whisper.cpp and the models. ATA_FFMPEG, ATA_WHISPER_CLI and
 * ATA_MODELS_DIR override the defaults from toolLocations().
 */
export function resolveTools(): Tools {
  const ffmpeg = resolveFfmpeg()

  const candidates = locations().whisperCli
  const whisperCli = process.env.ATA_WHISPER_CLI
    ? [process.env.ATA_WHISPER_CLI]
    : candidates.filter((path) => existsSync(path))
  if (whisperCli.length === 0) {
    throw new Error(`whisper.cpp não encontrado. Procurado em: ${candidates.join(', ')}`)
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
  const exe = process.env.ATA_OLLAMA ?? locations().ollama.find((path) => existsSync(path)) ?? null
  const host = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
  return {
    exe,
    modelsDir: join(modelsDir(), 'ollama'),
    model: process.env.ATA_OLLAMA_MODEL ?? SUMMARY_MODEL,
    host: host.startsWith('http') ? host : `http://${host}`
  }
}
