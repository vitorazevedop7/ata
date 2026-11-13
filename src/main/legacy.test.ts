import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adoptLegacyDir } from './legacy'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ata-legacy-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('adoptLegacyDir', () => {
  it('moves the old folder to the new name with its contents', () => {
    const legacy = join(root, 'old')
    const dir = join(root, 'new')
    mkdirSync(legacy)
    writeFileSync(join(legacy, 'meta.json'), '{}')

    expect(adoptLegacyDir(dir, legacy)).toBe(dir)
    expect(readFileSync(join(dir, 'meta.json'), 'utf8')).toBe('{}')
    expect(existsSync(legacy)).toBe(false)
  })

  it('leaves both alone when the new folder already exists', () => {
    const legacy = join(root, 'old')
    const dir = join(root, 'new')
    mkdirSync(legacy)
    mkdirSync(dir)

    expect(adoptLegacyDir(dir, legacy)).toBe(dir)
    expect(existsSync(legacy)).toBe(true)
  })

  it('returns the new folder on a fresh install', () => {
    const dir = join(root, 'new')
    expect(adoptLegacyDir(dir, join(root, 'old'))).toBe(dir)
  })
})
