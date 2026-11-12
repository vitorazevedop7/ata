import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

export interface Tools {
  ffmpeg: string
  /** whisper-cli builds to try in order (GPU first, then CPU). */
  whisperCli: string[]
  model: string
  vadModel: string
}

const WHISPER_MODEL = 'ggml-large-v3-turbo-q5_0.bin'
const VAD_MODEL = 'ggml-silero-v6.2.0.bin'

function localAppData(): string {
  return process.env.LOCALAPPDATA ?? join(app.getPath('appData'), '..', 'Local')
}

/**
 * Finds ffmpeg, whisper.cpp and the models. Defaults match the setup in
 * CLAUDE.md; GRANOLA_FFMPEG, GRANOLA_WHISPER_CLI and GRANOLA_MODELS_DIR override them.
 */
export function resolveTools(): Tools {
  const programs = join(localAppData(), 'Programs')

  const bundledFfmpeg = join(programs, 'ffmpeg', 'bin', 'ffmpeg.exe')
  const ffmpeg =
    process.env.GRANOLA_FFMPEG ?? (existsSync(bundledFfmpeg) ? bundledFfmpeg : 'ffmpeg')

  const whisperCli = process.env.GRANOLA_WHISPER_CLI
    ? [process.env.GRANOLA_WHISPER_CLI]
    : ['whisper-cuda', 'whisper-cpu']
        .map((dir) => join(programs, dir, 'Release', 'whisper-cli.exe'))
        .filter((path) => existsSync(path))
  if (whisperCli.length === 0) {
    throw new Error(`whisper.cpp não encontrado em ${programs} (whisper-cuda ou whisper-cpu).`)
  }

  const modelsDir =
    process.env.GRANOLA_MODELS_DIR ?? join(localAppData(), 'granola-local', 'models')
  const model = join(modelsDir, WHISPER_MODEL)
  const vadModel = join(modelsDir, VAD_MODEL)
  for (const file of [model, vadModel]) {
    if (!existsSync(file)) throw new Error(`Modelo não encontrado: ${file}`)
  }

  return { ffmpeg, whisperCli, model, vadModel }
}
