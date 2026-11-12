import { useEffect, useState } from 'react'
import type { JobStatus, RecordingSummary, Summary, Transcript } from '../../../shared/types'
import {
  SPEAKER,
  audioNote,
  describeJob,
  durationOf,
  formatClock,
  formatWhen,
  languagesOf,
  summaryToText,
  transcriptToText
} from '../format'
import { CopyButton, DeleteAudioButton, Progress, TranscribeMenu } from './controls'
import { ChevronLeftIcon, FolderIcon, SparkleIcon } from './icons'

function SummaryCard({ summary }: { summary: Summary }): React.JSX.Element {
  const list = (title: string, items: string[]): React.JSX.Element | null =>
    items.length ? (
      <section className="summary-section">
        <h4>{title}</h4>
        <ul>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </section>
    ) : null

  return (
    <article className="card">
      <header className="card-head">
        <h3>Resumo</h3>
        <CopyButton getText={() => summaryToText(summary)} label="Copiar resumo" />
      </header>
      <p className="overview">{summary.overview}</p>
      {list('Pontos principais', summary.keyPoints)}
      {list('Decisões', summary.decisions)}
      {summary.actionItems.length > 0 && (
        <section className="summary-section">
          <h4>Tarefas</h4>
          <ul>
            {summary.actionItems.map((item, index) => (
              <li key={index}>
                {item.task}
                {item.owner && <span className="chip">{item.owner}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {list('Pendências', summary.openQuestions)}
      <p className="caption footnote">
        Gerado no seu computador com {summary.model}. Pode conter erros; confira na transcrição.
      </p>
    </article>
  )
}

function TranscriptCard({ transcript }: { transcript: Transcript }): React.JSX.Element {
  return (
    <article className="card">
      <header className="card-head">
        <div>
          <h3>Transcrição</h3>
          <p className="caption">{languagesOf(transcript)}</p>
        </div>
      </header>
      {transcript.segments.length === 0 ? (
        <p className="caption">Nenhuma fala foi detectada nesta gravação.</p>
      ) : (
        <ol className="segments">
          {transcript.segments.map((segment, index) => {
            const previous = transcript.segments[index - 1]
            const speakerChanged = !previous || previous.channel !== segment.channel
            return (
              <li
                key={index}
                className={`segment ${segment.channel}${speakerChanged ? ' turn' : ''}`}
              >
                <span className="segment-time">{formatClock(segment.startMs / 1000)}</span>
                <span className="segment-speaker">
                  {speakerChanged ? SPEAKER[segment.channel] : ''}
                </span>
                <span className="segment-text">{segment.text}</span>
              </li>
            )
          })}
        </ol>
      )}
    </article>
  )
}

export function RecordingDetail({
  item,
  revision,
  live,
  transcribeStatus,
  summarizeStatus,
  onBack,
  onError,
  onChanged
}: {
  item: RecordingSummary
  /** Bumped whenever a job for this recording finishes, to reload results. */
  revision: number
  /** True while this recording is still being captured. */
  live: boolean
  transcribeStatus?: JobStatus
  summarizeStatus?: JobStatus
  onBack: () => void
  onError: (message: string) => void
  /** Called after an action here changes the recording on disk. */
  onChanged: () => void
}): React.JSX.Element {
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)

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
  const duration = durationOf(item)

  const transcribe = (deleteAudio: boolean): void =>
    void window.api.jobs.transcribe(item.id, { deleteAudio })

  return (
    <div className="detail-inner">
      <button className="btn plain back" onClick={onBack}>
        <ChevronLeftIcon /> Gravações
      </button>

      <header className="detail-head">
        <h2 className="detail-title">{formatWhen(item.startedAt, true)}</h2>
        <p className="detail-meta">
          {duration ?? (live ? 'Gravando agora' : 'Gravação incompleta')} · {audioNote(item)}
        </p>
      </header>

      <div className="detail-actions">
        {item.hasTranscript ? (
          <>
            <button
              className={summary ? 'btn' : 'btn primary'}
              disabled={summarizing || transcribing}
              onClick={() => void window.api.jobs.summarize(item.id)}
            >
              <SparkleIcon /> {summary ? 'Refazer resumo' : 'Resumir'}
            </button>
            {transcript && (
              <CopyButton
                className="btn"
                getText={() => transcriptToText(transcript)}
                label="Copiar transcrição"
              />
            )}
          </>
        ) : transcribing ? null : item.hasAudio && item.endedAt ? (
          <TranscribeMenu onTranscribe={transcribe} align="start" />
        ) : null}

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
        <button
          className="btn plain icon"
          title="Abrir a pasta da gravação"
          aria-label="Abrir a pasta da gravação"
          onClick={() => void window.api.recording.openFolder(item.id)}
        >
          <FolderIcon />
        </button>
      </div>

      {transcribing && (
        <div className="card status-card">
          <Progress label={describeJob(transcribeStatus)} percent={transcribeStatus.percent} />
          <p className="caption">Roda no seu computador. O áudio não sai daqui.</p>
        </div>
      )}
      {transcribeStatus?.stage === 'error' && (
        <div className="card notice-card error" role="alert">
          <p className="notice-title">{describeJob(transcribeStatus)}</p>
          <p className="caption mono">{transcribeStatus.error}</p>
        </div>
      )}
      {!item.hasTranscript &&
        !transcribing &&
        item.hasAudio &&
        item.endedAt &&
        transcribeStatus?.stage !== 'error' && (
          <div className="card notice-card">
            <p className="notice-title">Ainda não transcrita</p>
            <p className="caption">
              Clique em Transcrever para ver o texto da conversa e depois gerar um resumo. Tudo roda
              no seu computador.
            </p>
          </div>
        )}
      {!item.hasTranscript && !transcribing && !item.hasAudio && item.endedAt && (
        <div className="card notice-card">
          <p className="notice-title">Sem transcrição</p>
          <p className="caption">O áudio desta gravação foi apagado antes de ser transcrito.</p>
        </div>
      )}

      {summarizing && (
        <div className="card status-card">
          <Progress label={describeJob(summarizeStatus)} percent={summarizeStatus.percent} />
          <p className="caption">
            O resumo é gerado no seu computador e pode levar alguns minutos.
          </p>
        </div>
      )}
      {summarizeStatus?.stage === 'error' && (
        <div className="card notice-card error" role="alert">
          <p className="notice-title">{describeJob(summarizeStatus)}</p>
          <p className="caption mono">{summarizeStatus.error}</p>
        </div>
      )}

      {summary && <SummaryCard summary={summary} />}
      {transcript && <TranscriptCard transcript={transcript} />}
    </div>
  )
}
