import type { RecordingApi, TranscriptionApi } from '../shared/types'

declare global {
  interface Window {
    api: {
      recording: RecordingApi
      transcription: TranscriptionApi
    }
  }
}
