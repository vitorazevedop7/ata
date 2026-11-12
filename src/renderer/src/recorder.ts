import type { Channel, RecordingSummary } from '../../shared/types'

const MIME_TYPE = 'audio/webm;codecs=opus'
const CHUNK_MS = 1000

export interface ActiveRecording {
  id: string
  /** Current RMS level of each channel, 0..1. */
  levels(): Record<Channel, number>
  stop(): Promise<RecordingSummary | null>
}

export class CaptureError extends Error {}

async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    })
  } catch (error) {
    throw new CaptureError(
      'Não foi possível abrir o microfone. Verifique se o Windows permite o acesso ' +
        '(Configurações > Privacidade > Microfone).',
      { cause: error }
    )
  }
}

async function openSystemAudio(): Promise<MediaStream> {
  let display: MediaStream
  try {
    display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  } catch (error) {
    throw new CaptureError('Não foi possível capturar o áudio do sistema.', { cause: error })
  }
  // Only the loopback audio matters; drop the screen video right away.
  display.getVideoTracks().forEach((track) => track.stop())
  const audio = display.getAudioTracks()
  if (audio.length === 0) {
    throw new CaptureError('O Windows não entregou o áudio do sistema (loopback).')
  }
  return new MediaStream(audio)
}

function rms(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer)
  let sum = 0
  for (const sample of buffer) sum += sample * sample
  return Math.sqrt(sum / buffer.length)
}

/** Records the microphone and the system audio into two separate files. */
export async function startRecording(): Promise<ActiveRecording> {
  const mic = await openMicrophone()
  let system: MediaStream
  try {
    system = await openSystemAudio()
  } catch (error) {
    mic.getTracks().forEach((track) => track.stop())
    throw error
  }
  const streams: Record<Channel, MediaStream> = { mic, system }

  const id = await window.api.recording.start()

  const context = new AudioContext()
  const analysers = {} as Record<Channel, AnalyserNode>
  const buffers = {} as Record<Channel, Float32Array<ArrayBuffer>>
  const recorders = {} as Record<Channel, MediaRecorder>
  const writes: Record<Channel, Promise<void>> = {
    mic: Promise.resolve(),
    system: Promise.resolve()
  }

  for (const channel of ['mic', 'system'] as const) {
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    context.createMediaStreamSource(streams[channel]).connect(analyser)
    analysers[channel] = analyser
    buffers[channel] = new Float32Array(analyser.fftSize)

    const recorder = new MediaRecorder(streams[channel], {
      mimeType: MIME_TYPE,
      audioBitsPerSecond: 64_000
    })
    // Chunks are written in order: each write waits for the previous one.
    recorder.ondataavailable = (event): void => {
      if (event.data.size === 0) return
      const blob = event.data
      writes[channel] = writes[channel].then(async () =>
        window.api.recording.appendChunk(id, channel, await blob.arrayBuffer())
      )
    }
    recorder.start(CHUNK_MS)
    recorders[channel] = recorder
  }

  return {
    id,
    levels: () => ({
      mic: rms(analysers.mic, buffers.mic),
      system: rms(analysers.system, buffers.system)
    }),
    async stop() {
      await Promise.all(
        Object.values(recorders).map(
          (recorder) =>
            new Promise<void>((resolve) => {
              recorder.addEventListener('stop', () => resolve(), { once: true })
              recorder.stop()
            })
        )
      )
      await Promise.all(Object.values(writes))
      Object.values(streams).forEach((stream) => stream.getTracks().forEach((t) => t.stop()))
      await context.close()
      return window.api.recording.stop(id)
    }
  }
}
