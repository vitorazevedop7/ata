import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { recordingsDir } from './paths'
import {
  audioExpiresAt,
  claimId,
  newId,
  removeLeftoverWorkFiles,
  WORK_FILE,
  writeFileAtomic,
  type RecordingMeta
} from './store'

const DAY_MS = 24 * 60 * 60 * 1000

const meta = (fields: Partial<RecordingMeta> = {}): RecordingMeta => ({
  id: '20261110-090000',
  startedAt: '2026-11-10T09:00:00.000Z',
  ...fields
})

const temp = (): string => mkdtempSync(join(tmpdir(), 'ata-store-'))

describe('audioExpiresAt', () => {
  it('keeps audio that was never transcribed', () => {
    expect(audioExpiresAt(meta(), null)).toBeNull()
  })

  it('deletes transcribed audio 7 days after the recording started', () => {
    const transcribed = new Date('2026-11-10T10:00:00.000Z')
    expect(audioExpiresAt(meta(), transcribed)?.toISOString()).toBe('2026-11-17T09:00:00.000Z')
  })

  it('counts from the import for imported files, which may be old', () => {
    const imported = meta({
      source: 'import',
      startedAt: '2020-01-01T00:00:00.000Z',
      importedAt: '2026-11-12T15:30:00.000Z'
    })
    const transcribed = new Date('2026-11-12T16:00:00.000Z')
    expect(audioExpiresAt(imported, transcribed)?.toISOString()).toBe('2026-11-19T15:30:00.000Z')
  })

  it('gives a day after a late transcription before deleting the audio', () => {
    const transcribed = new Date('2026-11-30T12:00:00.000Z')
    expect(audioExpiresAt(meta(), transcribed)?.toISOString()).toBe('2026-12-01T12:00:00.000Z')
  })
})

describe('newId', () => {
  it('formats the local start time to the second', () => {
    expect(newId(new Date(2026, 10, 3, 9, 5, 7))).toBe('20261103-090507')
  })
})

describe('claimId', () => {
  it('creates the folder for the start time', async () => {
    const root = temp()
    const { id, startedAt } = await claimId(root, new Date(2026, 10, 13, 10, 11, 0, 750))
    expect(id).toBe('20261113-101100')
    expect(startedAt.getMilliseconds()).toBe(0)
    expect(existsSync(join(root, id))).toBe(true)
  })

  it('moves to the next free second instead of reusing a recording', async () => {
    const root = temp()
    mkdirSync(join(root, '20261113-101100'))
    mkdirSync(join(root, '20261113-101101'))
    const { id } = await claimId(root, new Date(2026, 10, 13, 10, 11, 0))
    expect(id).toBe('20261113-101102')
  })

  it('gives different ids to recordings started in the same second', async () => {
    const root = temp()
    const start = new Date(2026, 10, 13, 10, 11, 0)
    const ids = await Promise.all([
      claimId(root, start),
      claimId(root, start),
      claimId(root, start)
    ])
    expect(new Set(ids.map((claim) => claim.id)).size).toBe(3)
  })
})

describe('writeFileAtomic', () => {
  it('replaces the file and leaves no temporary file behind', async () => {
    const dir = temp()
    const path = join(dir, 'meta.json')
    writeFileSync(path, '{"old": true}')
    await writeFileAtomic(path, '{"new": true}')
    expect(readFileSync(path, 'utf8')).toBe('{"new": true}')
    expect(readdirSync(dir)).toEqual(['meta.json'])
  })
})

describe('removeLeftoverWorkFiles', () => {
  it('matches only the files jobs leave behind', () => {
    for (const name of [
      'mic.16k.wav',
      'system.whisper.json',
      'system.webm.part',
      'meta.json.12.tmp'
    ]) {
      expect(WORK_FILE.test(name)).toBe(true)
    }
    for (const name of ['mic.webm', 'system.webm', 'meta.json', 'transcript.json', 'chat.json']) {
      expect(WORK_FILE.test(name)).toBe(false)
    }
  })

  it('deletes old work files and keeps recent ones and the recording', async () => {
    const dir = join(recordingsDir(), '20261101-080000')
    mkdirSync(dir, { recursive: true })
    const old = new Date(Date.now() - 2 * DAY_MS)
    for (const name of ['mic.webm', 'meta.json', 'mic.16k.wav', 'mic.whisper.json']) {
      writeFileSync(join(dir, name), 'x')
      utimesSync(join(dir, name), old, old)
    }
    writeFileSync(join(dir, 'system.16k.wav'), 'still in use')

    expect(await removeLeftoverWorkFiles()).toBe(2)
    expect(readdirSync(dir).sort()).toEqual(['meta.json', 'mic.webm', 'system.16k.wav'])
  })
})
