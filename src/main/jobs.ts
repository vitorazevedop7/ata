import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import type { JobKind, JobStatus, Summary, TranscribeOptions, Transcript } from '../shared/types'
import { ask, readChat } from './ask'
import { stopOllama } from './ollama'
import { recordingDir, summaryFile, transcriptFile } from './paths'
import { killAll } from './process'
import { deleteAudio } from './store'
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

async function execute(job: Job, signal: AbortSignal): Promise<void> {
  const { id, kind, question } = job
  if (kind === 'transcribe') {
    await transcribe(id, (progress) => publish({ id, kind, ...progress }))
    if (job.options?.deleteAudio) await deleteAudio(id, 'after-transcription')
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

export function enqueue(id: string, kind: JobKind, options?: TranscribeOptions): void {
  recordingDir(id) // validates the id
  const current = statuses.get(key(id, kind))
  if (current && current.stage !== 'error') {
    // Already queued: a later "and delete audio" request still applies.
    const queued = queue.find((job) => job.id === id && job.kind === kind)
    if (queued && options?.deleteAudio) queued.options = options
    return
  }
  queue.push({ id, kind, options })
  publish({ id, kind, stage: 'queued' })
  void pump()
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
