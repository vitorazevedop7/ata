export type Channel = 'mic' | 'system'

export interface RecordingSummary {
  id: string
  startedAt: string
  endedAt: string | null
  bytes: Record<Channel, number>
}

export interface RecordingApi {
  start(): Promise<string>
  appendChunk(id: string, channel: Channel, data: ArrayBuffer): Promise<void>
  stop(id: string): Promise<RecordingSummary | null>
  list(): Promise<RecordingSummary[]>
  openFolder(id?: string): Promise<void>
}
