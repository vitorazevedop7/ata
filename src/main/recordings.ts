import { ipcMain, shell } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import type { Channel, RecordingSummary } from '../shared/types'
import { isBusy } from './jobs'
import { channelFile, recordingDir, recordingsDir } from './paths'
import { deleteAudio, listIds, readMeta, summarize, writeMeta } from './store'

export function newId(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

export function registerRecordingIpc(): void {
  ipcMain.handle('recording:start', async () => {
    const now = new Date()
    const id = newId(now)
    await mkdir(recordingDir(id), { recursive: true })
    await writeMeta({ id, startedAt: now.toISOString() })
    return id
  })

  ipcMain.handle(
    'recording:chunk',
    async (_event, id: string, channel: Channel, data: ArrayBuffer) => {
      await appendFile(channelFile(id, channel), Buffer.from(data))
    }
  )

  ipcMain.handle('recording:stop', async (_event, id: string) => {
    const meta = await readMeta(id)
    meta.endedAt = new Date().toISOString()
    await writeMeta(meta)
    return summarize(id)
  })

  ipcMain.handle('recordings:list', async () => {
    await mkdir(recordingsDir(), { recursive: true })
    const items = await Promise.all((await listIds()).map(summarize))
    return items
      .filter((item): item is RecordingSummary => item !== null)
      .sort((a, b) => b.id.localeCompare(a.id))
  })

  ipcMain.handle('recording:delete-audio', async (_event, id: string) => {
    if (isBusy(id)) throw new Error('Espere a transcrição terminar para apagar o áudio.')
    if (!(await readMeta(id)).endedAt) throw new Error('A gravação ainda está em andamento.')
    await deleteAudio(id, 'manual')
  })

  ipcMain.handle('recordings:open-folder', async (_event, id?: string) => {
    const dir = id ? recordingDir(id) : recordingsDir()
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
}
