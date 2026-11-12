export type Channel = 'mic' | 'system'

export interface RecordingSummary {
  id: string
  startedAt: string
  endedAt: string | null
  bytes: Record<Channel, number>
  hasTranscript: boolean
}

export interface TranscriptSegment {
  channel: Channel
  startMs: number
  endMs: number
  text: string
}

export interface Transcript {
  version: 1
  createdAt: string
  /** Language detected by Whisper for each channel that had audio. */
  languages: Partial<Record<Channel, string>>
  segments: TranscriptSegment[]
}

export type TranscriptionStage = 'queued' | 'converting' | 'transcribing' | 'done' | 'error'

export interface TranscriptionStatus {
  id: string
  stage: TranscriptionStage
  channel?: Channel
  /** 0..100 while transcribing. */
  percent?: number
  error?: string
}

export interface RecordingApi {
  start(): Promise<string>
  appendChunk(id: string, channel: Channel, data: ArrayBuffer): Promise<void>
  stop(id: string): Promise<RecordingSummary | null>
  list(): Promise<RecordingSummary[]>
  openFolder(id?: string): Promise<void>
}

export interface TranscriptionApi {
  start(id: string): Promise<void>
  get(id: string): Promise<Transcript | null>
  statuses(): Promise<TranscriptionStatus[]>
  /** Subscribes to status changes; returns the unsubscribe function. */
  onStatus(listener: (status: TranscriptionStatus) => void): () => void
}
