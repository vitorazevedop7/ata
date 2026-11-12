export type Channel = 'mic' | 'system'

/** Audio files are deleted this many days after a recording starts. */
export const AUDIO_RETENTION_DAYS = 7

export interface RecordingSummary {
  id: string
  startedAt: string
  endedAt: string | null
  bytes: Record<Channel, number>
  hasAudio: boolean
  audioDeletedAt: string | null
  /** When the audio will be deleted automatically. */
  audioExpiresAt: string
  hasTranscript: boolean
  hasSummary: boolean
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

export interface ActionItem {
  task: string
  /** "Eu", "Outros" or null when the transcript doesn't make it clear. */
  owner: string | null
}

export interface Summary {
  version: 1
  createdAt: string
  model: string
  overview: string
  keyPoints: string[]
  decisions: string[]
  actionItems: ActionItem[]
  openQuestions: string[]
}

export type JobKind = 'transcribe' | 'summarize'

export type JobStage = 'queued' | 'converting' | 'transcribing' | 'summarizing' | 'done' | 'error'

export interface JobStatus {
  id: string
  kind: JobKind
  stage: JobStage
  channel?: Channel
  /** 0..100 when known. */
  percent?: number
  error?: string
}

export interface TranscribeOptions {
  /** Delete the audio files once the transcript is saved. */
  deleteAudio: boolean
}

export interface RecordingApi {
  start(): Promise<string>
  appendChunk(id: string, channel: Channel, data: ArrayBuffer): Promise<void>
  stop(id: string): Promise<RecordingSummary | null>
  list(): Promise<RecordingSummary[]>
  deleteAudio(id: string): Promise<void>
  openFolder(id?: string): Promise<void>
}

export interface JobsApi {
  transcribe(id: string, options: TranscribeOptions): Promise<void>
  summarize(id: string): Promise<void>
  statuses(): Promise<JobStatus[]>
  /** Subscribes to status changes; returns the unsubscribe function. */
  onStatus(listener: (status: JobStatus) => void): () => void
}

export interface ResultsApi {
  transcript(id: string): Promise<Transcript | null>
  summary(id: string): Promise<Summary | null>
}

export interface SearchHit {
  /** Recording the match belongs to. */
  id: string
  source: 'transcript' | 'summary'
  /** Excerpt around the match, with "…" where it was cut. */
  snippet: string
  /** Start and end of the match inside `snippet`. */
  match: [number, number]
  /** Where the segment starts, for matches in the transcript. */
  startMs?: number
  channel?: Channel
}

export interface SearchApi {
  /** Finds the text in transcripts and summaries, ignoring case and accents. */
  query(text: string): Promise<SearchHit[]>
}
