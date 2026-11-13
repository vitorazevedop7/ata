import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import type {
  JobKind,
  JobStatus,
  RecordingSummary,
  Summary,
  TranscribeOptions,
  Transcript
} from '../shared/types'
import { ask, readChat } from './ask'
import { stopOllama } from './ollama'
import { recordingDir, summaryFile, transcriptFile } from './paths'
import { killAll } from './process'
import { deleteAudio, listIds, summarize as describeRecording } from './store'
import { summarize } from './summary'
import { transcribe } from './transcription'

interface Job {
  id: string
  kind: JobKind
  options?: TranscribeOptions
  /** For 'ask'. */
  question?: string
}

const MAX_QUESTION = 1000

/**
 * One job at a time: Whisper and the summary model both need most of the
 * machine's memory, so they never run in parallel.
 */
const queue: Job[] = []
const statuses = new Map<string, JobStatus>()
let running = false
/** The job being executed and how to stop it (only 'ask' listens). */
let current: { job: Job; controller: AbortController } | null = null

const key = (id: string, kind: JobKind): string => `${kind}:${id}`

function publish(status: JobStatus): void {
  if (status.stage === 'done') statuses.delete(key(status.id, status.kind))
  else statuses.set(key(status.id, status.kind), status)
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('jobs:status', status)
  }
}

/** True while the recording has a queued or running job (its audio must not be touched). */
export function isBusy(id: string): boolean {
  for (const status of statuses.values()) {
    if (status.id === id && status.kind !== 'ask' && status.stage !== 'error') return true
  }
  return false
}

function publishTranscribe(job: Job, status: JobStatus): void {
  publish({ ...status, deleteAudio: job.options?.deleteAudio === true })
}

/** A new transcript is summarized right away, ahead of anything else waiting. */
async function summarizeAfterTranscription(id: string): Promise<void> {
  const transcript = await readJson<Transcript>(transcriptFile(id))
  if (!transcript || transcript.segments.length === 0) return
  if (statuses.has(key(id, 'summarize'))) return
  queue.unshift({ id, kind: 'summarize' })
  publish({ id, kind: 'summarize', stage: 'queued' })
}

async function execute(job: Job, signal: AbortSignal): Promise<void> {
  const { id, kind, question } = job
  if (kind === 'transcribe') {
    await transcribe(id, (progress) => publishTranscribe(job, { id, kind, ...progress }))
    if (job.options?.deleteAudio) await deleteAudio(id, 'after-transcription')
    await summarizeAfterTranscription(id)
  } else if (kind === 'ask') {
    publish({ id, kind, stage: 'answering', question })
    await ask(id, question ?? '', signal, (partial) =>
      publish({ id, kind, stage: 'answering', question, partial })
    )
  } else {
    await summarize(id, (percent) => publish({ id, kind, stage: 'summarizing', percent }))
  }
}

async function pump(): Promise<void> {
  if (running) return
  running = true
  try {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const controller = new AbortController()
      current = { job, controller }
      try {
        await execute(job, controller.signal)
        publish({ id: job.id, kind: job.kind, stage: 'done' })
      } catch (error) {
        if (controller.signal.aborted) {
          // Cancelled by the user: nothing was saved, nothing to report.
          publish({ id: job.id, kind: job.kind, stage: 'done' })
          continue
        }
        publish({
          id: job.id,
          kind: job.kind,
          stage: 'error',
          error: error instanceof Error ? error.message : String(error),
          question: job.question
        })
      }
    }
  } finally {
    running = false
    current = null
  }
}

function enqueueQuestion(id: string, question: string): void {
  recordingDir(id) // validates the id
  const text = typeof question === 'string' ? question.trim() : ''
  if (!text) throw new Error('Escreva uma pergunta.')
  if (text.length > MAX_QUESTION) {
    throw new Error(`A pergunta passa de ${MAX_QUESTION} caracteres.`)
  }
  const status = statuses.get(key(id, 'ask'))
  if (status && status.stage !== 'error') {
    throw new Error('Espere a resposta da pergunta anterior.')
  }
  queue.push({ id, kind: 'ask', question: text })
  publish({ id, kind: 'ask', stage: 'queued', question: text })
  void pump()
}

function cancelQuestion(id: string): void {
  const index = queue.findIndex((job) => job.id === id && job.kind === 'ask')
  if (index >= 0) {
    queue.splice(index, 1)
    publish({ id, kind: 'ask', stage: 'done' })
  } else if (current?.job.id === id && current.job.kind === 'ask') {
    current.controller.abort()
  }
}

/**
 * Lets go of a recording that is about to be deleted: drops its queued jobs,
 * stops a question being answered and clears its statuses. Refuses while its
 * transcription or summary is running, since those write into its folder.
 */
export function releaseRecording(id: string): void {
  if (current?.job.id === id && current.job.kind !== 'ask') {
    throw new Error('Espere a transcrição e o resumo terminarem para apagar a gravação.')
  }
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].id === id) queue.splice(i, 1)
  }
  if (current?.job.id === id) current.controller.abort()
  for (const status of [...statuses.values()]) {
    if (status.id === id) publish({ id, kind: status.kind, stage: 'done' })
  }
}

export function enqueue(id: string, kind: JobKind, options?: TranscribeOptions): void {
  recordingDir(id) // validates the id
  const status = statuses.get(key(id, kind))
  if (status && status.stage !== 'error') {
    // Already queued or running: a later "and delete audio" request still applies.
    const pending =
      queue.find((job) => job.id === id && job.kind === kind) ??
      (current?.job.id === id && current.job.kind === kind ? current.job : undefined)
    if (pending && kind === 'transcribe' && options?.deleteAudio && !pending.options?.deleteAudio) {
      pending.options = options
      publishTranscribe(pending, status)
    }
    return
  }
  const job: Job = { id, kind, options }
  queue.push(job)
  if (kind === 'transcribe') publishTranscribe(job, { id, kind, stage: 'queued' })
  else publish({ id, kind, stage: 'queued' })
  void pump()
}

/**
 * Runs the whole pipeline for a recording that just ended (stopped, imported or
 * closed after a crash): transcription, then the summary.
 */
export function processRecording(id: string): void {
  enqueue(id, 'transcribe', { deleteAudio: false })
}

/**
 * What a finished recording still needs: the queue lives in memory, so work that
 * was waiting or running when the app closed is lost and has to be found again.
 */
export function pendingJob(item: RecordingSummary): 'transcribe' | 'summarize' | null {
  if (!item.endedAt) return null
  if (!item.hasTranscript) return item.hasAudio ? 'transcribe' : null
  return item.hasSummary ? null : 'summarize'
}

/** Queues, newest first, the transcriptions and summaries that never ran. */
export async function resumePendingJobs(): Promise<void> {
  const items = (await Promise.all((await listIds()).map(describeRecording)))
    .filter((item): item is RecordingSummary => item !== null)
    .sort((a, b) => b.id.localeCompare(a.id))
  for (const item of items) {
    const kind = pendingJob(item)
    if (kind === 'transcribe') processRecording(item.id)
    if (kind === 'summarize') {
      // A transcript with no speech has nothing to summarize.
      const transcript = await readJson<Transcript>(transcriptFile(item.id))
      if (transcript?.segments.length) enqueue(item.id, 'summarize')
    }
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

export function registerJobsIpc(): void {
  ipcMain.handle('jobs:transcribe', (_event, id: string, options: TranscribeOptions) =>
    enqueue(id, 'transcribe', { deleteAudio: options?.deleteAudio === true })
  )
  ipcMain.handle('jobs:summarize', (_event, id: string) => enqueue(id, 'summarize'))
  ipcMain.handle('jobs:ask', (_event, id: string, question: string) =>
    enqueueQuestion(id, question)
  )
  ipcMain.handle('jobs:cancel-ask', (_event, id: string) => cancelQuestion(id))
  ipcMain.handle('jobs:statuses', () => [...statuses.values()])

  ipcMain.handle('results:transcript', (_event, id: string) =>
    readJson<Transcript>(transcriptFile(id))
  )
  ipcMain.handle('results:summary', (_event, id: string) => readJson<Summary>(summaryFile(id)))
  ipcMain.handle('results:chat', (_event, id: string) => readChat(id))

  app.on('before-quit', () => {
    queue.length = 0
    killAll()
    stopOllama()
  })
}
