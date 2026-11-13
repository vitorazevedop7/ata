import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { selectExcerpts } from './ask'

const segment = (i: number, text: string): TranscriptSegment => ({
  channel: i % 2 ? 'mic' : 'system',
  startMs: i * 10_000,
  endMs: i * 10_000 + 9_000,
  text
})

const filler = (count: number): TranscriptSegment[] =>
  Array.from({ length: count }, (_, i) =>
    segment(i, `Assunto genérico de número ${i} sem nada especial.`)
  )

describe('selectExcerpts', () => {
  it('returns the whole transcript when it fits the budget', () => {
    const out = selectExcerpts(filler(3), 'qualquer coisa', 10_000)
    expect(out.trim().split('\n')).toHaveLength(3)
    expect(out).not.toContain('[...]')
  })

  it('picks the part of a long transcript that answers the question', () => {
    const segments = filler(400)
    segments[250] = segment(250, 'O orçamento final ficou em 80 mil reais.')
    const out = selectExcerpts(segments, 'Qual foi o orçamento?', 3_000)
    expect(out.length).toBeLessThanOrEqual(3_000)
    expect(out).toContain('O orçamento final ficou em 80 mil reais.')
    expect(out).toContain('[...]')
  })

  it('matches word variations through the crude stem', () => {
    const segments = filler(400)
    segments[100] = segment(100, 'Ficou combinado que ela enviou os orçamentos ontem.')
    const out = selectExcerpts(segments, 'quem vai enviar o orçamento', 2_000)
    expect(out).toContain('enviou os orçamentos')
  })

  it('labels every line as "Conversa" for imported files', () => {
    const out = selectExcerpts(filler(2), 'x', 10_000, true)
    expect(out.match(/Conversa:/g)).toHaveLength(2)
  })
})
