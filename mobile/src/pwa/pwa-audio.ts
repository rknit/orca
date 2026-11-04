import {
  audioReadParamsSchema,
  audioStartParamsSchema
} from '../mobile-web-shell/bridge/bridge-audio-verbs'
import { BRIDGE_AUDIO_RING_MAX_BYTES } from '../mobile-web-shell/bridge/bridge-audio-verbs'
import { bytesToBase64 } from './pwa-media'

type Capture = {
  context: AudioContext
  stream: MediaStream
  processor: ScriptProcessorNode
  source: MediaStreamAudioSourceNode
}

let capture: Capture | null = null
let ring = new Uint8Array(0)
let droppedBytes = 0

function appendToRing(bytes: Uint8Array): void {
  const room = BRIDGE_AUDIO_RING_MAX_BYTES - ring.length
  droppedBytes += Math.max(0, bytes.length - room)
  const kept = bytes.subarray(0, Math.max(0, room))
  const next = new Uint8Array(ring.length + kept.length)
  next.set(ring)
  next.set(kept, ring.length)
  ring = next
}

function takeFromRing(maxBytes: number): { base64: string; droppedBytes: number } {
  // Whole 16-bit samples only, so the next read stays aligned.
  const length = Math.min(ring.length, maxBytes) & ~1
  const taken = { base64: bytesToBase64(ring.subarray(0, length)), droppedBytes }
  ring = ring.slice(length)
  droppedBytes = 0
  return taken
}

/** Browsers capture at the device rate, while the recognizer wants 16-bit PCM at the requested one. */
function toPcm16(samples: Float32Array, fromRate: number, toRate: number): Uint8Array {
  const ratio = fromRate / toRate
  const count = Math.floor(samples.length / ratio)
  const pcm = new DataView(new ArrayBuffer(count * 2))
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio))
    let sum = 0
    for (let at = start; at < end; at += 1) {
      sum += samples[at] ?? 0
    }
    const sample = Math.max(-1, Math.min(1, sum / (end - start)))
    pcm.setInt16(index * 2, sample * 0x7fff, true)
  }
  return new Uint8Array(pcm.buffer)
}

function release(): void {
  if (capture) {
    capture.processor.disconnect()
    capture.source.disconnect()
    for (const track of capture.stream.getTracks()) {
      track.stop()
    }
    void capture.context.close()
    capture = null
  }
}

export async function startAudio(params: unknown): Promise<{
  started: boolean
  sampleRate: number
  permission: 'granted' | 'denied' | 'undetermined'
}> {
  const { sampleRate } = audioStartParamsSchema.parse(params)
  release()
  ring = new Uint8Array(0)
  droppedBytes = 0
  // Created inside the tap's activation, or Safari leaves it suspended.
  const context = new AudioContext()
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
  } catch (error) {
    void context.close()
    const denied = error instanceof DOMException && error.name === 'NotAllowedError'
    return { started: false, sampleRate, permission: denied ? 'denied' : 'granted' }
  }
  await context.resume()
  const source = context.createMediaStreamSource(stream)
  // A ScriptProcessor needs no worklet file, which this page's script policy would have to allow.
  const processor = context.createScriptProcessor(4096, 1, 1)
  processor.onaudioprocess = (event) => {
    appendToRing(toPcm16(event.inputBuffer.getChannelData(0), context.sampleRate, sampleRate))
  }
  source.connect(processor)
  processor.connect(context.destination)
  capture = { context, stream, processor, source }
  return { started: true, sampleRate, permission: 'granted' }
}

export function readAudio(params: unknown): {
  base64: string
  droppedBytes: number
  recording: boolean
  interruption: 'began' | null
} {
  const { maxBytes } = audioReadParamsSchema.parse(params)
  // iOS suspends capture for calls and for leaving the page; the page must end dictation on that.
  const live = capture !== null && capture.context.state === 'running'
  return {
    ...takeFromRing(maxBytes),
    recording: live,
    interruption: capture !== null && !live ? 'began' : null
  }
}

export function stopAudio(): { stopped: boolean; base64: string; droppedBytes: number } {
  const stopped = capture !== null
  release()
  return { stopped, ...takeFromRing(BRIDGE_AUDIO_RING_MAX_BYTES) }
}
