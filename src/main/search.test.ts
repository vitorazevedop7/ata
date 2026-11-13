import { describe, expect, it } from 'vitest'
import { excerpt, normalizeQuery } from './search'

describe('normalizeQuery', () => {
  it('lowercases, strips accents and collapses spaces', () => {
    expect(normalizeQuery('  Reunião   de  ORÇAMENTO ')).toBe('reuniao de orcamento')
  })
})

describe('excerpt', () => {
  it('finds a match regardless of accents and case', () => {
    const hit = excerpt('A reunião foi adiada.', normalizeQuery('REUNIAO'))
    expect(hit).not.toBeNull()
    const [from, to] = hit!.match
    expect(hit!.snippet.slice(from, to)).toBe('reunião')
  })

  it('returns null when the text does not contain the query', () => {
    expect(excerpt('Nada a ver aqui.', 'orcamento')).toBeNull()
  })

  it('cuts long text at word boundaries and marks the cuts', () => {
    const before = 'palavra '.repeat(30)
    const after = ' outra'.repeat(30)
    const hit = excerpt(`${before}contrato${after}`, 'contrato')!
    expect(hit.snippet.startsWith('…palavra')).toBe(true)
    expect(hit.snippet.endsWith('outra…')).toBe(true)
    const [from, to] = hit.match
    expect(hit.snippet.slice(from, to)).toBe('contrato')
  })

  it('keeps a decomposed accent with its letter', () => {
    const text = 'Decisão tomada'
    const hit = excerpt(text, normalizeQuery('decisão'))!
    const [from, to] = hit.match
    expect(hit.snippet.slice(from, to)).toBe('Decisão')
  })
})
