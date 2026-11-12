import { app, ipcMain, shell } from 'electron'
import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Channel, RecordingSummary } from '../shared/types'

const CHANNELS: readonly Channel[] = ['mic', 'system']
const ID_PATTERN = /^\d{8}-\d{6}$/

interface RecordingMeta {
  id: string
  startedAt: string
  endedAt?: string
}

function recordingsDir(): string {
  return join(app.getPath('userData'), 'recordings')
}

function recordingDir(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`invalid recording id: ${id}`)
  return join(recordingsDir(), id)
}

function channelFile(id: string, channel: Channel): string {
  if (!CHANNELS.includes(channel)) throw new Error(`invalid channel: ${channel}`)
  return join(recordingDir(id), `${channel}.webm`)
}

function newId(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

async function summarize(id: string): Promise<RecordingSummary | null> {
  try {
    const meta = JSON.parse(
      await readFile(join(recordingDir(id), 'meta.json'), 'utf8')
    ) as RecordingMeta
    const bytes = { mic: 0, system: 0 }
    for (const channel of CHANNELS) bytes[channel] = await fileSize(channelFile(id, channel))
    return { id, startedAt: meta.startedAt, endedAt: meta.endedAt ?? null, bytes }
  } catch {
    return null
  }
}

export function registerRecordingIpc(): void {
  ipcMain.handle('recording:start', async () => {
    const now = new Date()
    const id = newId(now)
    await mkdir(recordingDir(id), { recursive: true })
    const meta: RecordingMeta = { id, startedAt: now.toISOString() }
    await writeFile(join(recordingDir(id), 'meta.json'), JSON.stringify(meta, null, 2))
    return id
  })

  ipcMain.handle(
    'recording:chunk',
    async (_event, id: string, channel: Channel, data: ArrayBuffer) => {
      await appendFile(channelFile(id, channel), Buffer.from(data))
    }
  )

  ipcMain.handle('recording:stop', async (_event, id: string) => {
    const metaPath = join(recordingDir(id), 'meta.json')
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as RecordingMeta
    meta.endedAt = new Date().toISOString()
    await writeFile(metaPath, JSON.stringify(meta, null, 2))
    return summarize(id)
  })

  ipcMain.handle('recordings:list', async () => {
    await mkdir(recordingsDir(), { recursive: true })
    const ids = (await readdir(recordingsDir())).filter((name) => ID_PATTERN.test(name))
    const items = await Promise.all(ids.map(summarize))
    return items
      .filter((item): item is RecordingSummary => item !== null)
      .sort((a, b) => b.id.localeCompare(a.id))
  })

  ipcMain.handle('recordings:open-folder', async (_event, id?: string) => {
    const dir = id ? recordingDir(id) : recordingsDir()
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
}
