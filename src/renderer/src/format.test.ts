import { describe, expect, it } from 'vitest'
import type { Summary, Transcript } from '../../shared/types'
import { formatClock, summaryToText, transcriptToText } from './format'

describe('formatClock', () => {
  it('shows minutes and seconds, and hours only when needed', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65.9)).toBe('01:05')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('00:00')
  })
})

describe('transcriptToText', () => {
  const transcript: Transcript = {
    version: 1,
    createdAt: '2026-11-12T10:00:00.000Z',
    languages: { system: 'pt' },
    segments: [
      { channel: 'system', startMs: 0, endMs: 1000, text: 'Bom dia.' },
      { channel: 'mic', startMs: 3_661_000, endMs: 3_662_000, text: 'Até logo.' }
    ]
  }

  it('names "Outros" and "Eu" for recordings', () => {
    expect(transcriptToText(transcript)).toBe('[00:00] Outros: Bom dia.\n[1:01:01] Eu: Até logo.')
  })

  it('names a single speaker for imported files', () => {
    expect(transcriptToText(transcript, true)).toContain('[00:00] Conversa: Bom dia.')
  })
})

describe('summaryToText', () => {
  it('skips empty sections and shows task owners', () => {
    const summary = {
      overview: 'Piloto aprovado.',
      keyPoints: [],
      decisions: ['Entrega em 30 dias'],
      actionItems: [
        { task: 'Enviar proposta', owner: 'Eu' },
        { task: 'Revisar contrato', owner: null }
      ],
      openQuestions: []
    } as unknown as Summary
    expect(summaryToText(summary)).toBe(
      'Resumo\nPiloto aprovado.\n\nDecisões\n- Entrega em 30 dias\n\nTarefas\n- Enviar proposta (Eu)\n- Revisar contrato'
    )
  })
})
