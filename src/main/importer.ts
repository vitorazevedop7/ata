import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { rename, rm, stat } from 'fs/promises'
import { basename, extname } from 'path'
import { IMPORT_EXTENSIONS, type ImportProgress } from '../shared/types'
import { channelFile, recordingDir } from './paths'
import { processRecording } from './jobs'
import { run } from './process'
import { claimRecordingId, writeMeta } from './store'
import { resolveFfmpeg } from './tools'

const NO_AUDIO = /matches no streams|does not contain any stream|Output file .* does not contain/i

function parseClock(text: string): number | null {
  const match = /(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text)
  if (!match) return null
  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000
}

/**
 * Converts one audio or video file into a recording: mono Opus in system.webm
 * (the format the recorder writes), so transcription treats it like any other.
 */
export async function importFile(
  source: string,
  onPercent: (percent: number | undefined) => void
): Promise<string> {
  const fileName = basename(source)
  if (!IMPORT_EXTENSIONS.includes(extname(source).slice(1).toLowerCase())) {
    throw new Error(`${fileName}: formato não suportado. Use ${IMPORT_EXTENSIONS.join(', ')}.`)
  }
  const info = await stat(source)
  if (!info.isFile()) throw new Error(`${fileName} não é um arquivo.`)

  // The file's date becomes the recording's; the claimed id never overwrites a recording.
  const { id, startedAt } = await claimRecordingId(info.mtime)
  const dir = recordingDir(id)
  const target = channelFile(id, 'system')
  const partial = `${target}.part`

  let totalMs: number | null = null
  let convertedMs = 0
  try {
    await run(
      resolveFfmpeg(),
      [
        ...['-hide_banner', '-nostats', '-progress', 'pipe:1', '-y', '-i', source],
        // First audio track only; video, covers and subtitles are dropped.
        ...['-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '1'],
        ...['-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', '-f', 'webm', partial]
      ],
      (line) => {
        if (totalMs === null && line.includes('Duration:')) {
          totalMs = parseClock(line.split('Duration:')[1] ?? '')
        }
        const out = /^out_time_us=(\d+)/.exec(line)
        if (out) {
          convertedMs = Math.max(convertedMs, Number(out[1]) / 1000)
          if (totalMs) onPercent(Math.min(99, Math.round((convertedMs / totalMs) * 100)))
        }
      }
    )
    if (convertedMs <= 0 || (await stat(partial)).size === 0) {
      throw new Error('empty output')
    }
    await rename(partial, target)
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    const message = error instanceof Error ? error.message : String(error)
    if (NO_AUDIO.test(message) || message === 'empty output') {
      throw new Error(`${fileName} não tem áudio.`, { cause: error })
    }
    if (/ENOENT/.test(message)) throw new Error('ffmpeg não encontrado.', { cause: error })
    throw new Error(`Não foi possível ler ${fileName}:\n${message}`, { cause: error })
  }

  // meta.json goes last: until it exists the folder is not listed as a recording.
  await writeMeta({
    id,
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + Math.round(convertedMs)).toISOString(),
    source: 'import',
    importedFileName: fileName,
    importedAt: new Date().toISOString()
  })
  onPercent(100)
  return id
}

function broadcast(channel: string, payload?: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

let importing = false

async function importAll(paths: string[]): Promise<{ ids: string[]; errors: string[] }> {
  const ids: string[] = []
  const errors: string[] = []
  for (const [index, path] of paths.entries()) {
    const base: ImportProgress = { fileName: basename(path), index, total: paths.length }
    broadcast('recording:import-progress', base)
    try {
      const id = await importFile(path, (percent) =>
        broadcast('recording:import-progress', { ...base, percent })
      )
      ids.push(id)
      processRecording(id)
      broadcast('recordings:changed')
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  broadcast('recording:import-progress', null)
  return { ids, errors }
}

export function registerImportIpc(): void {
  ipcMain.handle('recording:import', async (event, paths?: string[]) => {
    if (importing) throw new Error('Espere a importação atual terminar.')
    let files = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p) : []
    if (!paths) {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: OpenDialogOptions = {
        title: 'Importar áudio ou vídeo',
        buttonLabel: 'Importar',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Áudio ou vídeo', extensions: [...IMPORT_EXTENSIONS] }]
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled) return { ids: [], errors: [] }
      files = result.filePaths
    }
    if (files.length === 0) return { ids: [], errors: [] }
    importing = true
    try {
      return await importAll(files)
    } finally {
      importing = false
    }
  })
}
