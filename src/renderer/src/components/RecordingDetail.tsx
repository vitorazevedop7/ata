import { useEffect, useRef, useState } from 'react'
import {
  MAX_TITLE,
  type JobStatus,
  type RecordingSummary,
  type Summary,
  type Transcript,
  type TranscriptSegment
} from '../../../shared/types'
import {
  SPEAKER,
  audioNote,
  describeJob,
  formatClock,
  formatLength,
  formatWhen,
  importNote,
  languagesOf,
  speakerOf,
  summaryToText,
  transcriptToText
} from '../format'
import { AskSection } from './AskSection'
import { CopyButton, DeleteAudioButton, Progress, TranscribeMenu } from './controls'
import { ChevronLeftIcon, FolderIcon, NoteIcon, PencilIcon, TrashIcon } from './icons'

type Tab = 'summary' | 'transcript'

/**
 * The page title: the meeting's name (or its date until it has one). Clicking it
 * turns it into a field; Enter or leaving the field saves, Esc cancels, and an
 * empty name brings back the one the summary suggested.
 */
function SheetTitle({
  item,
  onRenamed,
  onError
}: {
  item: RecordingSummary
  onRenamed: () => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  // The name just saved, shown right away while the list still has the old one.
  const [saved, setSaved] = useState<{ name: string; over: string | null } | null>(null)
  const title = saved && saved.over === item.title ? saved.name : item.title
  const field = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)

  const editing = draft !== null

  // Select the whole name when editing starts, so typing replaces it.
  useEffect(() => {
    if (editing) field.current?.select()
  }, [editing])

  const save = async (): Promise<void> => {
    const next = (draft ?? '').trim()
    setDraft(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (next === (title ?? '')) return
    // An empty name goes back to the suggested one, which only the reload knows.
    if (next) setSaved({ name: next, over: item.title })
    try {
      await window.api.recording.rename(item.id, next)
      onRenamed()
    } catch (error) {
      setSaved(null)
      onError(error instanceof Error ? error.message : String(error))
    }
  }

  if (editing) {
    return (
      <h1 className="sheet-title">
        <input
          ref={field}
          className="sheet-title-field"
          value={draft}
          maxLength={MAX_TITLE}
          placeholder="Nome da reunião"
          aria-label="Nome da reunião"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              cancelled.current = true
              event.currentTarget.blur()
            }
          }}
        />
      </h1>
    )
  }

  return (
    <h1 className="sheet-title">
      <button className="sheet-title-button" title="Renomear" onClick={() => setDraft(title ?? '')}>
        {title ?? formatWhen(item.startedAt, true)}
        <PencilIcon className="sheet-title-pencil" />
      </button>
    </h1>
  )
}

/**
 * Index of the segment being spoken at `ms`: the latest one that started by
 * then, preferring one still running (the two channels overlap in time).
 */
function segmentAt(segments: TranscriptSegment[], ms: number): number {
  let best = -1
  let bestRunning = -1
  segments.forEach((segment, index) => {
    if (segment.startMs > ms) return
    if (best === -1 || segment.startMs >= segments[best].startMs) best = index
    if (
      ms < segment.endMs &&
      (bestRunning === -1 || segment.startMs >= segments[bestRunning].startMs)
    )
      bestRunning = index
  })
  if (bestRunning !== -1) return bestRunning
  return best === -1 ? 0 : best
}

/**
 * Index of the segment whose displayed time (rounded down to the second) is
 * closest to `ms`, for times cited by the model in its answers.
 */
function segmentNear(segments: TranscriptSegment[], ms: number): number {
  let index = 0
  let best = Infinity
  segments.forEach((segment, i) => {
    const distance = Math.abs(Math.floor(segment.startMs / 1000) * 1000 - ms)
    if (distance < best) [index, best] = [i, distance]
  })
  return index
}

/** Silence that starts a new paragraph in a single-speaker transcript. */
const PAUSE_MS = 1500

/** One section of the minutes: the label sits in the margin, left of the red rule. */
function Entry({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="entry">
      <h3 className="entry-label">{label}</h3>
      <div className="entry-body">{children}</div>
    </section>
  )
}

function SummaryView({
  summary,
  imported
}: {
  summary: Summary
  imported: boolean
}): React.JSX.Element {
  const list = (items: string[]): React.JSX.Element => (
    <ul className="lines">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )

  return (
    <div className="minutes">
      <div className="sheet-tools">
        <CopyButton getText={() => summaryToText(summary)} label="Copiar resumo" />
      </div>
      <Entry label="Resumo">
        <p className="overview">{summary.overview}</p>
      </Entry>
      {summary.decisions.length > 0 && (
        <Entry label="Decisões">
          <ul className="lines decisions">
            {summary.decisions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Entry>
      )}
      {summary.actionItems.length > 0 && (
        <Entry label="Tarefas">
          <ul className="lines tasks">
            {summary.actionItems.map((item, index) => (
              <li key={index}>
                <span>{item.task}</span>
                {!imported && (
                  <span
                    className={`owner${item.owner === SPEAKER.mic ? ' me' : item.owner ? '' : ' unknown'}`}
                  >
                    {item.owner ?? 'Sem dono'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Entry>
      )}
      {summary.keyPoints.length > 0 && (
        <Entry label="Pontos principais">{list(summary.keyPoints)}</Entry>
      )}
      {summary.openQuestions.length > 0 && (
        <Entry label="Pendências">{list(summary.openQuestions)}</Entry>
      )}
      <p className="footnote">
        Gerado no seu computador com {summary.model}. Pode conter erros; confira na transcrição.
      </p>
    </div>
  )
}

/**
 * The conversation as a stenographer's pad: "Outros" on the left of the red
 * rule, "Eu" on the right. Consecutive lines from the same side form one turn.
 */
function TranscriptView({
  transcript,
  imported,
  flash,
  onFlashEnd
}: {
  transcript: Transcript
  imported: boolean
  /** Segment to scroll to and highlight briefly; a new object scrolls again. */
  flash: { index: number } | null
  onFlashEnd: () => void
}): React.JSX.Element {
  const lines = useRef<HTMLOListElement>(null)

  useEffect(() => {
    if (!flash) return
    const line = lines.current?.children[flash.index]
    line?.scrollIntoView({ block: 'center' })
  }, [flash])

  if (transcript.segments.length === 0) {
    return (
      <div className="sheet-note">
        <p className="sheet-note-title">Nenhuma fala foi detectada</p>
        <p>O áudio desta gravação não tinha voz que o Whisper reconhecesse.</p>
      </div>
    )
  }
  return (
    <div className={`steno${imported ? ' single' : ''}`}>
      <div className="sheet-tools">
        <span className="steno-langs">{languagesOf(transcript, imported)}</span>
        <CopyButton
          getText={() => transcriptToText(transcript, imported)}
          label="Copiar transcrição"
        />
      </div>
      {!imported && (
        <div className="steno-heads" aria-hidden>
          <span>{SPEAKER.system}</span>
          <span>{SPEAKER.mic}</span>
        </div>
      )}
      <ol className="steno-lines" ref={lines}>
        {transcript.segments.map((segment, index) => {
          const previous = transcript.segments[index - 1]
          // One speaker: a pause starts a new paragraph instead of a change of side.
          const turn =
            !previous ||
            (imported
              ? segment.startMs - previous.endMs > PAUSE_MS
              : previous.channel !== segment.channel)
          const flashing = flash?.index === index
          return (
            <li
              key={index}
              className={`said ${segment.channel}${turn ? ' turn' : ''}${flashing ? ' flash' : ''}`}
              onAnimationEnd={flashing ? onFlashEnd : undefined}
            >
              <span className="said-who">{speakerOf(segment.channel, imported)}</span>
              <time className="said-time">{formatClock(segment.startMs / 1000)}</time>
              <p className="said-text">{segment.text}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function RecordingDetail({
  item,
  revision,
  live,
  transcribeStatus,
  summarizeStatus,
  askStatus,
  onBack,
  onError,
  onChanged,
  focusMs
}: {
  item: RecordingSummary
  /** Bumped whenever a job for this recording finishes, to reload results. */
  revision: number
  /** True while this recording is still being captured. */
  live: boolean
  transcribeStatus?: JobStatus
  summarizeStatus?: JobStatus
  askStatus?: JobStatus
  onBack: () => void
  onError: (message: string) => void
  /** Called after an action here changes the recording on disk. */
  onChanged: () => void
  /**
   * Instant in the recording to show: switches to the transcript, scrolls to
   * the segment spoken then and highlights it. Each new value jumps again.
   */
  focusMs?: number
}): React.JSX.Element {
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  // Open on the summary when there is one, or news about it (in progress or failed).
  const [tab, setTab] = useState<Tab>(
    focusMs === undefined && (item.hasSummary || summarizeStatus) ? 'summary' : 'transcript'
  )
  const [flash, setFlash] = useState<{ index: number } | null>(null)
  const [handledFocus, setHandledFocus] = useState<number | undefined>(undefined)
  const [hadTranscript, setHadTranscript] = useState(item.hasTranscript)

  // The transcript just arrived and its summary is on the way: show the summary's progress.
  if (item.hasTranscript !== hadTranscript) {
    setHadTranscript(item.hasTranscript)
    if (item.hasTranscript && summarizeStatus && focusMs === undefined) setTab('summary')
  }

  // Jump once the transcript is loaded, and again whenever focusMs changes
  // (not when the transcript reloads after a job finishes).
  if (transcript && focusMs !== handledFocus) {
    setHandledFocus(focusMs)
    if (focusMs !== undefined && transcript.segments.length > 0) {
      setTab('transcript')
      setFlash({ index: segmentAt(transcript.segments, focusMs) })
    }
  }

  // Times cited in an answer: jump to the line shown with that time.
  const showAt = (ms: number): void => {
    if (!transcript || transcript.segments.length === 0) return
    setTab('transcript')
    setFlash({ index: segmentNear(transcript.segments, ms) })
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      item.hasTranscript ? window.api.results.transcript(item.id) : null,
      item.hasSummary ? window.api.results.summary(item.id) : null
    ]).then(([t, s]) => {
      if (cancelled) return
      setTranscript(t)
      setSummary(s)
    })
    return () => {
      cancelled = true
    }
  }, [item.id, item.hasTranscript, item.hasSummary, revision])

  const transcribing = transcribeStatus && transcribeStatus.stage !== 'error'
  const summarizing = summarizeStatus && summarizeStatus.stage !== 'error'
  const length = formatLength(item)
  const imported = item.importedFileName !== null
  const source = importNote(item)
  const summarize = (): void => {
    setTab('summary')
    void window.api.jobs.summarize(item.id)
  }
  const transcribe = (deleteAudio: boolean): void =>
    void window.api.jobs.transcribe(item.id, { deleteAudio })

  return (
    <article className="sheet">
      <button className="btn plain back" onClick={onBack}>
        <ChevronLeftIcon /> Gravações
      </button>

      <header className="sheet-head">
        <SheetTitle item={item} onRenamed={onChanged} onError={onError} />
        <p className="sheet-meta">
          {item.title && (
            <>
              <span>{formatWhen(item.startedAt, true)}</span>
              <span className="sep" aria-hidden />
            </>
          )}
          <span>{length ?? (live ? 'Gravando agora' : 'Gravação incompleta')}</span>
          <span className="sep" aria-hidden />
          <span>{audioNote(item)}</span>
          {source && (
            <>
              <span className="sep" aria-hidden />
              <span className="sheet-source" title={source}>
                {source}
              </span>
            </>
          )}
        </p>
        <div className="sheet-actions">
          {item.hasTranscript && summary && (
            <button className="btn" disabled={summarizing || transcribing} onClick={summarize}>
              <NoteIcon /> Refazer resumo
            </button>
          )}
          <span className="spacer" />
          {item.hasAudio && item.endedAt && !transcribing && (
            <DeleteAudioButton
              hasTranscript={item.hasTranscript}
              onConfirm={async () => {
                try {
                  await window.api.recording.deleteAudio(item.id)
                  onChanged()
                } catch (error) {
                  onError(error instanceof Error ? error.message : String(error))
                }
              }}
            />
          )}
          {transcribing && !transcribeStatus.deleteAudio && (
            <button className="btn plain danger" onClick={() => transcribe(true)}>
              <TrashIcon /> Apagar áudio ao terminar
            </button>
          )}
          <button
            className="btn plain icon"
            title="Abrir a pasta da gravação"
            aria-label="Abrir a pasta da gravação"
            onClick={() => void window.api.recording.openFolder(item.id)}
          >
            <FolderIcon />
          </button>
        </div>
      </header>

      {item.hasTranscript ? (
        <>
          <div className="tabs" role="tablist" aria-label="Conteúdo da gravação">
            <button
              role="tab"
              id="tab-summary"
              aria-selected={tab === 'summary'}
              aria-controls="panel"
              className="tab"
              onClick={() => {
                setTab('summary')
                setFlash(null)
              }}
            >
              Resumo
            </button>
            <button
              role="tab"
              id="tab-transcript"
              aria-selected={tab === 'transcript'}
              aria-controls="panel"
              className="tab"
              onClick={() => setTab('transcript')}
            >
              Transcrição
            </button>
          </div>

          <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="panel">
            {tab === 'summary' ? (
              <>
                {summarizing && (
                  <div className="sheet-note working">
                    <Progress
                      label={describeJob(summarizeStatus)}
                      percent={summarizeStatus.percent}
                    />
                    <p>O resumo é gerado no seu computador e pode levar alguns minutos.</p>
                  </div>
                )}
                {summarizeStatus?.stage === 'error' && (
                  <div className="sheet-note error" role="alert">
                    <p className="sheet-note-title">{describeJob(summarizeStatus)}</p>
                    <p className="mono">{summarizeStatus.error}</p>
                  </div>
                )}
                {summary ? (
                  <SummaryView summary={summary} imported={imported} />
                ) : (
                  !summarizing && (
                    <div className="sheet-note">
                      <p className="sheet-note-title">Ainda sem resumo</p>
                      <p>
                        O modelo local lê a transcrição e separa o resumo, as decisões, as tarefas e
                        o que ficou pendente.
                      </p>
                      <div className="sheet-note-actions">
                        <button className="btn primary" disabled={transcribing} onClick={summarize}>
                          <NoteIcon /> Resumir
                        </button>
                      </div>
                    </div>
                  )
                )}
                {transcript && transcript.segments.length > 0 && (
                  <AskSection
                    recordingId={item.id}
                    revision={revision}
                    status={askStatus}
                    onShowAt={showAt}
                  />
                )}
              </>
            ) : transcript ? (
              <TranscriptView
                transcript={transcript}
                imported={imported}
                flash={flash}
                onFlashEnd={() => setFlash(null)}
              />
            ) : null}
          </div>
        </>
      ) : (
        <div className="panel">
          {transcribing && (
            <div className="sheet-note working">
              <Progress
                label={describeJob(transcribeStatus, imported)}
                percent={transcribeStatus.percent}
              />
              <p>
                Roda no seu computador e o áudio não sai daqui. Quando o texto ficar pronto, o
                resumo começa sozinho.
                {transcribeStatus.deleteAudio && ' O áudio será apagado em seguida.'}
              </p>
            </div>
          )}
          {transcribeStatus?.stage === 'error' && (
            <div className="sheet-note error" role="alert">
              <p className="sheet-note-title">{describeJob(transcribeStatus)}</p>
              <p className="mono">{transcribeStatus.error}</p>
            </div>
          )}
          {!transcribing && item.hasAudio && item.endedAt && (
            <div className="sheet-note">
              <p className="sheet-note-title">
                {transcribeStatus?.stage === 'error' ? 'Tentar de novo' : 'Ainda não transcrita'}
              </p>
              <p>
                {imported
                  ? 'O Whisper transforma o áudio em texto. O arquivo tem uma faixa só, então as falas aparecem juntas, sem separar quem disse o quê. Depois o resumo é gerado sozinho.'
                  : 'O Whisper transforma o áudio em texto, separando o que você disse do que os outros disseram. Depois o resumo é gerado sozinho.'}
              </p>
              <div className="sheet-note-actions">
                <TranscribeMenu onTranscribe={transcribe} align="start" />
              </div>
            </div>
          )}
          {!item.hasAudio && item.endedAt && (
            <div className="sheet-note">
              <p className="sheet-note-title">Sem transcrição</p>
              <p>O áudio desta gravação foi apagado antes de ser transcrito.</p>
            </div>
          )}
          {!item.endedAt && (
            <div className="sheet-note">
              <p className="sheet-note-title">{live ? 'Gravando' : 'Gravação incompleta'}</p>
              <p>
                {live
                  ? 'Quando você parar, a transcrição e o resumo começam sozinhos.'
                  : 'Esta gravação não foi finalizada, provavelmente porque o app fechou enquanto gravava.'}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
