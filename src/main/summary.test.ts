import { describe, expect, it } from 'vitest'
import type { Transcript, TranscriptSegment } from '../shared/types'
import { chunk, parseDraft } from './summary'

const transcript = (segments: TranscriptSegment[]): Transcript => ({
  version: 1,
  createdAt: '2026-11-12T10:00:00.000Z',
  languages: { mic: 'pt', system: 'pt' },
  segments
})

describe('chunk', () => {
  it('labels each line with time and speaker', () => {
    const chunks = chunk(
      transcript([
        { channel: 'system', startMs: 0, endMs: 1000, text: 'Bom dia.' },
        { channel: 'mic', startMs: 65_000, endMs: 66_000, text: 'Bom dia!' }
      ]),
      false
    )
    expect(chunks).toEqual(['[00:00] Outros: Bom dia.\n[01:05] Eu: Bom dia!\n'])
  })

  it('uses a single speaker for imported files', () => {
    const [text] = chunk(
      transcript([{ channel: 'system', startMs: 0, endMs: 1000, text: 'Oi.' }]),
      true
    )
    expect(text).toBe('[00:00] Conversa: Oi.\n')
  })

  it('splits long transcripts on line boundaries without losing lines', () => {
    const segments = Array.from({ length: 600 }, (_, i) => ({
      channel: 'system' as const,
      startMs: i * 1000,
      endMs: i * 1000 + 900,
      text: `Fala número ${i} `.padEnd(80, 'x')
    }))
    const chunks = chunk(transcript(segments), false)
    expect(chunks.length).toBeGreaterThan(1)
    for (const part of chunks) {
      expect(part.length).toBeLessThanOrEqual(24_000)
      expect(part.endsWith('\n')).toBe(true)
    }
    expect(chunks.join('').split('\n').filter(Boolean)).toHaveLength(600)
  })
})

describe('parseDraft', () => {
  it('keeps valid fields and drops malformed ones', () => {
    const draft = parseDraft(
      JSON.stringify({
        overview: 'Piloto aprovado.',
        keyPoints: ['Prazo de 30 dias', '', 42, '  '],
        decisions: 'not a list',
        actionItems: [
          { task: 'Enviar proposta', owner: 'Eu' },
          { task: 'Revisar contrato', owner: 'Maria' },
          { task: '   ', owner: 'Outros' },
          null
        ]
      })
    )
    expect(draft).toEqual({
      overview: 'Piloto aprovado.',
      keyPoints: ['Prazo de 30 dias'],
      decisions: [],
      actionItems: [
        { task: 'Enviar proposta', owner: 'Eu' },
        { task: 'Revisar contrato', owner: null }
      ],
      openQuestions: []
    })
  })

  it('keeps a cleaned-up title and omits a missing one', () => {
    expect(parseDraft('{"title": " \\"Escopo do piloto.\\" ", "overview": "x"}').title).toBe(
      'Escopo do piloto'
    )
    expect(parseDraft('{"overview": "x"}')).not.toHaveProperty('title')
  })

  it('reads JSON wrapped in text or a code fence', () => {
    const reply = 'Claro! Aqui está:\n```json\n{"overview": "Tudo certo."}\n```\nAbraços.'
    expect(parseDraft(reply).overview).toBe('Tudo certo.')
  })

  it('throws on text that is not JSON', () => {
    expect(() => parseDraft('Claro! Aqui está o resumo:')).toThrow()
  })
})
