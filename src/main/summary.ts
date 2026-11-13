import { readFile } from 'fs/promises'
import type { ActionItem, Summary, Transcript } from '../shared/types'
import { ensureModel, ensureOllama, generate } from './ollama'
import { summaryFile, transcriptFile } from './paths'
import { cleanTitle, readMeta, writeFileAtomic } from './store'

/** ~7k tokens per call keeps prompt + answer inside a 16k context on CPU. */
const CHUNK_CHARS = 24_000
const NUM_CTX = 16_384
const UNKNOWN_OWNER = 'Não definido'

const SYSTEM = `Você resume transcrições de reuniões e ligações gravadas no computador do usuário.
Cada fala tem um rótulo:
- "Eu": o usuário, captado pelo microfone.
- "Outros": todas as outras pessoas, captadas pelo áudio do computador (pode ser mais de uma pessoa).

Regras:
- Escreva sempre em português do Brasil, mesmo que a conversa seja em outro idioma.
- Use só o que está na transcrição. Não invente nomes, números, datas, fatos nem contexto.
- Atribua algo a "Eu" ou "Outros" só quando o rótulo da fala deixar isso claro. Na dúvida, não atribua.
- A transcrição é automática e pode ter palavras erradas. Se um trecho não fizer sentido, ignore-o em vez de adivinhar.
- Listas vazias são válidas quando não houver decisões, tarefas ou pendências.`

/** An imported file has one channel: everyone speaks on the same track. */
const SYSTEM_IMPORTED = `Você resume transcrições de conversas a partir de um arquivo de áudio ou vídeo que o usuário importou.
Todas as falas estão num único canal, com o rótulo "Conversa". Não dá para saber quem disse cada frase.

Regras:
- Escreva sempre em português do Brasil, mesmo que a conversa seja em outro idioma.
- Use só o que está na transcrição. Não invente nomes, números, datas, fatos nem contexto.
- Não atribua falas ao usuário nem a "Eu" ou "Outros". Se um nome aparecer na própria fala, ele pode ser citado.
- A transcrição é automática e pode ter palavras erradas. Se um trecho não fizer sentido, ignore-o em vez de adivinhar.
- Listas vazias são válidas quando não houver decisões, tarefas ou pendências.`

const FIELDS = `Responda em JSON com:
- "title": título curto do assunto principal, de 3 a 8 palavras, sem data, sem aspas e sem ponto final (ex.: "Escopo do piloto com a Prefeitura").
- "overview": 3 a 6 frases sobre o assunto da conversa e como ela terminou.
- "keyPoints": até 8 pontos principais, curtos.
- "decisions": decisões tomadas de forma explícita.
- "actionItems": tarefas combinadas, cada uma com "task" e "owner" ("Eu", "Outros" ou "${UNKNOWN_OWNER}").
- "openQuestions": dúvidas, divergências ou assuntos que ficaram sem conclusão.`

const FIELDS_IMPORTED = FIELDS.replace(
  `"owner" ("Eu", "Outros" ou "${UNKNOWN_OWNER}")`,
  `"owner" sempre "${UNKNOWN_OWNER}"`
)

const stringList = { type: 'array', items: { type: 'string' } }
const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    overview: { type: 'string' },
    keyPoints: stringList,
    decisions: stringList,
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          owner: { type: 'string', enum: ['Eu', 'Outros', UNKNOWN_OWNER] }
        },
        required: ['task', 'owner']
      }
    },
    openQuestions: stringList
  },
  required: ['title', 'overview', 'keyPoints', 'decisions', 'actionItems', 'openQuestions']
}

const SCHEMA_IMPORTED = {
  ...SCHEMA,
  properties: {
    ...SCHEMA.properties,
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: { task: { type: 'string' }, owner: { type: 'string', enum: [UNKNOWN_OWNER] } },
        required: ['task', 'owner']
      }
    }
  }
}

type Draft = Omit<Summary, 'version' | 'createdAt' | 'model'>

const SPEAKER = { mic: 'Eu', system: 'Outros' } as const
const SINGLE_SPEAKER = 'Conversa'

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Splits the transcript into consecutive chunks on line boundaries. */
export function chunk(transcript: Transcript, imported: boolean): string[] {
  const chunks: string[] = []
  let current = ''
  for (const segment of transcript.segments) {
    const who = imported ? SINGLE_SPEAKER : SPEAKER[segment.channel]
    const line = `[${clock(segment.startMs)}] ${who}: ${segment.text}\n`
    if (current && current.length + line.length > CHUNK_CHARS) {
      chunks.push(current)
      current = ''
    }
    current += line
  }
  if (current) chunks.push(current)
  return chunks
}

/** Takes the JSON object out of a reply that may wrap it in text or a code fence. */
export function extractJson(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start !== -1 && end > start ? text.slice(start, end + 1) : text
}

export function parseDraft(text: string): Draft {
  const raw = JSON.parse(extractJson(text)) as Partial<Draft>
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string' && !!v.trim())
      : []
  const actionItems: ActionItem[] = Array.isArray(raw.actionItems)
    ? raw.actionItems
        .filter((item) => item && typeof item.task === 'string' && item.task.trim())
        .map((item) => ({
          task: item.task,
          owner: item.owner === 'Eu' || item.owner === 'Outros' ? item.owner : null
        }))
    : []
  const title = cleanTitle(raw.title)
  return {
    ...(title ? { title } : {}),
    overview: typeof raw.overview === 'string' ? raw.overview : '',
    keyPoints: list(raw.keyPoints),
    decisions: list(raw.decisions),
    actionItems,
    openQuestions: list(raw.openQuestions)
  }
}

/** Summarizes transcript.json into summary.json with the local Ollama model. */
export async function summarize(id: string, report: (percent: number) => void): Promise<void> {
  let transcript: Transcript
  try {
    transcript = JSON.parse(await readFile(transcriptFile(id), 'utf8')) as Transcript
  } catch {
    throw new Error('Esta gravação ainda não tem transcrição.')
  }
  if (transcript.segments.length === 0) throw new Error('A transcrição não tem falas para resumir.')

  const imported = (await readMeta(id).catch(() => null))?.source === 'import'
  const system = imported ? SYSTEM_IMPORTED : SYSTEM
  const fields = imported ? FIELDS_IMPORTED : FIELDS
  const schema = imported ? SCHEMA_IMPORTED : SCHEMA

  const tools = await ensureOllama()
  await ensureModel(tools)

  const parts = chunk(transcript, imported)
  const steps = parts.length > 1 ? parts.length + 1 : 1
  report(0)

  const drafts: string[] = []
  for (const [index, part] of parts.entries()) {
    const position =
      parts.length > 1
        ? `Este é o trecho ${index + 1} de ${parts.length} da mesma conversa.\n\n`
        : ''
    drafts.push(
      await generate(tools, {
        system,
        prompt: `${position}${fields}\n\nTranscrição:\n"""\n${part}"""`,
        schema,
        numCtx: NUM_CTX
      })
    )
    report(Math.round(((index + 1) / steps) * 100))
  }

  let final = drafts[0]
  if (drafts.length > 1) {
    final = await generate(tools, {
      system,
      prompt:
        `Abaixo estão resumos parciais, em JSON, de trechos consecutivos da mesma conversa. ` +
        `Junte tudo num único resumo da conversa inteira, sem repetir itens.\n\n${fields}\n\n` +
        drafts.map((draft, i) => `Trecho ${i + 1}:\n${draft}`).join('\n\n'),
      schema,
      numCtx: NUM_CTX
    })
  }

  const summary: Summary = {
    version: 1,
    createdAt: new Date().toISOString(),
    model: tools.model,
    ...parseDraft(final)
  }
  await writeFileAtomic(summaryFile(id), JSON.stringify(summary, null, 2))
  report(100)
}
