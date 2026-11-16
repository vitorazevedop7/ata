import { describe, expect, it } from 'vitest'
import type { RecordingSummary } from '../shared/types'
import { isAudioExpired } from './retention'

const NOW = Date.parse('2026-11-20T12:00:00.000Z')

const item = (fields: Partial<RecordingSummary> = {}): RecordingSummary => ({
  id: '20261110-090000',
  startedAt: '2026-11-10T09:00:00.000Z',
  endedAt: '2026-11-10T09:47:00.000Z',
  bytes: { mic: 1, system: 1 },
  hasAudio: true,
  audioDeletedAt: null,
  audioExpiresAt: '2026-11-17T09:00:00.000Z',
  hasTranscript: true,
  hasSummary: true,
  importedFileName: null,
  title: null,
  titleIsCustom: false,
  ...fields
})

describe('isAudioExpired', () => {
  it('deletes transcribed audio once its time is up', () => {
    expect(isAudioExpired(item(), NOW)).toBe(true)
  })

  it('counts the exact expiry moment as expired', () => {
    expect(isAudioExpired(item({ audioExpiresAt: '2026-11-20T12:00:00.000Z' }), NOW)).toBe(true)
  })

  it('keeps audio that still has time left', () => {
    expect(isAudioExpired(item({ audioExpiresAt: '2026-11-21T09:00:00.000Z' }), NOW)).toBe(false)
  })

  it('never deletes audio that was not transcribed yet', () => {
    expect(isAudioExpired(item({ hasTranscript: false, audioExpiresAt: null }), NOW)).toBe(false)
  })

  it('never touches a recording that is still going', () => {
    expect(isAudioExpired(item({ endedAt: null }), NOW)).toBe(false)
  })

  it('skips recordings whose audio is already gone', () => {
    expect(isAudioExpired(item({ hasAudio: false }), NOW)).toBe(false)
  })
})
