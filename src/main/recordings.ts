import { ipcMain, shell, type WebContents } from 'electron'
import { appendFile, mkdir, stat } from 'fs/promises'
import type { Channel, RecordingSummary } from '../shared/types'
import { isBusy, processRecording, releaseRecording } from './jobs'
import { CHANNELS, channelFile, recordingDir, recordingsDir } from './paths'
import {
  claimRecordingId,
  deleteAudio,
  listIds,
  readMeta,
  renameRecording,
  summarize,
  writeMeta
} from './store'

/** Recordings being captured right now, by id. */
const active = new Set<string>()

/** The moment the last audio was saved, or the start when nothing was saved. */
async function lastAudioAt(id: string, startedAt: string): Promise<string> {
  let last = Date.parse(startedAt)
  for (const channel of CHANNELS) {
    try {
      last = Math.max(last, (await stat(channelFile(id, channel))).mtimeMs)
    } catch {
      // No file for this channel.
    }
  }
  return new Date(last).toISOString()
}

/**
 * Closes a recording that was never stopped (the app closed, crashed or reloaded
 * mid-recording) so it can be transcribed and its audio still expires.
 */
async function finishInterrupted(id: string): Promise<boolean> {
  active.delete(id)
  const meta = await readMeta(id)
  if (meta.endedAt) return false
  meta.endedAt = await lastAudioAt(id, meta.startedAt)
  meta.interrupted = true
  await writeMeta(meta)
  await processIfAudio(id)
  return true
}

/** Transcribes and summarizes a recording that just ended, unless nothing was captured. */
async function processIfAudio(id: string): Promise<RecordingSummary | null> {
  const item = await summarize(id)
  if (item?.hasAudio && !item.hasTranscript) processRecording(id)
  return item
}

/**
 * Audio is saved every second while recording. A recording this app isn't
 * capturing, whose audio stopped changing a while ago, was cut short. The wait
 * keeps a second copy of the app (dev and installed share the folder) from
 * closing a recording the other one is still making.
 */
const STALE_MS = 60 * 1000

/** Closes recordings that were never stopped. Returns how many it closed. */
export async function recoverInterruptedRecordings(): Promise<number> {
  let recovered = 0
  for (const id of await listIds()) {
    if (active.has(id)) continue
    try {
      const meta = await readMeta(id)
      if (meta.endedAt) continue
      const last = Date.parse(await lastAudioAt(id, meta.startedAt))
      if (Date.now() - last < STALE_MS) continue
      if (await finishInterrupted(id)) recovered++
    } catch {
      // A broken recording folder must not stop the others.
    }
  }
  return recovered
}

/** If the page that is recording goes away, the recording ends where its audio ends. */
function watchRecorder(sender: WebContents, id: string): void {
  const onNavigate = (details: { isMainFrame: boolean; isSameDocument: boolean }): void => {
    if (details.isMainFrame && !details.isSameDocument) finish()
  }
  const finish = (): void => {
    sender.off('did-start-navigation', onNavigate)
    if (!active.has(id)) return
    void finishInterrupted(id)
      .then((changed) => {
        if (changed && !sender.isDestroyed()) sender.send('recordings:changed')
      })
      .catch(() => {})
  }
  sender.on('did-start-navigation', onNavigate)
  sender.once('render-process-gone', finish)
  sender.once('destroyed', finish)
}

export function registerRecordingIpc(): void {
  ipcMain.handle('recording:start', async (event) => {
    const { id, startedAt } = await claimRecordingId(new Date())
    await writeMeta({ id, startedAt: startedAt.toISOString() })
    active.add(id)
    watchRecorder(event.sender, id)
    return id
  })

  ipcMain.handle(
    'recording:chunk',
    async (_event, id: string, channel: Channel, data: ArrayBuffer) => {
      await appendFile(channelFile(id, channel), Buffer.from(data))
    }
  )

  ipcMain.handle('recording:stop', async (_event, id: string) => {
    active.delete(id)
    const meta = await readMeta(id)
    meta.endedAt = new Date().toISOString()
    await writeMeta(meta)
    return processIfAudio(id)
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

  // The whole folder goes to the system trash, so a mistake can still be undone
  // from there: restoring it puts the recording back in the list.
  ipcMain.handle('recording:delete', async (_event, id: string) => {
    const dir = recordingDir(id) // validates the id
    if (active.has(id)) throw new Error('Pare a gravação antes de apagá-la.')
    releaseRecording(id)
    try {
      await shell.trashItem(dir)
    } catch (error) {
      throw new Error('Não foi possível mover a gravação para a Lixeira.', { cause: error })
    }
  })

  ipcMain.handle('recording:rename', (_event, id: string, title: string) =>
    renameRecording(id, title)
  )

  ipcMain.handle('recordings:open-folder', async (_event, id?: string) => {
    const dir = id ? recordingDir(id) : recordingsDir()
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
}
