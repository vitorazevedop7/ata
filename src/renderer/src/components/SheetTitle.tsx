import { useEffect, useRef, useState } from 'react'
import { MAX_TITLE, type RecordingSummary } from '../../../shared/types'
import { formatWhen } from '../format'
import { PencilIcon } from './icons'

/**
 * The page title: the meeting's name (or its date until it has one). Clicking it
 * turns it into a field; Enter or leaving the field saves, Esc cancels, and an
 * empty name brings back the one the summary suggested.
 */
export function SheetTitle({
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
    // An empty name goes back to the suggested one, which only the reload knows; it
    // also drops any earlier name, or that name would come back once the list
    // returns to the title it was saved over.
    setSaved(next ? { name: next, over: item.title } : null)
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
