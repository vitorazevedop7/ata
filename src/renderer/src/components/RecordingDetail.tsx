import { useEffect, useState } from 'react'
import type { JobStatus, RecordingSummary, Summary, Transcript } from '../../../shared/types'
import { audioNote, describeJob, formatLength, formatWhen, importNote } from '../format'
import { segmentAt, segmentNear } from '../segments'
import { AskSection } from './AskSection'
import { DeleteMenu, Progress, TranscribeMenu } from './controls'
import { ChevronLeftIcon, FolderIcon, NoteIcon, TrashIcon } from './icons'
import { SheetTitle } from './SheetTitle'
import { SummaryView } from './SummaryView'
import { TranscriptView } from './TranscriptView'

type Tab = 'summary' | 'transcript'

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
  onDeleted,
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
  /** Called after the whole recording went to the trash. */
  onDeleted: () => void
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
  // Running, not just waiting in the queue: a queued job is dropped when the
  // recording is deleted, but a running one writes into its folder.
  const running = (status?: JobStatus): boolean =>
    !!status && status.stage !== 'queued' && status.stage !== 'error'
  const canDeleteRecording =
    !!item.endedAt && !live && !running(transcribeStatus) && !running(summarizeStatus)
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
          {canDeleteRecording && (
            <DeleteMenu
              canDeleteAudio={item.hasAudio && !transcribing && !summarizing}
              hasTranscript={item.hasTranscript}
              onDeleteAudio={async () => {
                try {
                  await window.api.recording.deleteAudio(item.id)
                  onChanged()
                } catch (error) {
                  onError(error instanceof Error ? error.message : String(error))
                }
              }}
              onDeleteRecording={async () => {
                try {
                  await window.api.recording.remove(item.id)
                  onDeleted()
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
