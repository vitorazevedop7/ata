import { type ChildProcess, spawn, spawnSync } from 'child_process'
import { resolveOllama, type OllamaTools } from './tools'

let server: ChildProcess | null = null
const controllers = new Set<AbortController>()

async function isUp(host: string): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/version`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

/** Uses a running Ollama server, or starts the bundled one and waits for it. */
export async function ensureOllama(): Promise<OllamaTools> {
  const tools = resolveOllama()
  if (await isUp(tools.host)) return tools
  if (!tools.exe) {
    throw new Error('O Ollama não está rodando e não foi encontrado neste computador.')
  }
  if (!server) {
    server = spawn(tools.exe, ['serve'], {
      windowsHide: true,
      env: { ...process.env, OLLAMA_MODELS: tools.modelsDir }
    })
    server.on('exit', () => {
      server = null
    })
  }
  for (let i = 0; i < 40; i++) {
    if (await isUp(tools.host)) return tools
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('O servidor do Ollama não respondeu em 20 s.')
}

export async function ensureModel(tools: OllamaTools): Promise<void> {
  const res = await fetch(`${tools.host}/api/tags`)
  const body = (await res.json()) as { models?: { name: string }[] }
  if (!body.models?.some((m) => m.name === tools.model)) {
    throw new Error(
      `Modelo ${tools.model} não encontrado no Ollama. Rode: ollama pull ${tools.model}`
    )
  }
}

export interface GenerateOptions {
  system: string
  prompt: string
  /** JSON schema the answer must follow; plain text when omitted. */
  schema?: object
  numCtx: number
  /** Receives the text generated so far after each token. */
  onToken?: (text: string) => void
  signal?: AbortSignal
}

/**
 * Right after Whisper releases the GPU, a freshly started Ollama sometimes fails
 * to initialize CUDA ("shared object initialization failed") and stays broken
 * until restarted, so such an error is worth one more try on a fresh server.
 */
function isCudaFailure(error: unknown): boolean {
  return error instanceof Error && /CUDA error/i.test(error.message)
}

/** Kills the server this app started, with its model runners. */
function killServer(): void {
  if (!server) return
  if (process.platform === 'win32' && server.pid) {
    // /t also ends the model runners, which outlive their parent on Windows.
    spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { windowsHide: true })
  } else {
    // Elsewhere `ollama serve` stops its runners when it receives SIGTERM.
    server.kill()
  }
  server = null
}

/**
 * Streams a generation so long CPU runs never hit an HTTP header timeout,
 * and returns the full response text. A CUDA failure before any text is
 * retried once on a restarted server.
 */
export async function generate(tools: OllamaTools, options: GenerateOptions): Promise<string> {
  if (options.schema && !structuredOutput) return generate(tools, withSchemaInPrompt(options))
  try {
    return await generateWithRetry(tools, options)
  } catch (error) {
    if (!(error instanceof StructuredOutputUnavailable)) throw error
    structuredOutput = false
    return generate(tools, withSchemaInPrompt(options))
  }
}

/**
 * Some Ollama builds can't constrain the output to a schema (the Homebrew build on
 * Apple Silicon answers 501). Then the schema goes in the prompt instead, and the
 * caller extracts the JSON from the text (see extractJson in summary.ts).
 */
class StructuredOutputUnavailable extends Error {}

function isStructuredOutputError(message: string): boolean {
  return /structured output|xgrammar|not implemented|\b501\b/i.test(message)
}
let structuredOutput = true

function withSchemaInPrompt(options: GenerateOptions): GenerateOptions {
  const { schema, ...rest } = options
  return {
    ...rest,
    system:
      `${options.system}\n\nResponda apenas com um objeto JSON válido, sem texto antes ou ` +
      `depois, que siga este JSON Schema:\n${JSON.stringify(schema)}`
  }
}

async function generateWithRetry(tools: OllamaTools, options: GenerateOptions): Promise<string> {
  let produced = false
  const attempt = (): Promise<string> =>
    generateOnce(tools, {
      ...options,
      onToken: (text) => {
        produced = true
        options.onToken?.(text)
      }
    })
  try {
    return await attempt()
  } catch (error) {
    if (produced || options.signal?.aborted || !isCudaFailure(error)) throw error
    killServer()
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await ensureOllama()
    return await attempt()
  }
}

async function generateOnce(tools: OllamaTools, options: GenerateOptions): Promise<string> {
  const controller = new AbortController()
  controllers.add(controller)
  const abort = (): void => controller.abort()
  options.signal?.addEventListener('abort', abort)
  if (options.signal?.aborted) abort()
  try {
    const res = await fetch(`${tools.host}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: tools.model,
        system: options.system,
        prompt: options.prompt,
        format: options.schema,
        stream: true,
        think: false,
        options: { num_ctx: options.numCtx, temperature: 0.2 }
      })
    })
    if (!res.ok || !res.body) {
      const message = await res.text()
      if (options.schema && (res.status === 501 || isStructuredOutputError(message))) {
        throw new StructuredOutputUnavailable(message)
      }
      throw new Error(`Ollama respondeu ${res.status}: ${message}`)
    }

    let text = ''
    let buffer = ''
    const decoder = new TextDecoder()
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as { response?: string; error?: string }
        if (event.error) {
          if (options.schema && !text && isStructuredOutputError(event.error)) {
            throw new StructuredOutputUnavailable(event.error)
          }
          throw new Error(`Ollama: ${event.error}`)
        }
        if (event.response) {
          text += event.response
          options.onToken?.(text)
        }
      }
    }
    return text
  } finally {
    options.signal?.removeEventListener('abort', abort)
    controllers.delete(controller)
  }
}

/** Cancels running generations and stops the server if this app started it. */
export function stopOllama(): void {
  for (const controller of controllers) controller.abort()
  controllers.clear()
  killServer()
}
