import { IMPORT_EXTENSIONS, type ImportProgress } from '../../../shared/types'
import { Progress } from './controls'
import { ImportIcon } from './icons'

function describe(progress: ImportProgress): string {
  const count = progress.total > 1 ? ` (${progress.index + 1} de ${progress.total})` : ''
  return `Convertendo ${progress.fileName}${count}`
}

export function ImportButton({
  busy,
  onClick
}: {
  busy: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className="import-button"
      onClick={onClick}
      disabled={busy}
      title="Importar arquivo de áudio ou vídeo"
    >
      <ImportIcon /> Importar
    </button>
  )
}

export function ImportStatus({ progress }: { progress: ImportProgress }): React.JSX.Element {
  return (
    <div className="import-status">
      <Progress label={describe(progress)} percent={progress.percent} />
    </div>
  )
}

export function DropOverlay({ visible }: { visible: boolean }): React.JSX.Element {
  return (
    <div className={`drop-overlay${visible ? ' visible' : ''}`} aria-hidden>
      <div className="drop-target">
        <ImportIcon className="drop-icon" />
        <p className="drop-title">Solte para importar</p>
        <p className="drop-text">Áudio ou vídeo: {IMPORT_EXTENSIONS.join(', ')}</p>
      </div>
    </div>
  )
}
