import type { TranscriptSegment } from '../../shared/types'

/**
 * Index of the segment being spoken at `ms`: the latest one that started by
 * then, preferring one still running (the two channels overlap in time).
 */
export function segmentAt(segments: readonly TranscriptSegment[], ms: number): number {
  let best = -1
  let bestRunning = -1
  segments.forEach((segment, index) => {
    if (segment.startMs > ms) return
    if (best === -1 || segment.startMs >= segments[best].startMs) best = index
    if (
      ms < segment.endMs &&
      (bestRunning === -1 || segment.startMs >= segments[bestRunning].startMs)
    )
      bestRunning = index
  })
  if (bestRunning !== -1) return bestRunning
  return best === -1 ? 0 : best
}

/**
 * Index of the segment whose displayed time (rounded down to the second) is
 * closest to `ms`, for times cited by the model in its answers.
 */
export function segmentNear(segments: readonly TranscriptSegment[], ms: number): number {
  let index = 0
  let best = Infinity
  segments.forEach((segment, i) => {
    const distance = Math.abs(Math.floor(segment.startMs / 1000) * 1000 - ms)
    if (distance < best) [index, best] = [i, distance]
  })
  return index
}
