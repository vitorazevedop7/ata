import type { RecordingApi } from '../shared/types'

declare global {
  interface Window {
    api: {
      recording: RecordingApi
    }
  }
}
