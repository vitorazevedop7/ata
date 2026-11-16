import { describe, expect, it } from 'vitest'
import type { Channel, TranscriptSegment } from '../../shared/types'
import { segmentAt, segmentNear } from './segments'

const seg = (channel: Channel, startMs: number, endMs: number): TranscriptSegment => ({
  channel,
  startMs,
  endMs,
  text: `${channel}@${startMs}`
})

// "Outros" talks from 0 to 10 s; "Eu" answers over it from 4 to 6 s, then "Outros" again.
const segments = [seg('system', 0, 10_000), seg('mic', 4_000, 6_000), seg('system', 12_000, 15_000)]

describe('segmentAt', () => {
  it('finds the line being spoken', () => {
    expect(segmentAt(segments, 2_000)).toBe(0)
    expect(segmentAt(segments, 13_000)).toBe(2)
  })

  it('prefers the most recent line among overlapping ones', () => {
    expect(segmentAt(segments, 5_000)).toBe(1)
  })

  it('falls back to the last line that started during a silence', () => {
    expect(segmentAt(segments, 11_000)).toBe(1)
  })

  it('goes to the first line before anyone spoke', () => {
    expect(segmentAt([seg('mic', 3_000, 4_000)], 1_000)).toBe(0)
  })
})

describe('segmentNear', () => {
  it('matches the time shown next to each line, rounded down to the second', () => {
    const lines = [seg('system', 61_900, 63_000), seg('mic', 125_400, 127_000)]
    expect(segmentNear(lines, 61_000)).toBe(0)
    expect(segmentNear(lines, 125_000)).toBe(1)
  })

  it('picks the closest line when the cited time is approximate', () => {
    expect(segmentNear(segments, 11_000)).toBe(2)
  })
})
