import { useEffect, useRef, useState } from 'react'
import type { RecordingSummary, SearchHit } from '../../../shared/types'
import { SPEAKER, formatClock, formatWhen } from '../format'

/** Long enough to skip the keystrokes of a word being typed, short enough to feel immediate. */
const DEBOUNCE_MS = 150

const hitKey = (hit: SearchHit): string =>
  `${hit.id}|${hit.source}|${hit.startMs ?? ''}|${hit.snippet}`

/** Search box at the top of the library. Ctrl+F focuses it; Esc clears it. */
export function SearchField({
  value,
  onChange,
  onReveal
}: {
  value: string
  onChange: (value: string) => void
  /** Called before focusing from the keyboard, to show the library in a narrow window. */
  onReveal: () => void
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        onReveal()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onReveal])

  return (
    <div className="search" role="search">
      <svg className="search-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <circle cx="7" cy="7" r="4.25" />
        <path d="M10.25 10.25L13.5 13.5" />
      </svg>
      <input
        ref={input}
        className="search-input"
        type="search"
        placeholder="Buscar nas reuniões"
        aria-label="Buscar nas transcrições e resumos"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          if (value) onChange('')
          else input.current?.blur()
        }}
      />
      {value && (
        <button
          className="search-clear"
          aria-label="Limpar busca"
          title="Limpar busca (Esc)"
          onClick={() => {
            onChange('')
            input.current?.focus()
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      )}
    </div>
  )
}

function Snippet({ hit }: { hit: SearchHit }): React.JSX.Element {
  const [start, end] = hit.match
  return (
    <span className="hit-text">
      {hit.snippet.slice(0, start)}
      <mark>{hit.snippet.slice(start, end)}</mark>
      {hit.snippet.slice(end)}
    </span>
  )
}

/** Matches grouped by recording, newest first; replaces the library while there is a query. */
export function SearchResults({
  query,
  recordings,
  selectedId,
  onOpen
}: {
  query: string
  /** Also reruns the search when recordings change (a transcript finished, say). */
  recordings: RecordingSummary[]
  selectedId: string | null
  onOpen: (hit: SearchHit) => void
}): React.JSX.Element {
  const [results, setResults] = useState<{ query: string; hits: SearchHit[] } | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  useEffect(() => {
    const text = query.trim()
    let cancelled = false
    const timer = setTimeout(() => {
      void window.api.search.query(text).then((hits) => {
        if (!cancelled) setResults({ query: text, hits })
      })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, recordings])

  // While typing, the previous results stay until the new ones arrive; only
  // the very first search shows an empty list for an instant.
  if (!results) return <nav className="library" aria-label="Resultados da busca" />

  const byId = new Map(recordings.map((item) => [item.id, item]))
  const groups: [RecordingSummary, SearchHit[]][] = []
  for (const hit of results.hits) {
    const recording = byId.get(hit.id)
    if (!recording) continue
    const last = groups[groups.length - 1]
    if (last && last[0].id === hit.id) last[1].push(hit)
    else groups.push([recording, [hit]])
  }
  const count = groups.reduce((total, [, hits]) => total + hits.length, 0)

  return (
    <nav className="library" aria-label="Resultados da busca">
      <p className="results-count" role="status">
        {count === 0
          ? ''
          : `${count} ${count === 1 ? 'trecho' : 'trechos'} em ${groups.length} ${
              groups.length === 1 ? 'gravação' : 'gravações'
            }`}
      </p>
      {count === 0 ? (
        <div className="library-empty">
          <p className="library-empty-title">Nada encontrado</p>
          <p>Nenhuma transcrição ou resumo menciona “{results.query}”.</p>
        </div>
      ) : (
        groups.map(([recording, hits]) => (
          <section key={recording.id} className="day">
            <h2 className="day-label">{formatWhen(recording.startedAt)}</h2>
            <ul className="rows">
              {hits.map((hit) => {
                const key = hitKey(hit)
                const isSelected = key === activeKey && hit.id === selectedId
                return (
                  <li key={key} className={isSelected ? 'selected' : undefined}>
                    <button
                      className="row hit"
                      aria-current={isSelected}
                      onClick={() => {
                        setActiveKey(key)
                        onOpen(hit)
                      }}
                    >
                      <span className="hit-where">
                        {hit.startMs === undefined
                          ? 'Resumo'
                          : `${formatClock(hit.startMs / 1000)}${
                              hit.channel ? ` · ${SPEAKER[hit.channel]}` : ''
                            }`}
                      </span>
                      <Snippet hit={hit} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </nav>
  )
}
