import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, RecordingSummary } from '../../shared/types'
import { type ActiveRecording, CaptureError, startRecording } from './recorder'

const CHANNEL_LABEL: Record<Channel, string> = { mic: 'Eu (microfone)', system: 'Outros (sistema)' }

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

function App(): React.JSX.Element {
  const [active, setActive] = useState<ActiveRecording | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState<Record<Channel, number>>({ mic: 0, system: 0 })
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const startedAt = useRef(0)

  const refresh = useCallback(async () => {
    setRecordings(await window.api.recording.list())
  }, [])

  useEffect(() => {
    let cancelled = false
    window.api.recording.list().then((items) => {
      if (!cancelled) setRecordings(items)
    })
    return () => {
      cancelled = true
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
          <ul>
            {recordings.map((item) => (
              <li key={item.id}>
                <span className="when">{new Date(item.startedAt).toLocaleString('pt-BR')}</span>
                <span className="duration">{durationOf(item)}</span>
                <span className="sizes">
                  mic {formatBytes(item.bytes.mic)} · sistema {formatBytes(item.bytes.system)}
                </span>
                <button className="link" onClick={() => window.api.recording.openFolder(item.id)}>
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
