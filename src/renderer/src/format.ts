import type { Channel, JobStatus, RecordingSummary, Summary, Transcript } from '../../shared/types'

export const SPEAKER: Record<Channel, string> = { mic: 'Eu', system: 'Outros' }

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

export function durationOf(item: RecordingSummary): string | null {
  if (!item.endedAt) return null
  return formatClock((Date.parse(item.endedAt) - Date.parse(item.startedAt)) / 1000)
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

/** "Hoje, 10:15", "Ontem, 18:02" or "qua., 5 de nov., 10:15". */
export function formatWhen(iso: string, long = false): string {
  const date = new Date(iso)
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  const day = days === 0 ? 'Hoje' : days === 1 ? 'Ontem' : (long ? longDay : shortDay).format(date)
  const label = day.charAt(0).toUpperCase() + day.slice(1)
  return `${label}, ${time.format(date)}`
}

export function audioNote(item: RecordingSummary): string {
  if (item.audioDeletedAt) return 'Áudio apagado'
  if (!item.hasAudio) return 'Sem áudio'
  const days = Math.ceil((Date.parse(item.audioExpiresAt) - Date.now()) / 86_400_000)
  if (days <= 1) return 'Áudio será apagado hoje'
  return `Áudio será apagado em ${plainDay.format(new Date(item.audioExpiresAt))}`
}

export function languagesOf(transcript: Transcript): string {
  return (Object.entries(transcript.languages) as [Channel, string][])
    .map(([channel, lang]) => `${SPEAKER[channel]}: ${LANGUAGE[lang] ?? lang}`)
    .join(' · ')
}

export function describeJob(status: JobStatus): string {
  const channel = status.channel ? (status.channel === 'mic' ? ' (Eu)' : ' (Outros)') : ''
  const percent = status.percent !== undefined ? ` ${status.percent}%` : ''
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

export function transcriptToText(transcript: Transcript): string {
  return transcript.segments
    .map((s) => `[${formatClock(s.startMs / 1000)}] ${SPEAKER[s.channel]}: ${s.text}`)
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
