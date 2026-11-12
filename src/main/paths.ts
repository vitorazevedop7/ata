import { app } from 'electron'
import { join } from 'path'
import type { Channel } from '../shared/types'

export const CHANNELS: readonly Channel[] = ['mic', 'system']
export const ID_PATTERN = /^\d{8}-\d{6}$/

export function recordingsDir(): string {
  return join(app.getPath('userData'), 'recordings')
}

export function recordingDir(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`invalid recording id: ${id}`)
  return join(recordingsDir(), id)
}

export function channelFile(id: string, channel: Channel): string {
  if (!CHANNELS.includes(channel)) throw new Error(`invalid channel: ${channel}`)
  return join(recordingDir(id), `${channel}.webm`)
}

export function metaFile(id: string): string {
  return join(recordingDir(id), 'meta.json')
}

export function transcriptFile(id: string): string {
  return join(recordingDir(id), 'transcript.json')
}

export function summaryFile(id: string): string {
  return join(recordingDir(id), 'summary.json')
}
