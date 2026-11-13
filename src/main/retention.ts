import { BrowserWindow } from 'electron'
import type { RecordingSummary } from '../shared/types'
import { isBusy, resumePendingJobs } from './jobs'
import { recoverInterruptedRecordings } from './recordings'
import { deleteAudio, listIds, removeLeftoverWorkFiles, summarize } from './store'

const HOUR_MS = 60 * 60 * 1000

/** True when the audio's time is up (never for audio that was not transcribed yet). */
export function isAudioExpired(item: RecordingSummary, now: number): boolean {
  if (!item.endedAt || !item.hasAudio || !item.audioExpiresAt) return false
  return Date.parse(item.audioExpiresAt) <= now
}

/** Deletes the audio of recordings whose retention period is over. */
async function purgeExpiredAudio(): Promise<number> {
  let purged = 0
  const now = Date.now()
  for (const id of await listIds()) {
    try {
      const item = await summarize(id)
      // Never touch a recording that is still being processed.
      if (!item || !isAudioExpired(item, now) || isBusy(id)) continue
      await deleteAudio(id, 'expired')
      purged++
    } catch {
      // A broken recording folder must not stop the cleanup of the others.
    }
  }
  return purged
}

function notifyChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('recordings:changed')
  }
}

async function sweep(): Promise<void> {
  // First close recordings cut short by a crash, so their audio can expire too.
  const recovered = await recoverInterruptedRecordings().catch(() => 0)
  if (recovered + (await purgeExpiredAudio()) > 0) notifyChanged()
}

/**
 * On launch: clears what an interrupted job left behind, picks up the
 * transcriptions and summaries that never ran, then starts the hourly sweep.
 */
export function startRetention(): void {
  void (async () => {
    await removeLeftoverWorkFiles().catch(() => 0)
    await sweep()
    await resumePendingJobs().catch(() => undefined)
  })()
  setInterval(() => void sweep(), HOUR_MS)
}
