import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, JobKind, JobStatus, RecordingSummary } from '../../shared/types'
import { Progress, TranscribeMenu } from './components/controls'
import { WaveIcon } from './components/icons'
import { RecordingDetail } from './components/RecordingDetail'
import { describeJob, durationOf, formatClock, formatWhen } from './format'
import { type ActiveRecording, CaptureError, startRecording } from './recorder'

const jobKey = (id: string, kind: JobKind): string => `${kind}:${id}`

function Meter({ label, level }: { label: string; level: number }): React.JSX.Element {
  // RMS of speech sits around 0.01–0.2; scale so normal speech fills most of the bar.
  const fill = Math.min(1, Math.sqrt(level) * 2.2)
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <div className="meter-track">
        <div className="meter-fill" style={{ transform: `scaleX(${fill})` }} />
      </div>
    </div>
  )
}

function rowStatus(item: RecordingSummary, live: boolean, status?: JobStatus): string {
  if (!item.endedAt) return live ? 'Gravando agora' : 'Incompleta'
  if (status) return describeJob(status)
  if (item.hasSummary) return 'Resumida'
  if (item.hasTranscript) return 'Transcrita'
  return item.hasAudio ? 'Não transcrita' : 'Áudio apagado'
}

function App(): React.JSX.Element {
  const [active, setActive] = useState<ActiveRecording | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState<Record<Channel, number>>({ mic: 0, system: 0 })
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [statuses, setStatuses] = useState<Record<string, JobStatus>>({})
  const [revisions, setRevisions] = useState<Record<string, number>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'detail'>('list')
  const startedAt = useRef(0)

  const refresh = useCallback(async () => {
    setRecordings(await window.api.recording.list())
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([window.api.recording.list(), window.api.jobs.statuses()]).then(
      ([items, current]) => {
        if (cancelled) return
        setRecordings(items)
        setSelectedId((id) => id ?? items[0]?.id ?? null)
        setStatuses(Object.fromEntries(current.map((s) => [jobKey(s.id, s.kind), s])))
      }
    )
    const offStatus = window.api.jobs.onStatus((status) => {
      setStatuses((previous) => {
        const next = { ...previous }
        if (status.stage === 'done') delete next[jobKey(status.id, status.kind)]
        else next[jobKey(status.id, status.kind)] = status
        return next
      })
      if (status.stage === 'done' || status.stage === 'error') {
        setRevisions((previous) => ({ ...previous, [status.id]: (previous[status.id] ?? 0) + 1 }))
        void window.api.recording.list().then(setRecordings)
      }
    })
    const offChanged = window.api.recording.onChanged(() => {
      void window.api.recording.list().then(setRecordings)
    })
    return () => {
      cancelled = true
      offStatus()
      offChanged()
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
      setSelectedId(recording.id)
      await refresh()
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

  const select = (id: string): void => {
    setSelectedId(id)
    setView('detail')
  }

  const selected = recordings.find((item) => item.id === selectedId) ?? null

  return (
    <div className="shell">
      <header className="toolbar">
        <div className="brand">
          <WaveIcon className="brand-icon" />
          <span>Granola Local</span>
        </div>
        <div className="toolbar-actions">
          {active && (
            <span className="rec-clock" aria-live="off">
              <span className="rec-dot" aria-hidden />
              {formatClock(elapsed)}
            </span>
          )}
          <button
            className={`rec-button${active ? ' recording' : ''}`}
            onClick={active ? onStop : onStart}
            disabled={busy}
          >
            <span className="rec-glyph" aria-hidden />
            {active ? 'Parar' : 'Gravar'}
          </button>
        </div>
      </header>

      <div className={`live-panel${active ? ' open' : ''}`} aria-hidden={!active}>
        <div className="live-inner">
          <Meter label="Eu" level={levels.mic} />
          <Meter label="Outros" level={levels.system} />
          <p className="caption">Avise as outras pessoas de que a conversa está sendo gravada.</p>
        </div>
      </div>

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button className="btn plain" onClick={() => setError(null)}>
            Fechar
          </button>
        </div>
      )}

      <div className="split" data-view={view}>
        <aside className="library" aria-label="Gravações">
          <h1 className="library-title">Gravações</h1>
          {recordings.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Nenhuma gravação ainda</p>
              <p className="caption">
                Clique em Gravar durante uma reunião ou ligação. O microfone vira “Eu” e o som do
                computador vira “Outros”.
              </p>
            </div>
          ) : (
            <ul className="rows">
              {recordings.map((item) => {
                const status =
                  statuses[jobKey(item.id, 'transcribe')] ?? statuses[jobKey(item.id, 'summarize')]
                const working = status && status.stage !== 'error'
                const canTranscribe =
                  !item.hasTranscript && item.hasAudio && !!item.endedAt && !working
                return (
                  <li key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                    <button
                      className="row"
                      aria-current={item.id === selectedId}
                      onClick={() => select(item.id)}
                    >
                      <span className="row-title">{formatWhen(item.startedAt)}</span>
                      <span className={`row-sub${status?.stage === 'error' ? ' error' : ''}`}>
                        {durationOf(item) ?? '—'} ·{' '}
                        {rowStatus(item, active?.id === item.id, status)}
                      </span>
                      {working && (
                        <span className="row-progress">
                          <Progress label="" percent={status.percent} />
                        </span>
                      )}
                    </button>
                    {canTranscribe && item.id !== selectedId && (
                      <div className="row-action">
                        <TranscribeMenu
                          className="btn small"
                          onTranscribe={(deleteAudio) =>
                            void window.api.jobs.transcribe(item.id, { deleteAudio })
                          }
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <main className="detail">
          {selected ? (
            <RecordingDetail
              key={selected.id}
              item={selected}
              revision={revisions[selected.id] ?? 0}
              live={active?.id === selected.id}
              transcribeStatus={statuses[jobKey(selected.id, 'transcribe')]}
              summarizeStatus={statuses[jobKey(selected.id, 'summarize')]}
              onBack={() => setView('list')}
              onError={setError}
              onChanged={() => void refresh()}
            />
          ) : (
            <div className="empty center">
              <p className="empty-title">Selecione uma gravação</p>
              <p className="caption">A transcrição e o resumo aparecem aqui.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
