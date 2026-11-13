import { describe, expect, it } from 'vitest'
import type { RecordingSummary } from '../shared/types'
import { pendingJob } from './jobs'
import { isAudioExpired } from './retention'

const item = (fields: Partial<RecordingSummary> = {}): RecordingSummary => ({
  id: '20261110-090000',
  startedAt: '2026-11-10T09:00:00.000Z',
  endedAt: '2026-11-10T09:47:00.000Z',
  bytes: { mic: 1, system: 1 },
  hasAudio: true,
  audioDeletedAt: null,
  audioExpiresAt: null,
  hasTranscript: false,
  hasSummary: false,
  importedFileName: null,
  ...fields
})

describe('pendingJob', () => {
  it('transcribes a finished recording that has audio and no transcript', () => {
    expect(pendingJob(item())).toBe('transcribe')
  })

  it('summarizes a transcript that has no summary', () => {
    expect(pendingJob(item({ hasTranscript: true }))).toBe('summarize')
  })

  it('leaves alone recordings that are done, still running or without audio', () => {
    expect(pendingJob(item({ hasTranscript: true, hasSummary: true }))).toBeNull()
    expect(pendingJob(item({ endedAt: null }))).toBeNull()
    expect(
      pendingJob(item({ hasAudio: false, audioDeletedAt: '2026-11-17T09:00:00.000Z' }))
    ).toBeNull()
  })
})

describe('isAudioExpired', () => {
  const now = Date.parse('2026-11-20T00:00:00.000Z')

  it('never deletes audio that was not transcribed yet', () => {
    expect(isAudioExpired(item({ audioExpiresAt: null }), now)).toBe(false)
  })

  it('deletes transcribed audio once its time is up', () => {
    const transcribed = { hasTranscript: true, audioExpiresAt: '2026-11-17T09:00:00.000Z' }
    expect(isAudioExpired(item(transcribed), now)).toBe(true)
    expect(
      isAudioExpired(item({ ...transcribed, audioExpiresAt: '2026-11-21T00:00:00.000Z' }), now)
    ).toBe(false)
  })

  it('skips recordings that are still running or have no audio left', () => {
    const expired = { hasTranscript: true, audioExpiresAt: '2026-11-17T09:00:00.000Z' }
    expect(isAudioExpired(item({ ...expired, endedAt: null }), now)).toBe(false)
    expect(isAudioExpired(item({ ...expired, hasAudio: false }), now)).toBe(false)
  })
})
