import { BrowserWindow } from 'electron'
import { isBusy } from './jobs'
import { recoverInterruptedRecordings } from './recordings'
import { audioExpiresAt, deleteAudio, listIds, readMeta, summarize } from './store'

const HOUR_MS = 60 * 60 * 1000

/** Deletes the audio of recordings older than the retention period. */
async function purgeExpiredAudio(): Promise<number> {
  let purged = 0
  const now = Date.now()
  for (const id of await listIds()) {
    try {
      const meta = await readMeta(id)
      // Never touch a recording that is still being recorded or processed.
      if (!meta.endedAt || isBusy(id)) continue
      if (audioExpiresAt(meta).getTime() > now) continue
      const info = await summarize(id)
      if (!info?.hasAudio) continue
      await deleteAudio(id, 'expired')
      purged++
    } catch {
      // A broken recording folder must not stop the cleanup of the others.
    }
  }
  return purged
}

async function sweep(): Promise<void> {
  // First close recordings cut short by a crash, so their audio can expire too.
  const recovered = await recoverInterruptedRecordings().catch(() => 0)
  if (recovered + (await purgeExpiredAudio()) > 0) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('recordings:changed')
    }
  }
}

export function startRetention(): void {
  void sweep()
  setInterval(() => void sweep(), HOUR_MS)
}
