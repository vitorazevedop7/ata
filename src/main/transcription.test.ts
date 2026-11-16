import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { mergeSegments, parseProgress, toSegments } from './transcription'

describe('parseProgress', () => {
  it('reads the percentage whisper.cpp prints', () => {
    expect(parseProgress('whisper_print_progress_callback: progress =  45%')).toBe(45)
    expect(parseProgress('progress = 100%')).toBe(100)
  })

  it('ignores every other line', () => {
    expect(parseProgress('whisper_init_from_file: loading model')).toBeNull()
    expect(parseProgress('')).toBeNull()
  })
})

describe('toSegments', () => {
  it('keeps the timing and trims the text', () => {
    const json = {
      transcription: [
        { offsets: { from: 0, to: 2400 }, text: '  A entrega fica para sexta. ' },
        { offsets: { from: 2400, to: 5100 }, text: 'Combinado.' }
      ]
    }
    expect(toSegments('system', json)).toEqual([
      { channel: 'system', startMs: 0, endMs: 2400, text: 'A entrega fica para sexta.' },
      { channel: 'system', startMs: 2400, endMs: 5100, text: 'Combinado.' }
    ])
  })

  it('drops empty lines and handles audio without speech', () => {
    const json = { transcription: [{ offsets: { from: 0, to: 900 }, text: '   ' }] }
    expect(toSegments('mic', json)).toEqual([])
    expect(toSegments('mic', {})).toEqual([])
  })
})

describe('mergeSegments', () => {
  const seg = (channel: 'mic' | 'system', startMs: number): TranscriptSegment => ({
    channel,
    startMs,
    endMs: startMs + 1000,
    text: `${channel}@${startMs}`
  })

  it('interleaves both channels in time order', () => {
    const merged = mergeSegments([seg('system', 0), seg('system', 4000), seg('mic', 2000)])
    expect(merged.map((s) => s.text)).toEqual(['system@0', 'mic@2000', 'system@4000'])
  })

  it('puts "Eu" before "Outros" when both start together, and keeps the input intact', () => {
    const input = [seg('system', 1000), seg('mic', 1000)]
    expect(mergeSegments(input).map((s) => s.channel)).toEqual(['mic', 'system'])
    expect(input.map((s) => s.channel)).toEqual(['system', 'mic'])
  })
})
