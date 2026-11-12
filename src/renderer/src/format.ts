import type { Channel, JobStatus, RecordingSummary, Summary, Transcript } from '../../shared/types'

export const SPEAKER: Record<Channel, string> = { mic: 'Eu', system: 'Outros' }

/** An imported file has one track, so nobody can be told apart. */
export const SINGLE_SPEAKER = 'Conversa'

export function speakerOf(channel: Channel, imported: boolean): string {
  return imported ? SINGLE_SPEAKER : SPEAKER[channel]
}

const LANGUAGE: Record<string, string> = {
  pt: 'português',
  en: 'inglês',
  es: 'espanhol',
  fr: 'francês',
  de: 'alemão',
  it: 'italiano'
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const shortDay = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
})
const longDay = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})
const plainDay = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })

/** Whole days between the start of today and the start of the given date's day. */
function daysAgo(date: Date): number {
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Library section a recording belongs to. */
export function dayGroup(iso: string): string {
  const days = daysAgo(new Date(iso))
  if (days <= 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 7) return 'Últimos 7 dias'
  return 'Mais antigas'
}

/** Row title inside a library section: "10:15" for today and yesterday, "Qua., 5 de nov. · 10:15" before that. */
export function formatRowTitle(iso: string): string {
  const date = new Date(iso)
  const days = daysAgo(date)
  if (days <= 1) return time.format(date)
  return `${capitalize(shortDay.format(date))} · ${time.format(date)}`
}

/** "Hoje, 10:15", "Ontem, 18:02" or "qua., 5 de nov., 10:15". */
export function formatWhen(iso: string, long = false): string {
  const date = new Date(iso)
  const days = daysAgo(date)
  const day = days === 0 ? 'Hoje' : days === 1 ? 'Ontem' : (long ? longDay : shortDay).format(date)
  return `${capitalize(day)}, ${time.format(date)}`
}

/** "47 min", "1 h 03 min" or "40 s": durations read as words, the clock is for timestamps. */
export function formatLength(item: RecordingSummary): string | null {
  if (!item.endedAt) return null
  const seconds = Math.max(
    0,
    Math.round((Date.parse(item.endedAt) - Date.parse(item.startedAt)) / 1000)
  )
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

export function audioNote(item: RecordingSummary): string {
  if (item.audioDeletedAt) return 'Áudio apagado'
  if (!item.hasAudio) return 'Sem áudio'
  const days = Math.ceil((Date.parse(item.audioExpiresAt) - Date.now()) / 86_400_000)
  if (days <= 1) return 'Áudio será apagado hoje'
  return `Áudio será apagado em ${plainDay.format(new Date(item.audioExpiresAt))}`
}

export function languagesOf(transcript: Transcript, imported = false): string {
  return (Object.entries(transcript.languages) as [Channel, string][])
    .map(([channel, lang]) =>
      imported
        ? capitalize(LANGUAGE[lang] ?? lang)
        : `${SPEAKER[channel]}: ${LANGUAGE[lang] ?? lang}`
    )
    .join(' · ')
}

/** "Importado de reuniao.mp3" for imports, null for recordings made in the app. */
export function importNote(item: RecordingSummary): string | null {
  if (item.importedFileName === null) return null
  return item.importedFileName ? `Importado de ${item.importedFileName}` : 'Importado'
}

export function describeJob(status: JobStatus, imported = false): string {
  const channel =
    status.channel && !imported ? (status.channel === 'mic' ? ' (Eu)' : ' (Outros)') : ''
  const percent = status.percent !== undefined ? ` ${status.percent}%` : ''
  if (status.kind === 'ask') {
    if (status.stage === 'queued') return 'Na fila para responder'
    return status.stage === 'error' ? 'A resposta falhou' : 'Respondendo'
  }
  switch (status.stage) {
    case 'queued':
      return status.kind === 'transcribe' ? 'Na fila para transcrever' : 'Na fila para resumir'
    case 'converting':
      return `Preparando áudio${channel}`
    case 'transcribing':
      return `Transcrevendo${channel}${percent}`
    case 'summarizing':
      return `Resumindo${percent}`
    case 'error':
      return status.kind === 'transcribe' ? 'A transcrição falhou' : 'O resumo falhou'
    default:
      return ''
  }
}

export function transcriptToText(transcript: Transcript, imported = false): string {
  return transcript.segments
    .map((s) => `[${formatClock(s.startMs / 1000)}] ${speakerOf(s.channel, imported)}: ${s.text}`)
    .join('\n')
}

export function summaryToText(summary: Summary): string {
  const section = (title: string, items: string[]): string =>
    items.length ? `\n\n${title}\n${items.map((item) => `- ${item}`).join('\n')}` : ''
  return (
    `Resumo\n${summary.overview}` +
    section('Pontos principais', summary.keyPoints) +
    section('Decisões', summary.decisions) +
    section(
      'Tarefas',
      summary.actionItems.map((a) => (a.owner ? `${a.task} (${a.owner})` : a.task))
    ) +
    section('Pendências', summary.openQuestions)
  )
}
