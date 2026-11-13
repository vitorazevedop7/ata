import type { ImportApi, JobsApi, RecordingApi, ResultsApi, SearchApi } from '../shared/types'

declare global {
  interface Window {
    api: {
      recording: RecordingApi & {
        /** Fires when recordings change outside the UI (e.g. the 7-day cleanup). */
        onChanged(listener: () => void): () => void
      }
      importer: ImportApi
      jobs: JobsApi
      results: ResultsApi
      search: SearchApi
      copyText(text: string): Promise<void>
      /** False where the system audio cannot be captured (everywhere but Windows). */
      canRecord: boolean
    }
  }
}
