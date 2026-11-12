import { type ChildProcess, spawn } from 'child_process'
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
    throw new Error('Ollama não está rodando e o ollama.exe não foi encontrado.')
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
 * Streams a generation so long CPU runs never hit an HTTP header timeout,
 * and returns the full response text.
 */
export async function generate(tools: OllamaTools, options: GenerateOptions): Promise<string> {
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
    if (!res.ok || !res.body) throw new Error(`Ollama respondeu ${res.status}: ${await res.text()}`)

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
        if (event.error) throw new Error(`Ollama: ${event.error}`)
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
  server?.kill()
  server = null
}
