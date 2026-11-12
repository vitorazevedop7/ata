import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  Channel,
  JobStatus,
  JobsApi,
  RecordingApi,
  ResultsApi,
  SearchApi,
  TranscribeOptions
} from '../shared/types'

const recording: RecordingApi & { onChanged(listener: () => void): () => void } = {
  start: () => ipcRenderer.invoke('recording:start'),
  appendChunk: (id: string, channel: Channel, data: ArrayBuffer) =>
    ipcRenderer.invoke('recording:chunk', id, channel, data),
  stop: (id: string) => ipcRenderer.invoke('recording:stop', id),
  list: () => ipcRenderer.invoke('recordings:list'),
  deleteAudio: (id: string) => ipcRenderer.invoke('recording:delete-audio', id),
  openFolder: (id?: string) => ipcRenderer.invoke('recordings:open-folder', id),
  onChanged: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on('recordings:changed', handler)
    return () => ipcRenderer.removeListener('recordings:changed', handler)
  }
}

const jobs: JobsApi = {
  transcribe: (id: string, options: TranscribeOptions) =>
    ipcRenderer.invoke('jobs:transcribe', id, options),
  summarize: (id: string) => ipcRenderer.invoke('jobs:summarize', id),
  statuses: () => ipcRenderer.invoke('jobs:statuses'),
  onStatus: (listener) => {
    const handler = (_event: IpcRendererEvent, status: JobStatus): void => listener(status)
    ipcRenderer.on('jobs:status', handler)
    return () => ipcRenderer.removeListener('jobs:status', handler)
  }
}

const results: ResultsApi = {
  transcript: (id: string) => ipcRenderer.invoke('results:transcript', id),
  summary: (id: string) => ipcRenderer.invoke('results:summary', id)
}

const search: SearchApi = {
  query: (text: string) => ipcRenderer.invoke('search:query', text)
}

const copyText = (text: string): Promise<void> => ipcRenderer.invoke('app:copy', text)

contextBridge.exposeInMainWorld('api', { recording, jobs, results, search, copyText })
