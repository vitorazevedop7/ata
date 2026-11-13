import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, JobKind, JobStatus, RecordingSummary, SearchHit } from '../../shared/types'
import { Progress, TranscribeMenu } from './components/controls'
import { BrandMark } from './components/icons'
import { DropOverlay, ImportButton, ImportStatus } from './components/ImportControl'
import { RecordingDetail } from './components/RecordingDetail'
import { SearchField, SearchResults } from './components/Search'
import { dayGroup, describeJob, formatClock, formatLength, formatRowTitle } from './format'
import { type ActiveRecording, CaptureError, startRecording } from './recorder'
import { useImport } from './useImport'

const jobKey = (id: string, kind: JobKind): string => `${kind}:${id}`

const canRecord = window.api.canRecord

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

type RowState = 'live' | 'working' | 'error' | 'summary' | 'transcript' | 'pending' | 'gone'

function rowState(
  item: RecordingSummary,
  live: boolean,
  status?: JobStatus
): { state: RowState; label: string } {
  if (!item.endedAt)
    return { state: live ? 'live' : 'error', label: live ? 'Gravando agora' : 'Incompleta' }
  const imported = item.importedFileName !== null
  if (status?.stage === 'error') return { state: 'error', label: describeJob(status, imported) }
  if (status) return { state: 'working', label: describeJob(status, imported) }
  if (item.hasSummary) return { state: 'summary', label: 'Resumida' }
  if (item.hasTranscript) return { state: 'transcript', label: 'Transcrita' }
  return item.hasAudio
    ? { state: 'pending', label: 'Não transcrita' }
    : { state: 'gone', label: 'Áudio apagado' }
}

/** Splits the (newest-first) list into consecutive day sections. */
function groupByDay(items: RecordingSummary[]): [string, RecordingSummary[]][] {
  const groups: [string, RecordingSummary[]][] = []
  for (const item of items) {
    const label = dayGroup(item.startedAt)
    const last = groups[groups.length - 1]
    if (last && last[0] === label) last[1].push(item)
    else groups.push([label, [item]])
  }
  return groups
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
  const [query, setQuery] = useState('')
  const [focusMs, setFocusMs] = useState<number | undefined>(undefined)
  const startedAt = useRef(0)
  const searching = query.trim() !== ''

  const refresh = useCallback(async () => {
    setRecordings(await window.api.recording.list())
  }, [])

  const onImported = useCallback(
    (ids: string[]) => {
      setSelectedId(ids[ids.length - 1])
      setView('detail')
      void refresh()
    },
    [refresh]
  )
  const imports = useImport({ onImported, onError: setError })

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
    setFocusMs(undefined)
    setView('detail')
  }

  /** After a recording goes to the trash, opens the next older one (or the newer one). */
  const onDeleted = (id: string): void => {
    const index = recordings.findIndex((item) => item.id === id)
    const next = recordings[index + 1] ?? recordings[index - 1] ?? null
    setSelectedId(next?.id ?? null)
    setFocusMs(undefined)
    if (!next) setView('list')
    void refresh()
  }

  /** Opens a search match; one from the transcript scrolls to where it was said. */
  const openHit = (hit: SearchHit): void => {
    setSelectedId(hit.id)
    setView('detail')
    if (hit.id === selectedId && hit.startMs !== undefined && hit.startMs === focusMs) {
      // Same spot again (the user scrolled away): clear and set it so it jumps again.
      setFocusMs(undefined)
      requestAnimationFrame(() => setFocusMs(hit.startMs))
    } else {
      setFocusMs(hit.startMs)
    }
  }

  const showLibrary = useCallback(() => setView('list'), [])

  const selected = recordings.find((item) => item.id === selectedId) ?? null

  return (
    <div className="shell" data-view={view}>
      <aside className="cover" aria-label="Gravações">
        <header className="cover-head">
          <BrandMark className="brand-mark" />
          <span className="brand-name">Ata</span>
          <ImportButton busy={imports.progress !== null} onClick={imports.pick} />
        </header>
        {imports.progress && <ImportStatus progress={imports.progress} />}

        <section className={`recorder${active ? ' live' : ''}`} aria-label="Gravação">
          <div className="recorder-live" aria-hidden={!active} inert={!active}>
            <div className="recorder-live-inner">
              <p className="recorder-clock" aria-live="off">
                <span className="rec-dot" aria-hidden />
                {formatClock(elapsed)}
              </p>
              <Meter label="Eu" level={levels.mic} />
              <Meter label="Outros" level={levels.system} />
              <p className="recorder-note">
                Avise as outras pessoas de que a conversa está sendo gravada.
              </p>
            </div>
          </div>
          <button
            className={`rec-button${active ? ' recording' : ''}`}
            onClick={active ? onStop : onStart}
            disabled={busy || !canRecord}
            aria-describedby={canRecord ? undefined : 'record-unavailable'}
          >
            <span className="rec-glyph" aria-hidden />
            {active ? 'Parar gravação' : 'Gravar'}
          </button>
          {!canRecord && (
            <p id="record-unavailable" className="recorder-unavailable">
              Gravar o som do computador só funciona no Windows por enquanto. Aqui, use Importar
              para transcrever um arquivo.
            </p>
          )}
        </section>

        <SearchField value={query} onChange={setQuery} onReveal={showLibrary} />
        {searching && (
          <SearchResults
            query={query}
            recordings={recordings}
            selectedId={selectedId}
            onOpen={openHit}
          />
        )}

        <nav className="library" hidden={searching}>
          {recordings.length === 0 ? (
            <div className="library-empty">
              <p className="library-empty-title">Nenhuma gravação ainda</p>
              {canRecord ? (
                <>
                  <p>
                    Clique em Gravar durante uma reunião ou ligação. O microfone vira “Eu” e o som
                    do computador vira “Outros”.
                  </p>
                  <p>
                    Para uma conversa gravada em outro lugar, use Importar ou solte o arquivo aqui.
                  </p>
                </>
              ) : (
                <p>Use Importar ou solte aqui um arquivo de áudio ou vídeo para transcrevê-lo.</p>
              )}
            </div>
          ) : (
            groupByDay(recordings).map(([label, items]) => (
              <section key={label} className="day">
                <h2 className="day-label">{label}</h2>
                <ul className="rows">
                  {items.map((item) => {
                    const status =
                      statuses[jobKey(item.id, 'transcribe')] ??
                      statuses[jobKey(item.id, 'summarize')]
                    const working = status && status.stage !== 'error'
                    const { state, label: stateLabel } = rowState(
                      item,
                      active?.id === item.id,
                      status
                    )
                    const canTranscribe =
                      !item.hasTranscript && item.hasAudio && !!item.endedAt && !working
                    const isSelected = item.id === selectedId
                    return (
                      <li key={item.id} className={isSelected ? 'selected' : undefined}>
                        <button
                          className="row"
                          aria-current={isSelected}
                          onClick={() => select(item.id)}
                        >
                          <span className="row-line">
                            <span className="row-title">
                              {item.title ?? formatRowTitle(item.startedAt)}
                            </span>
                            <span className="row-length">{formatLength(item) ?? ''}</span>
                          </span>
                          {item.title && (
                            <span className="row-when">{formatRowTitle(item.startedAt)}</span>
                          )}
                          {item.importedFileName && (
                            <span className="row-file" title={item.importedFileName}>
                              {item.importedFileName}
                            </span>
                          )}
                          <span className="row-state" data-state={state}>
                            <span className="state-mark" aria-hidden />
                            {stateLabel}
                          </span>
                          {working && (
                            <span className="row-progress">
                              <Progress label="" percent={status.percent} />
                            </span>
                          )}
                        </button>
                        {canTranscribe && !isSelected && (
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
              </section>
            ))
          )}
        </nav>
      </aside>

      <main className="page">
        {error && (
          <div className="banner" role="alert">
            <span>{error}</span>
            <button className="btn plain" onClick={() => setError(null)}>
              Fechar
            </button>
          </div>
        )}
        {selected ? (
          <RecordingDetail
            key={selected.id}
            item={selected}
            revision={revisions[selected.id] ?? 0}
            live={active?.id === selected.id}
            transcribeStatus={statuses[jobKey(selected.id, 'transcribe')]}
            summarizeStatus={statuses[jobKey(selected.id, 'summarize')]}
            askStatus={statuses[jobKey(selected.id, 'ask')]}
            onBack={() => setView('list')}
            onError={setError}
            onChanged={() => void refresh()}
            onDeleted={() => onDeleted(selected.id)}
            focusMs={focusMs}
          />
        ) : (
          <div className="page-empty">
            <svg className="page-empty-art" viewBox="0 0 120 80" aria-hidden>
              <path d="M60 6v68" stroke="var(--rule-red)" strokeWidth="1.5" />
              <path
                d="M14 18h36M22 28h28M18 38h32M70 48h34M70 58h24M70 68h30"
                stroke="var(--ink-3)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <p className="page-empty-title">
              {recordings.length ? 'Selecione uma gravação' : 'Suas reuniões viram texto aqui'}
            </p>
            <p className="page-empty-text">
              De um lado da linha fica o que os outros disseram, do outro o que você disse. Depois,
              um resumo com decisões e tarefas. Tudo no seu computador.
            </p>
          </div>
        )}
      </main>
      <DropOverlay visible={imports.dragging} />
    </div>
  )
}

export default App
