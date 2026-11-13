import { describe, expect, it } from 'vitest'
import { toolLocations } from './tools'

describe('toolLocations', () => {
  it('uses the folders of the setup script on Windows, GPU build first', () => {
    const where = toolLocations(
      'win32',
      { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' },
      'C:\\Users\\ana\\AppData\\Roaming'
    )
    expect(where.ffmpeg).toEqual([
      'C:\\Users\\ana\\AppData\\Local\\Programs\\ffmpeg\\bin\\ffmpeg.exe'
    ])
    expect(where.whisperCli).toEqual([
      'C:\\Users\\ana\\AppData\\Local\\Programs\\whisper-cuda\\Release\\whisper-cli.exe',
      'C:\\Users\\ana\\AppData\\Local\\Programs\\whisper-cpu\\Release\\whisper-cli.exe'
    ])
    expect(where.ollama).toEqual(['C:\\Users\\ana\\AppData\\Local\\Programs\\ollama\\ollama.exe'])
    expect(where.dataRoot).toBe('C:\\Users\\ana\\AppData\\Local')
  })

  it('falls back to the Local folder next to Roaming when LOCALAPPDATA is missing', () => {
    const where = toolLocations('win32', {}, 'C:\\Users\\ana\\AppData\\Roaming')
    expect(where.dataRoot).toBe('C:\\Users\\ana\\AppData\\Local')
  })

  it('looks in the Homebrew folders and the Ollama app on macOS', () => {
    const appData = '/Users/ana/Library/Application Support'
    const where = toolLocations('darwin', {}, appData)
    expect(where.ffmpeg[0]).toBe('/opt/homebrew/bin/ffmpeg')
    expect(where.ffmpeg).toContain('/usr/local/bin/ffmpeg')
    expect(where.whisperCli[0]).toBe('/opt/homebrew/bin/whisper-cli')
    expect(where.ollama).toContain('/Applications/Ollama.app/Contents/Resources/ollama')
    expect(where.dataRoot).toBe(appData)
  })
})
