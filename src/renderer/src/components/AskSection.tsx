import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import type { ChatEntry, JobStatus } from '../../../shared/types'
import { describeJob } from '../format'
import { Progress } from './controls'

/** "[12:34]", "[1:02:10]" or several times in one bracket: "[12:34, 13:05]". */
const CITATION = /\[(\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:,|e|–|-)\s*\d{1,2}:\d{2}(?::\d{2})?)*)\]/g
const TIME = /\d{1,2}:\d{2}(?::\d{2})?/g

function toMs(time: string): number {
  const parts = time.split(':').map(Number)
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return seconds * 1000
}

/** Electron prefixes errors thrown in the main process; the user only needs our message. */
function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

/** The answer as text, with every cited time turned into a link to the transcript. */
function AnswerText({
  text,
  onShowAt
}: {
  text: string
  onShowAt: (ms: number) => void
}): React.JSX.Element {
  const clean = text.replace(/\*\*/g, '')
  const parts: ReactNode[] = []
  let last = 0
  for (const match of clean.matchAll(CITATION)) {
    parts.push(clean.slice(last, match.index))
    let inner = 0
    for (const time of match[1].matchAll(TIME)) {
      parts.push(match[1].slice(inner, time.index))
      parts.push(
        <button
          key={`${match.index}-${time.index}`}
          type="button"
          className="cite"
          title="Ver na transcrição"
          onClick={() => onShowAt(toMs(time[0]))}
        >
          {time[0]}
        </button>
      )
      inner = time.index + time[0].length
    }
    parts.push(match[1].slice(inner))
    last = match.index + match[0].length
  }
  parts.push(clean.slice(last))
  return <p className="qa-a">{parts}</p>
}

/** Questions about the recording, answered by the local model from the transcript. */
export function AskSection({
  recordingId,
  revision,
  status,
  onShowAt
}: {
  recordingId: string
  /** Bumped when a job for this recording finishes, to reload the history. */
  revision: number
  status?: JobStatus
  onShowAt: (ms: number) => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.results.chat(recordingId).then((chat) => {
      if (!cancelled) setEntries(chat)
    })
    return () => {
      cancelled = true
    }
  }, [recordingId, revision])

  const busy = status !== undefined && status.stage !== 'error'

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault()
    const text = question.trim()
    if (!text || busy) return
    setError(null)
    try {
      await window.api.jobs.ask(recordingId, text)
      setQuestion('')
    } catch (err) {
      setError(cleanError(err))
    }
  }

  const cancel = (): void => {
    void window.api.jobs.cancelAsk(recordingId)
    // Give the question back so it can be edited or asked again.
    if (!question.trim() && status?.question) setQuestion(status.question)
  }

  return (
    <section className="minutes ask" aria-label="Perguntas sobre a conversa">
      <div className="entry">
        <h3 className="entry-label">Perguntas</h3>
        <div className="entry-body">
          {(entries.length > 0 || busy) && (
            <ol className="qa-list">
              {entries.map((entry, index) => (
                <li key={index} className="qa">
                  <p className="qa-q">{entry.question}</p>
                  <AnswerText text={entry.answer} onShowAt={onShowAt} />
                </li>
              ))}
              {busy && (
                <li className="qa pending">
                  <p className="qa-q">{status.question}</p>
                  {status.partial && <AnswerText text={status.partial} onShowAt={onShowAt} />}
                  <div className="qa-working">
                    <Progress label={describeJob(status)} />
                    <button type="button" className="btn" onClick={cancel}>
                      Cancelar
                    </button>
                  </div>
                </li>
              )}
            </ol>
          )}

          {status?.stage === 'error' && (
            <div className="sheet-note error" role="alert">
              <p className="sheet-note-title">{describeJob(status)}</p>
              <p className="mono">{status.error}</p>
            </div>
          )}
          {error && (
            <p className="ask-error" role="alert">
              {error}
            </p>
          )}

          <form className="ask-form" onSubmit={(event) => void submit(event)}>
            <textarea
              className="ask-input"
              rows={2}
              maxLength={1000}
              aria-label="Pergunta sobre a conversa"
              placeholder="Pergunte sobre a conversa, como “quem ficou de enviar a proposta?”"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void submit()
                }
              }}
            />
            <button type="submit" className="btn primary" disabled={busy || !question.trim()}>
              Perguntar
            </button>
          </form>
          <p className="ask-hint">
            Respondido no seu computador, a partir da transcrição. Pode errar: clique nos horários
            para conferir.
          </p>
        </div>
      </div>
    </section>
  )
}
