import type { JobsApi, RecordingApi, ResultsApi } from '../shared/types'

declare global {
  interface Window {
    api: {
      recording: RecordingApi & {
        /** Fires when recordings change outside the UI (e.g. the 7-day cleanup). */
        onChanged(listener: () => void): () => void
      }
      jobs: JobsApi
      results: ResultsApi
      copyText(text: string): Promise<void>
    }
  }
}
