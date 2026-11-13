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
  /** When the audio will be deleted automatically; null while it is kept until transcribed. */
  audioExpiresAt: string | null
  hasTranscript: boolean
  hasSummary: boolean
  /** Name of the imported file, or null for a recording made in the app. */
  importedFileName: string | null
  /** The name the user gave, else the one the summary suggested; null shows the date. */
  title: string | null
  /** True when `title` was typed by the user rather than suggested by the summary. */
  titleIsCustom: boolean
}

/** Longest title kept, in characters. */
export const MAX_TITLE = 120

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
  /** Short title suggested by the model; missing in summaries made before titles existed. */
  title?: string
  overview: string
  keyPoints: string[]
  decisions: string[]
  actionItems: ActionItem[]
  openQuestions: string[]
}

export interface ChatEntry {
  question: string
  /** Plain text; cites transcript times as [mm:ss] or [h:mm:ss]. */
  answer: string
  askedAt: string
  model: string
}

export interface Chat {
  version: 1
  entries: ChatEntry[]
}

export type JobKind = 'transcribe' | 'summarize' | 'ask'

export type JobStage =
  'queued' | 'converting' | 'transcribing' | 'summarizing' | 'answering' | 'done' | 'error'

export interface JobStatus {
  id: string
  kind: JobKind
  stage: JobStage
  channel?: Channel
  /** 0..100 when known. */
  percent?: number
  error?: string
  /** For 'ask': the question being answered. */
  question?: string
  /** For 'ask': the answer so far, while it streams in. */
  partial?: string
  /** For 'transcribe': the audio is deleted once the transcript is saved. */
  deleteAudio?: boolean
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
  /** Names the recording; an empty title goes back to the one the summary suggested. */
  rename(id: string, title: string): Promise<void>
}

/** Extensions accepted by "Importar" and by dropping files on the window. */
export const IMPORT_EXTENSIONS: readonly string[] = [
  'mp3',
  'm4a',
  'ogg',
  'opus',
  'wav',
  'mp4',
  'webm',
  'mkv'
]

export interface ImportProgress {
  fileName: string
  /** Position of this file among the ones being imported (0-based). */
  index: number
  total: number
  /** 0..100 when the file's duration is known. */
  percent?: number
}

export interface ImportResult {
  ids: string[]
  /** One message per file that could not be imported. */
  errors: string[]
}

export interface ImportApi {
  /** Imports the given files, or asks for them with the system dialog when omitted. */
  files(paths?: string[]): Promise<ImportResult>
  /** Absolute path of a file dropped on the window. */
  pathOf(file: File): string
  /** Subscribes to conversion progress (null when it ends); returns the unsubscribe function. */
  onProgress(listener: (progress: ImportProgress | null) => void): () => void
}

export interface JobsApi {
  transcribe(id: string, options: TranscribeOptions): Promise<void>
  summarize(id: string): Promise<void>
  /** Asks a question about the recording; the answer is saved to chat.json. */
  ask(id: string, question: string): Promise<void>
  /** Drops a queued question or stops the one being answered. */
  cancelAsk(id: string): Promise<void>
  statuses(): Promise<JobStatus[]>
  /** Subscribes to status changes; returns the unsubscribe function. */
  onStatus(listener: (status: JobStatus) => void): () => void
}

export interface ResultsApi {
  transcript(id: string): Promise<Transcript | null>
  summary(id: string): Promise<Summary | null>
  chat(id: string): Promise<ChatEntry[]>
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
