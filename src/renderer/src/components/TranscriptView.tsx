import { useEffect, useRef } from 'react'
import type { Transcript } from '../../../shared/types'
import { SPEAKER, formatClock, languagesOf, speakerOf, transcriptToText } from '../format'
import { CopyButton } from './controls'

/** Silence that starts a new paragraph in a single-speaker transcript. */
const PAUSE_MS = 1500

/**
 * The conversation as a stenographer's pad: "Outros" on the left of the red
 * rule, "Eu" on the right. Consecutive lines from the same side form one turn.
 */
export function TranscriptView({
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
