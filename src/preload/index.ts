import { contextBridge, ipcRenderer } from 'electron'
import type { Channel, RecordingApi } from '../shared/types'

const recording: RecordingApi = {
  start: () => ipcRenderer.invoke('recording:start'),
  appendChunk: (id: string, channel: Channel, data: ArrayBuffer) =>
    ipcRenderer.invoke('recording:chunk', id, channel, data),
  stop: (id: string) => ipcRenderer.invoke('recording:stop', id),
  list: () => ipcRenderer.invoke('recordings:list'),
  openFolder: (id?: string) => ipcRenderer.invoke('recordings:open-folder', id)
}

contextBridge.exposeInMainWorld('api', { recording })
