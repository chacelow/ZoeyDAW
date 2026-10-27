import {
  readWaveformHeader,
  WAVEFORM_HEADER_BYTES,
  WAVEFORM_KIND_SAMPLES,
  WAVEFORM_KIND_ENVELOPE,
  WAVEFORM_MAGIC,
  WAVEFORM_VERSION,
  WAVEFORM_MAX_PAYLOAD_BYTES,
} from "./realtime/protocol.generated"
import type { WaveformRange, WaveformRangeRequest } from "./waveform-range"

export function decodeWaveformRange(input: unknown, request: WaveformRangeRequest): WaveformRange {
  if (
    !(input instanceof ArrayBuffer) ||
    input.byteLength < WAVEFORM_HEADER_BYTES ||
    input.byteLength > WAVEFORM_HEADER_BYTES + WAVEFORM_MAX_PAYLOAD_BYTES
  )
    throw new Error("Invalid waveform binary response size")
  const view = new DataView(input)
  const header = readWaveformHeader(view)
  const { kind, channels, valuesPerChannel, framesPerBin, sampleRate, payloadBytes } = header
  const totalFrames = Number(header.totalFrames)
  const startFrame = Number(header.startFrame)
  const frameCount = Number(header.frameCount)
  const samples = kind === WAVEFORM_KIND_SAMPLES
  const expectedFrames = Math.min(request.frameCount, totalFrames - request.startFrame)
  if (
    header.magic !== WAVEFORM_MAGIC ||
    header.version !== WAVEFORM_VERSION ||
    header.headerBytes !== WAVEFORM_HEADER_BYTES ||
    header.reserved !== 0 ||
    (!samples && kind !== WAVEFORM_KIND_ENVELOPE) ||
    channels < 1 ||
    channels > 64 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isSafeInteger(totalFrames) ||
    totalFrames < 1 ||
    !Number.isSafeInteger(startFrame) ||
    startFrame !== request.startFrame ||
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    frameCount !== expectedFrames ||
    framesPerBin !== request.framesPerBin ||
    samples !== (framesPerBin === 1) ||
    valuesPerChannel !== Math.ceil(frameCount / framesPerBin) ||
    (samples
      ? valuesPerChannel > 8192 || valuesPerChannel > request.columns * 2
      : valuesPerChannel > request.columns) ||
    payloadBytes !== channels * valuesPerChannel * (samples ? 1 : 2) * 4 ||
    input.byteLength !== WAVEFORM_HEADER_BYTES + payloadBytes
  )
    throw new Error("Native waveform binary response does not match its request")
  let offset = WAVEFORM_HEADER_BYTES
  const plane = () => {
    const values: number[] = []
    for (let index = 0; index < valuesPerChannel; index++) {
      const value = view.getFloat32(offset, true)
      if (!Number.isFinite(value)) throw new Error("Non-finite waveform sample")
      values.push(value)
      offset += 4
    }
    return values
  }
  const metadata = { sampleRate, totalFrames, startFrame, frameCount }
  if (samples)
    return { ...metadata, kind: "samples", channels: Array.from({ length: channels }, plane) }
  return {
    ...metadata,
    kind: "envelope",
    framesPerBin,
    channels: Array.from({ length: channels }, () => {
      const min = plane()
      const max = plane()
      if (min.some((value, index) => value > max[index]))
        throw new Error("Unordered waveform extrema")
      return { min, max }
    }),
  }
}
