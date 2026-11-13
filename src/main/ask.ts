import { readFile } from 'fs/promises'
import type { Chat, ChatEntry, Summary, Transcript, TranscriptSegment } from '../shared/types'
import { ensureModel, ensureOllama, generate } from './ollama'
import { chatFile, summaryFile, transcriptFile } from './paths'
import { readMeta, writeFileAtomic } from './store'

/** Same budget as a summary chunk: prompt + answer stay inside a 16k context on CPU. */
const CONTEXT_CHARS = 24_000
const MIN_EXCERPT_CHARS = 8_000
const NUM_CTX = 16_384
/** Neighbouring segments kept around each hit, so an answer keeps its context. */
const RADIUS = 2
/** Earlier questions sent along, so follow-ups ("e quem ficou com isso?") make sense. */
const HISTORY = 3
const NOT_ANSWERED = 'A transcrição não responde a isso.'

const SPEAKER = { mic: 'Eu', system: 'Outros' } as const
/** An imported file has one channel: everyone speaks on the same track. */
const SINGLE_SPEAKER = 'Conversa'

const SPEAKERS_RECORDED = `Cada fala da transcrição começa com o horário e um rótulo:
- "Eu": o usuário, captado pelo microfone.
- "Outros": todas as outras pessoas, captadas pelo áudio do computador (pode ser mais de uma pessoa).`

const SPEAKERS_IMPORTED = `Cada fala da transcrição começa com o horário e o rótulo "${SINGLE_SPEAKER}". O áudio foi importado de um arquivo com um canal só, então não dá para saber quem disse cada frase; não atribua falas a ninguém.`

const system = (
  imported: boolean
): string => `Você responde perguntas sobre uma reunião ou ligação gravada, usando a transcrição dela.
${imported ? SPEAKERS_IMPORTED : SPEAKERS_RECORDED}

Regras:
- Responda sempre em português do Brasil, de forma direta e curta (até um parágrafo ou uma lista curta).
- Use só o que está na transcrição e no resumo. Não invente nomes, números, datas, fatos nem contexto.
- Depois de cada afirmação, cite entre colchetes o horário das falas que a sustentam, exatamente como aparece na transcrição, por exemplo [12:34] ou [1:02:10].
- Se a transcrição não tiver a resposta, diga "${NOT_ANSWERED}" e, se ajudar, o que ela diz de mais próximo. Nunca adivinhe.
- A transcrição é automática e pode ter palavras erradas. Se um trecho não fizer sentido, não se apoie nele.
- Responda em texto simples, sem títulos e sem JSON.`

const STOPWORDS = new Set(
  (
    'a o e de da do das dos em no na nos nas um uma uns umas para pra por com sem sobre que se ' +
    'como qual quais quando onde quem quanto quanta quantos quantas porque por que foi era sao ' +
    'ser estar esta isso isto aquilo esse essa este ele ela eles elas eu voce voces nos me te lhe ' +
    'meu minha seu sua ao aos as os mais menos muito ja nao sim ou mas tem ter teve tinha ficou ' +
    'fica falou disse dito reuniao conversa ligacao alguem algum alguma algo the and of to in is ' +
    'what who when where which how did does was were about'
  ).split(' ')
)

/** Lowercase, no accents, letters and digits only. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Crude stem so "orçamento" matches "orçamentos" and "enviar" matches "enviou". */
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word
}

function terms(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of normalize(text).split(' ')) {
    if (word.length >= 3 && !STOPWORDS.has(word)) out.add(stem(word))
    else if (/^\d+$/.test(word)) out.add(word)
  }
  return out
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`
}

const line = (s: TranscriptSegment, imported: boolean): string =>
  `[${clock(s.startMs)}] ${imported ? SINGLE_SPEAKER : SPEAKER[s.channel]}: ${s.text.trim()}\n`

/**
 * Picks the parts of the transcript most likely to answer the question:
 * every segment scores the rarer question words it contains, each window of
 * neighbouring segments adds up its scores, and the best windows are taken
 * until the budget is full. Leftover budget goes to evenly spaced windows, so
 * vague questions ("como terminou?") still see the whole conversation.
 */
export function selectExcerpts(
  segments: TranscriptSegment[],
  question: string,
  budget: number,
  imported = false
): string {
  const lines = segments.map((segment) => line(segment, imported))
  const total = lines.reduce((sum, l) => sum + l.length, 0)
  if (total <= budget) return lines.join('')

  const wanted = terms(question)
  const segmentTerms = segments.map((s) => terms(s.text))
  const df = new Map<string, number>()
  for (const set of segmentTerms) {
    for (const term of set) if (wanted.has(term)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const score = segmentTerms.map((set) => {
    let sum = 0
    for (const term of set) {
      const count = df.get(term)
      if (count) sum += Math.log(1 + segments.length / count)
    }
    return sum
  })

  const windowScore = (center: number): number => {
    let sum = 0
    for (let i = center - RADIUS; i <= center + RADIUS; i++) {
      if (i >= 0 && i < segments.length) sum += i === center ? score[i] * 2 : score[i]
    }
    return sum
  }
  const ranked = score
    .map((value, index) => ({ index, value: value > 0 ? windowScore(index) : 0 }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((c) => c.index)
  const spread = Array.from({ length: 24 }, (_, k) =>
    Math.round(((k + 0.5) / 24) * (segments.length - 1))
  )

  const chosen = new Set<number>()
  let used = 0
  for (const center of [...ranked, ...spread]) {
    const add: number[] = []
    let cost = 0
    for (let i = center - RADIUS; i <= center + RADIUS; i++) {
      if (i < 0 || i >= segments.length || chosen.has(i)) continue
      add.push(i)
      cost += lines[i].length
    }
    if (add.length === 0 || used + cost > budget) continue
    for (const i of add) chosen.add(i)
    used += cost
  }

  let out = ''
  let previous = -1
  for (const i of [...chosen].sort((a, b) => a - b)) {
    if (previous >= 0 && i !== previous + 1) out += '[...]\n'
    out += lines[i]
    previous = i
  }
  return out
}

function summaryText(summary: Summary): string {
  const section = (title: string, items: string[]): string =>
    items.length ? `\n${title}:\n${items.map((item) => `- ${item}`).join('\n')}` : ''
  return (
    summary.overview +
    section('Decisões', summary.decisions) +
    section(
      'Tarefas',
      summary.actionItems.map((a) => (a.owner ? `${a.task} (${a.owner})` : a.task))
    ) +
    section('Pendências', summary.openQuestions)
  )
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

export async function readChat(id: string): Promise<ChatEntry[]> {
  const chat = await readJson<Chat>(chatFile(id))
  return Array.isArray(chat?.entries) ? chat.entries : []
}

/** Answers a question about the recording with the local model and appends it to chat.json. */
export async function ask(
  id: string,
  question: string,
  signal: AbortSignal,
  report: (partial: string) => void
): Promise<void> {
  const transcript = await readJson<Transcript>(transcriptFile(id))
  if (!transcript) throw new Error('Esta gravação ainda não tem transcrição.')
  if (transcript.segments.length === 0) throw new Error('A transcrição não tem falas.')
  const summary = await readJson<Summary>(summaryFile(id))
  const history = (await readChat(id)).slice(-HISTORY)
  const imported = (await readMeta(id).catch(() => null))?.source === 'import'

  const tools = await ensureOllama()
  await ensureModel(tools)

  const summaryPart = summary
    ? `Resumo da conversa (gerado antes):\n${summaryText(summary)}\n\n`
    : ''
  const historyPart = history.length
    ? `Perguntas anteriores sobre esta conversa:\n${history
        .map((h) => `P: ${h.question}\nR: ${h.answer}`)
        .join('\n\n')}\n\n`
    : ''
  const budget = Math.max(
    MIN_EXCERPT_CHARS,
    CONTEXT_CHARS - summaryPart.length - historyPart.length - question.length
  )
  const excerpts = selectExcerpts(transcript.segments, question, budget, imported)
  const partialNote = excerpts.includes('[...]\n')
    ? 'A transcrição é longa; abaixo estão só os trechos mais ligados à pergunta. "[...]" marca partes omitidas.\n'
    : ''

  let last = 0
  const answer = await generate(tools, {
    system: system(imported),
    prompt:
      summaryPart +
      historyPart +
      `${partialNote}Transcrição:\n"""\n${excerpts}"""\n\n` +
      `Pergunta: ${question}`,
    numCtx: NUM_CTX,
    signal,
    onToken: (text) => {
      const now = Date.now()
      if (now - last < 200) return
      last = now
      report(text)
    }
  })

  const entry: ChatEntry = {
    question,
    answer: answer.trim() || NOT_ANSWERED,
    askedAt: new Date().toISOString(),
    model: tools.model
  }
  const chat: Chat = { version: 1, entries: [...(await readChat(id)), entry] }
  await writeFileAtomic(chatFile(id), JSON.stringify(chat, null, 2))
}
