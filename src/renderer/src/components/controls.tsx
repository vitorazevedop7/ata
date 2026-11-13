import { type ReactNode, useEffect, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon, CopyIcon, TrashIcon } from './icons'

/**
 * A button that opens a small panel anchored to it. The panel scales from the
 * trigger's corner, closes on Escape or a click outside, and stays mounted so
 * opening and closing can interrupt each other smoothly.
 */
export function Disclosure({
  label,
  className = 'btn',
  disabled,
  align = 'end',
  onOpen,
  children
}: {
  label: ReactNode
  className?: string
  disabled?: boolean
  align?: 'start' | 'end'
  /** Called each time the panel opens, e.g. to start it from its first step. */
  onOpen?: () => void
  children: (close: () => void) => ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="disclosure" ref={root}>
      <button
        className={className}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen(!open)
        }}
      >
        {label}
      </button>
      <div
        className={`popover popover-${align}${open ? ' open' : ''}`}
        aria-hidden={!open}
        inert={!open}
      >
        {children(() => setOpen(false))}
      </div>
    </div>
  )
}

export function TranscribeMenu({
  onTranscribe,
  className = 'btn primary',
  align = 'end'
}: {
  onTranscribe: (deleteAudio: boolean) => void
  className?: string
  align?: 'start' | 'end'
}): React.JSX.Element {
  return (
    <Disclosure
      label={
        <>
          Transcrever <ChevronDownIcon className="chevron" />
        </>
      }
      className={className}
      align={align}
    >
      {(close) => (
        <div className="menu" role="menu">
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => {
              close()
              onTranscribe(false)
            }}
          >
            <span className="menu-title">Transcrever</span>
            <span className="menu-hint">O áudio fica guardado por 7 dias.</span>
          </button>
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => {
              close()
              onTranscribe(true)
            }}
          >
            <span className="menu-title">Transcrever e apagar áudio</span>
            <span className="menu-hint">O áudio é apagado assim que o texto ficar pronto.</span>
          </button>
        </div>
      )}
    </Disclosure>
  )
}

type DeleteChoice = 'audio' | 'recording'

/**
 * "Apagar": a menu with "Só o áudio" and "A gravação inteira", each confirmed
 * before anything happens. With only one of them possible, it asks right away.
 */
export function DeleteMenu({
  canDeleteAudio,
  hasTranscript,
  onDeleteAudio,
  onDeleteRecording
}: {
  canDeleteAudio: boolean
  hasTranscript: boolean
  onDeleteAudio: () => Promise<void>
  onDeleteRecording: () => Promise<void>
}): React.JSX.Element {
  const only: DeleteChoice | null = canDeleteAudio ? null : 'recording'
  const [choice, setChoice] = useState<DeleteChoice | null>(only)

  return (
    <Disclosure
      className="btn plain danger"
      label={
        <>
          <TrashIcon /> Apagar
        </>
      }
      onOpen={() => setChoice(only)}
    >
      {(close) => {
        const confirm = async (action: () => Promise<void>): Promise<void> => {
          close()
          await action()
        }

        if (choice === null) {
          return (
            <div className="menu" role="menu">
              <button role="menuitem" className="menu-item" onClick={() => setChoice('audio')}>
                <span className="menu-title">Só o áudio</span>
                <span className="menu-hint">
                  {hasTranscript
                    ? 'A transcrição e o resumo continuam.'
                    : 'Sem o áudio, ela não vai mais poder ser transcrita.'}
                </span>
              </button>
              <button role="menuitem" className="menu-item" onClick={() => setChoice('recording')}>
                <span className="menu-title">A gravação inteira</span>
                <span className="menu-hint">Áudio, transcrição, resumo e perguntas.</span>
              </button>
            </div>
          )
        }

        return choice === 'audio' ? (
          <div className="confirm">
            <p className="confirm-title">Apagar o áudio desta gravação?</p>
            <p className="confirm-text">
              {hasTranscript
                ? 'A transcrição e o resumo continuam. Não dá para desfazer.'
                : 'Ela ainda não foi transcrita e, sem o áudio, não vai dar mais. Não dá para desfazer.'}
            </p>
            <div className="confirm-actions">
              <button className="btn" onClick={close}>
                Cancelar
              </button>
              <button className="btn destructive" onClick={() => void confirm(onDeleteAudio)}>
                Apagar áudio
              </button>
            </div>
          </div>
        ) : (
          <div className="confirm">
            <p className="confirm-title">Apagar esta gravação?</p>
            <p className="confirm-text">
              Áudio, transcrição, resumo e perguntas vão para a Lixeira. Dá para recuperar de lá.
            </p>
            <div className="confirm-actions">
              <button className="btn" onClick={close}>
                Cancelar
              </button>
              <button className="btn destructive" onClick={() => void confirm(onDeleteRecording)}>
                Apagar gravação
              </button>
            </div>
          </div>
        )
      }}
    </Disclosure>
  )
}

export function CopyButton({
  getText,
  label = 'Copiar',
  className = 'btn plain'
}: {
  getText: () => string
  label?: string
  className?: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button
      className={`${className}${copied ? ' done' : ''}`}
      onClick={async () => {
        await window.api.copyText(getText())
        setCopied(true)
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{copied ? 'Copiado' : label}</span>
    </button>
  )
}

export function Progress({
  label,
  percent
}: {
  label: string
  percent?: number
}): React.JSX.Element {
  return (
    <div className="progress" role="status">
      <span className="progress-label">{label}</span>
      <div className={`progress-track${percent === undefined ? ' indeterminate' : ''}`}>
        <div className="progress-fill" style={{ transform: `scaleX(${(percent ?? 0) / 100})` }} />
      </div>
    </div>
  )
}
