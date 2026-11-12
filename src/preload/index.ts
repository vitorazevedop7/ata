import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Channel, RecordingApi, TranscriptionApi, TranscriptionStatus } from '../shared/types'

const recording: RecordingApi = {
  start: () => ipcRenderer.invoke('recording:start'),
  appendChunk: (id: string, channel: Channel, data: ArrayBuffer) =>
    ipcRenderer.invoke('recording:chunk', id, channel, data),
  stop: (id: string) => ipcRenderer.invoke('recording:stop', id),
  list: () => ipcRenderer.invoke('recordings:list'),
  openFolder: (id?: string) => ipcRenderer.invoke('recordings:open-folder', id)
}

const transcription: TranscriptionApi = {
  start: (id: string) => ipcRenderer.invoke('transcription:start', id),
  get: (id: string) => ipcRenderer.invoke('transcription:get', id),
  statuses: () => ipcRenderer.invoke('transcription:statuses'),
  onStatus: (listener) => {
    const handler = (_event: IpcRendererEvent, status: TranscriptionStatus): void =>
      listener(status)
    ipcRenderer.on('transcription:status', handler)
    return () => ipcRenderer.removeListener('transcription:status', handler)
  }
}

contextBridge.exposeInMainWorld('api', { recording, transcription })
