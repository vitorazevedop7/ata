import { afterEach, describe, expect, it, vi } from 'vitest'
import { generate } from './ollama'
import type { OllamaTools } from './tools'

const tools: OllamaTools = {
  exe: null,
  modelsDir: '',
  model: 'qwen3.5:4b',
  host: 'http://127.0.0.1:11434'
}

/** A streamed /api/generate reply, one JSON event per line. */
const stream = (...parts: string[]): Response =>
  new Response(parts.map((response) => JSON.stringify({ response }) + '\n').join(''))

afterEach(() => vi.unstubAllGlobals())

describe('generate', () => {
  it('sends the schema as the output format and joins the streamed text', async () => {
    const fetch = vi.fn().mockResolvedValue(stream('{"overview":', ' "ok"}'))
    vi.stubGlobal('fetch', fetch)

    const text = await generate(tools, {
      system: 'sys',
      prompt: 'p',
      schema: { type: 'object' },
      numCtx: 2048
    })

    expect(text).toBe('{"overview": "ok"}')
    expect(JSON.parse(fetch.mock.calls[0][1].body).format).toEqual({ type: 'object' })
  })

  it('puts the schema in the prompt when the server has no structured output', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"not implemented"}', { status: 501 }))
      .mockResolvedValue(stream('{"overview": "ok"}'))
    vi.stubGlobal('fetch', fetch)

    const options = { system: 'sys', prompt: 'p', schema: { type: 'object' }, numCtx: 2048 }
    expect(await generate(tools, options)).toBe('{"overview": "ok"}')

    const retry = JSON.parse(fetch.mock.calls[1][1].body)
    expect(retry.format).toBeUndefined()
    expect(retry.system).toContain('JSON Schema')
    expect(retry.system).toContain('{"type":"object"}')

    // Later requests skip the format straight away.
    await generate(tools, options)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[2][1].body).format).toBeUndefined()
  })
})
