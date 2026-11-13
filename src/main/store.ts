import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  AUDIO_RETENTION_DAYS,
  MAX_TITLE,
  type RecordingSummary,
  type Summary
} from '../shared/types'
import {
  CHANNELS,
  ID_PATTERN,
  channelFile,
  metaFile,
  recordingDir,
  recordingsDir,
  summaryFile,
  transcriptFile
} from './paths'

export interface RecordingMeta {
  id: string
  startedAt: string
  endedAt?: string
  /** Set when the app closed or crashed before the recording was stopped. */
  interrupted?: boolean
  audioDeletedAt?: string
  audioDeletedReason?: 'manual' | 'expired' | 'after-transcription'
  /** Set when the recording came from a file the user imported. */
  source?: 'import'
  importedFileName?: string
  importedAt?: string
  /** Name the user gave the recording; wins over the title the summary suggests. */
  title?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Recording ids are the local start time to the second: 20261113-101100. */
export function newId(time: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${time.getFullYear()}${pad(time.getMonth() + 1)}${pad(time.getDate())}-` +
    `${pad(time.getHours())}${pad(time.getMinutes())}${pad(time.getSeconds())}`
  )
}

/**
 * Creates the folder of a new recording under `root` and returns its id: the
 * first second at or after `start` whose folder doesn't exist yet. Creating the
 * folder is what claims the id, so two recordings never share one, even when
 * they start in the same second.
 */
export async function claimId(root: string, start: Date): Promise<{ id: string; startedAt: Date }> {
  await mkdir(root, { recursive: true })
  const time = new Date(Math.floor(start.getTime() / 1000) * 1000)
  for (;;) {
    const id = newId(time)
    try {
      await mkdir(join(root, id))
      return { id, startedAt: time }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      time.setSeconds(time.getSeconds() + 1)
    }
  }
}

/** claimId() in the recordings folder. */
export function claimRecordingId(start: Date): Promise<{ id: string; startedAt: Date }> {
  return claimId(recordingsDir(), start)
}

/**
 * Writes the whole file or nothing: the data goes to a temporary file that then
 * replaces the old one, so a crash mid-write never leaves a truncated JSON.
 */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, data)
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(temp, path)
      return
    } catch (error) {
      // Windows refuses to replace a file another process (an antivirus scan, a
      // second copy of the app reading it) has open for a moment.
      if (attempt >= 5 || (error as NodeJS.ErrnoException).code !== 'EPERM') {
        await rm(temp, { force: true })
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt))
    }
  }
}

export async function readMeta(id: string): Promise<RecordingMeta> {
  return JSON.parse(await readFile(metaFile(id), 'utf8')) as RecordingMeta
}

export async function writeMeta(meta: RecordingMeta): Promise<void> {
  await writeFileAtomic(metaFile(meta.id), JSON.stringify(meta, null, 2))
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

async function modifiedAt(path: string): Promise<Date | null> {
  try {
    return (await stat(path)).mtime
  } catch {
    return null
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * When the audio is deleted automatically, or null while it is kept.
 *
 * Audio that was never transcribed is kept until it is: deleting it would lose
 * the meeting. Otherwise it goes 7 days after the recording (or the import, as
 * imported files may be old), and never less than a day after the transcription.
 */
export function audioExpiresAt(meta: RecordingMeta, transcribedAt: Date | null): Date | null {
  if (!transcribedAt) return null
  const period = Date.parse(meta.importedAt ?? meta.startedAt) + AUDIO_RETENTION_DAYS * DAY_MS
  return new Date(Math.max(period, transcribedAt.getTime() + DAY_MS))
}

/**
 * A title as the list and the page show it: one line, no wrapping quotes or
 * final period, at most MAX_TITLE characters. Empty becomes undefined.
 */
export function cleanTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const title = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”«]+|["'“”»]+$/g, '')
    .replace(/\.+$/, '')
    .trim()
  return title ? title.slice(0, MAX_TITLE).trim() : undefined
}

/** Names a recording; an empty title removes the name, so the suggested one shows again. */
export async function renameRecording(id: string, title: unknown): Promise<void> {
  const meta = await readMeta(id)
  const name = cleanTitle(title)
  if (name) meta.title = name
  else delete meta.title
  await writeMeta(meta)
}

/** summary.json, or null when there is none (or it can't be read). */
async function readSummary(id: string): Promise<Summary | null> {
  try {
    return JSON.parse(await readFile(summaryFile(id), 'utf8')) as Summary
  } catch {
    return null
  }
}

export async function summarize(id: string): Promise<RecordingSummary | null> {
  try {
    const meta = await readMeta(id)
    const bytes = { mic: 0, system: 0 }
    for (const channel of CHANNELS) bytes[channel] = await fileSize(channelFile(id, channel))
    const transcribedAt = await modifiedAt(transcriptFile(id))
    const summary = await readSummary(id)
    const suggested = typeof summary?.title === 'string' ? summary.title : null
    return {
      id,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt ?? null,
      bytes,
      hasAudio: bytes.mic + bytes.system > 0,
      audioDeletedAt: meta.audioDeletedAt ?? null,
      audioExpiresAt: audioExpiresAt(meta, transcribedAt)?.toISOString() ?? null,
      hasTranscript: transcribedAt !== null,
      hasSummary: summary !== null,
      importedFileName: meta.source === 'import' ? (meta.importedFileName ?? '') : null,
      title: meta.title || suggested || null,
      titleIsCustom: !!meta.title
    }
  } catch {
    return null
  }
}

export async function listIds(): Promise<string[]> {
  try {
    return (await readdir(recordingsDir())).filter((name) => ID_PATTERN.test(name))
  } catch {
    return []
  }
}

/** Removes the audio files and records why; the transcript and summary stay. */
export async function deleteAudio(
  id: string,
  reason: NonNullable<RecordingMeta['audioDeletedReason']>
): Promise<void> {
  for (const channel of CHANNELS) await rm(channelFile(id, channel), { force: true })
  const meta = await readMeta(id)
  if (!meta.audioDeletedAt) {
    meta.audioDeletedAt = new Date().toISOString()
    meta.audioDeletedReason = reason
    await writeMeta(meta)
  }
}

/**
 * Work files that only exist while a job runs: 16 kHz WAV copies and Whisper
 * output (transcription), half-converted imports and half-written JSON.
 */
export const WORK_FILE = /\.16k\.wav$|\.whisper\.json$|\.part$|\.tmp$/

/**
 * Deletes work files left behind when the app closed mid-job. Only files older
 * than a day go, so a job still running in a second copy of the app (dev and the
 * installed app share the folder) keeps its files. Returns how many it removed.
 */
export async function removeLeftoverWorkFiles(now = Date.now()): Promise<number> {
  let removed = 0
  for (const id of await listIds()) {
    const dir = recordingDir(id)
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    for (const name of names.filter((n) => WORK_FILE.test(n))) {
      const path = join(dir, name)
      const at = await modifiedAt(path)
      if (at && now - at.getTime() > DAY_MS) {
        await rm(path, { force: true })
        removed++
      }
    }
  }
  return removed
}
