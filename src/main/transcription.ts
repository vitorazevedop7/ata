import { app, BrowserWindow, ipcMain } from 'electron'
import { type ChildProcess, spawn } from 'child_process'
import { readFile, rm, stat, writeFile } from 'fs/promises'
import { availableParallelism } from 'os'
import { join } from 'path'
import type { Channel, Transcript, TranscriptSegment, TranscriptionStatus } from '../shared/types'
import { channelFile, recordingDir, transcriptFile } from './paths'
import { resolveTools, type Tools } from './tools'

// System first: it is usually the longer channel and the one people wait for.
const ORDER: readonly Channel[] = ['system', 'mic']

interface WhisperJson {
  result?: { language?: string }
  transcription?: { offsets: { from: number; to: number }; text: string }[]
}

const statuses = new Map<string, TranscriptionStatus>()
const queue: string[] = []
let running = false
let currentChild: ChildProcess | null = null

function publish(status: TranscriptionStatus): void {
  if (status.stage === 'done') statuses.delete(status.id)
  else statuses.set(status.id, status)
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('transcription:status', status)
  }
}

function run(command: string, args: string[], onLine?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    currentChild = child
    const tail: string[] = []
    const collect = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        onLine?.(line)
        tail.push(line)
        if (tail.length > 15) tail.shift()
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', (error) => {
      currentChild = null
      reject(error)
    })
    child.on('close', (code) => {
      currentChild = null
      if (code === 0) resolve()
      else reject(new Error(`${command} saiu com código ${code}:\n${tail.join('\n')}`))
    })
  })
}

async function hasAudio(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

async function whisper(
  tools: Tools,
  wav: string,
  outBase: string,
  onPercent: (percent: number) => void
): Promise<WhisperJson> {
  const args = [
    ...['-m', tools.model, '-f', wav],
    ...['-l', 'auto', '-t', String(availableParallelism())],
    // Greedy decoding: beam search was ~15x slower on the reference GPU (docs/benchmark.md).
    ...['-bs', '1', '-bo', '1'],
    // No text context between windows: avoids repetition loops on long audio.
    ...['-mc', '0'],
    // Only transcribe stretches with speech; silence makes Whisper invent phrases.
    ...['--vad', '-vm', tools.vadModel],
    ...['-oj', '-pp', '-of', outBase]
  ]
  let lastError: unknown
  for (const cli of tools.whisperCli) {
    try {
      await run(cli, args, (line) => {
        const match = /progress =\s*(\d+)%/.exec(line)
        if (match) onPercent(Number(match[1]))
      })
      const json = JSON.parse(await readFile(`${outBase}.json`, 'utf8')) as WhisperJson
      await rm(`${outBase}.json`, { force: true })
      return json
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function transcribe(id: string): Promise<void> {
  const tools = resolveTools()
  const dir = recordingDir(id)
  const segments: TranscriptSegment[] = []
  const languages: Transcript['languages'] = {}

  for (const channel of ORDER) {
    const source = channelFile(id, channel)
    if (!(await hasAudio(source))) continue

    const wav = join(dir, `${channel}.16k.wav`)
    publish({ id, stage: 'converting', channel })
    await run(tools.ffmpeg, [
      ...['-v', 'error', '-y', '-i', source],
      ...['-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]
    ])

    try {
      publish({ id, stage: 'transcribing', channel, percent: 0 })
      const json = await whisper(tools, wav, join(dir, `${channel}.whisper`), (percent) =>
        publish({ id, stage: 'transcribing', channel, percent })
      )
      if (json.result?.language) languages[channel] = json.result.language
      for (const item of json.transcription ?? []) {
        const text = item.text.trim()
        if (text) {
          segments.push({ channel, startMs: item.offsets.from, endMs: item.offsets.to, text })
        }
      }
    } finally {
      await rm(wav, { force: true })
    }
  }

  segments.sort((a, b) => a.startMs - b.startMs || a.channel.localeCompare(b.channel))
  const transcript: Transcript = {
    version: 1,
    createdAt: new Date().toISOString(),
    languages,
    segments
  }
  await writeFile(transcriptFile(id), JSON.stringify(transcript, null, 2))
}

async function pump(): Promise<void> {
  if (running) return
  running = true
  try {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await transcribe(id)
        publish({ id, stage: 'done' })
      } catch (error) {
        publish({
          id,
          stage: 'error',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  } finally {
    running = false
  }
}

export function enqueueTranscription(id: string): void {
  recordingDir(id) // validates the id
  if (queue.includes(id)) return
  const current = statuses.get(id)
  if (current && current.stage !== 'error') return
  queue.push(id)
  publish({ id, stage: 'queued' })
  void pump()
}

export function registerTranscriptionIpc(): void {
  ipcMain.handle('transcription:start', (_event, id: string) => enqueueTranscription(id))

  ipcMain.handle('transcription:get', async (_event, id: string) => {
    try {
      return JSON.parse(await readFile(transcriptFile(id), 'utf8')) as Transcript
    } catch {
      return null
    }
  })

  ipcMain.handle('transcription:statuses', () => [...statuses.values()])

  app.on('before-quit', () => {
    queue.length = 0
    currentChild?.kill()
  })
}
