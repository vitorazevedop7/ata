import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, RecordingSummary, Transcript, TranscriptionStatus } from '../../shared/types'
import { type ActiveRecording, CaptureError, startRecording } from './recorder'

const CHANNEL_LABEL: Record<Channel, string> = { mic: 'Eu (microfone)', system: 'Outros (sistema)' }
const SPEAKER: Record<Channel, string> = { mic: 'Eu', system: 'Outros' }
const CHANNEL_NAME: Record<Channel, string> = { mic: 'microfone', system: 'sistema' }

function formatClock(seconds: number): string {
  const s = Math.floor(seconds)
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function durationOf(item: RecordingSummary): string {
  if (!item.endedAt) return 'incompleta'
  return formatClock((Date.parse(item.endedAt) - Date.parse(item.startedAt)) / 1000)
}

function describe(status: TranscriptionStatus): string {
  const channel = status.channel ? ` (${CHANNEL_NAME[status.channel]})` : ''
  switch (status.stage) {
    case 'queued':
      return 'Na fila para transcrever'
    case 'converting':
      return `Preparando áudio${channel}`
    case 'transcribing':
      return `Transcrevendo${channel} ${status.percent ?? 0}%`
    case 'error':
      return 'Erro na transcrição'
    default:
      return ''
  }
}

function Meter({ label, level }: { label: string; level: number }): React.JSX.Element {
  // RMS of speech sits around 0.01–0.2; scale so normal speech fills most of the bar.
  const percent = Math.min(100, Math.sqrt(level) * 220)
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function TranscriptView({
  item,
  transcript,
  onClose
}: {
  item: RecordingSummary
  transcript: Transcript
  onClose: () => void
}): React.JSX.Element {
  const languages = Object.entries(transcript.languages)
    .map(([channel, lang]) => `${SPEAKER[channel as Channel]}: ${lang}`)
    .join(' · ')
  return (
    <section className="transcript">
      <div className="history-header">
        <div>
          <h2>Transcrição</h2>
          <p className="transcript-meta">
            {new Date(item.startedAt).toLocaleString('pt-BR')}
            {languages && ` · idioma ${languages}`}
          </p>
        </div>
        <button className="link" onClick={onClose}>
          Fechar
        </button>
      </div>
      {transcript.segments.length === 0 ? (
        <p className="empty">Nenhuma fala detectada.</p>
      ) : (
        <ol className="segments">
          {transcript.segments.map((segment, index) => (
            <li key={index} className={`segment ${segment.channel}`}>
              <span className="segment-time">{formatClock(segment.startMs / 1000)}</span>
              <span className="segment-speaker">{SPEAKER[segment.channel]}</span>
              <span className="segment-text">{segment.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function App(): React.JSX.Element {
  const [active, setActive] = useState<ActiveRecording | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState<Record<Channel, number>>({ mic: 0, system: 0 })
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [statuses, setStatuses] = useState<Record<string, TranscriptionStatus>>({})
  const [selected, setSelected] = useState<{ id: string; transcript: Transcript } | null>(null)
  const startedAt = useRef(0)

  const refresh = useCallback(async () => {
    setRecordings(await window.api.recording.list())
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([window.api.recording.list(), window.api.transcription.statuses()]).then(
      ([items, current]) => {
        if (cancelled) return
        setRecordings(items)
        setStatuses(Object.fromEntries(current.map((status) => [status.id, status])))
      }
    )
    const unsubscribe = window.api.transcription.onStatus((status) => {
      setStatuses((previous) => {
        const next = { ...previous }
        if (status.stage === 'done') delete next[status.id]
        else next[status.id] = status
        return next
      })
      if (status.stage === 'done') {
        void window.api.recording.list().then(setRecordings)
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!active) return
    let frame = 0
    const tick = (): void => {
      setLevels(active.levels())
      setElapsed((performance.now() - startedAt.current) / 1000)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])

  const onStart = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const recording = await startRecording()
      startedAt.current = performance.now()
      setElapsed(0)
      setActive(recording)
    } catch (err) {
      setError(err instanceof CaptureError ? err.message : `Erro ao iniciar: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const onStop = async (): Promise<void> => {
    if (!active) return
    setBusy(true)
    try {
      await active.stop()
    } catch (err) {
      setError(`Erro ao finalizar: ${String(err)}`)
    } finally {
      setActive(null)
      setLevels({ mic: 0, system: 0 })
      setBusy(false)
      await refresh()
    }
  }

  const onView = async (id: string): Promise<void> => {
    const transcript = await window.api.transcription.get(id)
    if (transcript) setSelected({ id, transcript })
  }

  const selectedItem = selected && recordings.find((item) => item.id === selected.id)

  return (
    <main className="app">
      <header>
        <h1>Granola Local</h1>
        <p className="subtitle">Grava o microfone e o áudio do sistema em canais separados.</p>
      </header>

      <section className="recorder">
        <div className="controls">
          {active ? (
            <button className="stop" onClick={onStop} disabled={busy}>
              Parar
            </button>
          ) : (
            <button className="record" onClick={onStart} disabled={busy}>
              Gravar
            </button>
          )}
          <span className={`clock${active ? ' live' : ''}`}>{formatClock(elapsed)}</span>
        </div>
        <Meter label={CHANNEL_LABEL.mic} level={levels.mic} />
        <Meter label={CHANNEL_LABEL.system} level={levels.system} />
        {active && (
          <p className="notice">
            Avise os outros participantes de que a conversa está sendo gravada.
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="history">
        <div className="history-header">
          <h2>Gravações</h2>
          <button className="link" onClick={() => window.api.recording.openFolder()}>
            Abrir pasta
          </button>
        </div>
        {recordings.length === 0 ? (
          <p className="empty">Nenhuma gravação ainda.</p>
        ) : (
          <ul className="recordings">
            {recordings.map((item) => {
              const status = statuses[item.id]
              const working = status && status.stage !== 'error'
              return (
                <li key={item.id}>
                  <div className="recording-main">
                    <span className="when">{new Date(item.startedAt).toLocaleString('pt-BR')}</span>
                    <span className="recording-meta">
                      mic {formatBytes(item.bytes.mic)} · sistema {formatBytes(item.bytes.system)}
                      {status && (
                        <span
                          className={`status ${status.stage}`}
                          title={status.error ?? undefined}
                        >
                          {' · '}
                          {describe(status)}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="duration">{durationOf(item)}</span>
                  <div className="actions">
                    {item.hasTranscript && !working && (
                      <button className="link" onClick={() => onView(item.id)}>
                        Ver transcrição
                      </button>
                    )}
                    {!item.hasTranscript && !working && (
                      <button
                        className="link"
                        onClick={() => window.api.transcription.start(item.id)}
                        disabled={!item.endedAt}
                      >
                        {status?.stage === 'error' ? 'Tentar de novo' : 'Transcrever'}
                      </button>
                    )}
                    <button
                      className="link muted"
                      onClick={() => window.api.recording.openFolder(item.id)}
                    >
                      Pasta
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selected && selectedItem && (
        <TranscriptView
          item={selectedItem}
          transcript={selected.transcript}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  )
}

export default App
