import { useCallback, useEffect, useState } from 'react'
import { IMPORT_EXTENSIONS, type ImportProgress } from '../../shared/types'

function hasFiles(event: DragEvent): boolean {
  return !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files')
}

/**
 * Importing audio or video files: the "Importar" button, dropping files on the
 * window, and the conversion progress. Calls onImported with the new ids.
 */
export function useImport({
  onImported,
  onError
}: {
  onImported: (ids: string[]) => void
  onError: (message: string) => void
}): {
  progress: ImportProgress | null
  dragging: boolean
  pick: () => void
} {
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => window.api.importer.onProgress(setProgress), [])

  const run = useCallback(
    async (paths?: string[]) => {
      try {
        const result = await window.api.importer.files(paths)
        if (result.ids.length) onImported(result.ids)
        if (result.errors.length) onError(result.errors.join('\n'))
      } catch (error) {
        onError(
          error instanceof Error
            ? error.message.replace(/^Error invoking.*?: (Error: )?/, '')
            : String(error)
        )
      }
    },
    [onImported, onError]
  )

  useEffect(() => {
    // Counts nested dragenter/dragleave pairs so the overlay doesn't flicker over children.
    let depth = 0
    const onEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth++
      setDragging(true)
    }
    const onOver = (event: DragEvent): void => {
      // Without this, Electron opens the dropped file in the window.
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = hasFiles(event) ? 'copy' : 'none'
    }
    const onLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      event.preventDefault()
      depth = 0
      setDragging(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      const accepted = files.filter((file) =>
        IMPORT_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() ?? '')
      )
      const rejected = files.length - accepted.length
      if (rejected > 0) {
        onError(
          `${rejected === 1 ? 'Um arquivo não foi importado' : `${rejected} arquivos não foram importados`}: ` +
            `use ${IMPORT_EXTENSIONS.join(', ')}.`
        )
      }
      const paths = accepted.map((file) => window.api.importer.pathOf(file)).filter(Boolean)
      if (paths.length) void run(paths)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [run, onError])

  return { progress, dragging, pick: () => void run() }
}
