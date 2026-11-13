import { describe, expect, it } from 'vitest'
import { audioExpiresAt, type RecordingMeta } from './store'

const meta = (fields: Partial<RecordingMeta> = {}): RecordingMeta => ({
  id: '20261110-090000',
  startedAt: '2026-11-10T09:00:00.000Z',
  ...fields
})

describe('audioExpiresAt', () => {
  it('keeps recorded audio for 7 days after the recording started', () => {
    expect(audioExpiresAt(meta()).toISOString()).toBe('2026-11-17T09:00:00.000Z')
  })

  it('counts from the import for imported files, which may be old', () => {
    const imported = meta({
      source: 'import',
      startedAt: '2020-01-01T00:00:00.000Z',
      importedAt: '2026-11-12T15:30:00.000Z'
    })
    expect(audioExpiresAt(imported).toISOString()).toBe('2026-11-19T15:30:00.000Z')
  })
})
