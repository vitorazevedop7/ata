import { readFile, rm, stat } from 'fs/promises'
import { availableParallelism } from 'os'
import { join } from 'path'
import type { Channel, Transcript, TranscriptSegment } from '../shared/types'
import { channelFile, recordingDir, transcriptFile } from './paths'
import { run } from './process'
import { writeFileAtomic } from './store'
import { resolveTools, type Tools } from './tools'

// System first: it is usually the longer channel and the one people wait for.
const ORDER: readonly Channel[] = ['system', 'mic']

interface WhisperJson {
  result?: { language?: string }
  transcription?: { offsets: { from: number; to: number }; text: string }[]
}

export type TranscriptionProgress =
  | { stage: 'converting'; channel: Channel }
  | { stage: 'transcribing'; channel: Channel; percent: number }

async function hasAudio(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

async function whisper(
  tools: Tools,
  wav: string,
  outBase: string,
  onPercent: (percent: number) => void
): Promise<WhisperJson> {
  const args = [
    ...['-m', tools.model, '-f', wav],
    ...['-l', 'auto', '-t', String(availableParallelism())],
    // Greedy decoding: beam search was ~15x slower on the reference GPU (docs/benchmark.md).
    ...['-bs', '1', '-bo', '1'],
    // No text context between windows: avoids repetition loops on long audio.
    ...['-mc', '0'],
    // Only transcribe stretches with speech; silence makes Whisper invent phrases.
    ...['--vad', '-vm', tools.vadModel],
    ...['-oj', '-pp', '-of', outBase]
  ]
  let lastError: unknown
  for (const cli of tools.whisperCli) {
    try {
      await run(cli, args, (line) => {
        const match = /progress =\s*(\d+)%/.exec(line)
        if (match) onPercent(Number(match[1]))
      })
      const json = JSON.parse(await readFile(`${outBase}.json`, 'utf8')) as WhisperJson
      await rm(`${outBase}.json`, { force: true })
      return json
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

/** Transcribes both channels and writes transcript.json next to the audio. */
export async function transcribe(
  id: string,
  report: (progress: TranscriptionProgress) => void
): Promise<void> {
  const tools = resolveTools()
  const dir = recordingDir(id)
  const segments: TranscriptSegment[] = []
  const languages: Transcript['languages'] = {}
  let channelsWithAudio = 0

  for (const channel of ORDER) {
    const source = channelFile(id, channel)
    if (!(await hasAudio(source))) continue
    channelsWithAudio++

    const wav = join(dir, `${channel}.16k.wav`)
    report({ stage: 'converting', channel })
    await run(tools.ffmpeg, [
      ...['-v', 'error', '-y', '-i', source],
      ...['-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]
    ])

    try {
      report({ stage: 'transcribing', channel, percent: 0 })
      const json = await whisper(tools, wav, join(dir, `${channel}.whisper`), (percent) =>
        report({ stage: 'transcribing', channel, percent })
      )
      if (json.result?.language) languages[channel] = json.result.language
      for (const item of json.transcription ?? []) {
        const text = item.text.trim()
        if (text) {
          segments.push({ channel, startMs: item.offsets.from, endMs: item.offsets.to, text })
        }
      }
    } finally {
      await rm(wav, { force: true })
    }
  }

  if (channelsWithAudio === 0) throw new Error('O áudio desta gravação já foi apagado.')

  segments.sort((a, b) => a.startMs - b.startMs || a.channel.localeCompare(b.channel))
  const transcript: Transcript = {
    version: 1,
    createdAt: new Date().toISOString(),
    languages,
    segments
  }
  await writeFileAtomic(transcriptFile(id), JSON.stringify(transcript, null, 2))
}
