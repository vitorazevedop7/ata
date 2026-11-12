import { access, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { AUDIO_RETENTION_DAYS, type RecordingSummary } from '../shared/types'
import {
  CHANNELS,
  ID_PATTERN,
  channelFile,
  metaFile,
  recordingsDir,
  summaryFile,
  transcriptFile
} from './paths'

export interface RecordingMeta {
  id: string
  startedAt: string
  endedAt?: string
  audioDeletedAt?: string
  audioDeletedReason?: 'manual' | 'expired' | 'after-transcription'
  /** Set when the recording came from a file the user imported. */
  source?: 'import'
  importedFileName?: string
  importedAt?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function readMeta(id: string): Promise<RecordingMeta> {
  return JSON.parse(await readFile(metaFile(id), 'utf8')) as RecordingMeta
}

export async function writeMeta(meta: RecordingMeta): Promise<void> {
  await writeFile(metaFile(meta.id), JSON.stringify(meta, null, 2))
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
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

/** Imported files may be old: their audio gets the full period counted from the import. */
export function audioExpiresAt(meta: RecordingMeta): Date {
  return new Date(Date.parse(meta.importedAt ?? meta.startedAt) + AUDIO_RETENTION_DAYS * DAY_MS)
}

export async function summarize(id: string): Promise<RecordingSummary | null> {
  try {
    const meta = await readMeta(id)
    const bytes = { mic: 0, system: 0 }
    for (const channel of CHANNELS) bytes[channel] = await fileSize(channelFile(id, channel))
    return {
      id,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt ?? null,
      bytes,
      hasAudio: bytes.mic + bytes.system > 0,
      audioDeletedAt: meta.audioDeletedAt ?? null,
      audioExpiresAt: audioExpiresAt(meta).toISOString(),
      hasTranscript: await exists(transcriptFile(id)),
      hasSummary: await exists(summaryFile(id)),
      importedFileName: meta.source === 'import' ? (meta.importedFileName ?? '') : null
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
