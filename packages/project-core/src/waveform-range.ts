import { z } from "zod"
export { decodeWaveformRange } from "./waveform-range-wire"

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const binSize = z
  .number()
  .int()
  .min(1)
  .max(2 ** 31)
  .refine(value => Number.isInteger(Math.log2(value)), "Waveform bin size must be a power of two")

export const waveformRangeRequestSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .refine(path => !path.includes("\0")),
    startFrame: counter,
    frameCount: counter.positive(),
    columns: z.number().int().min(1).max(4096),
    framesPerBin: binSize,
  })
  .strict()
  .refine(
    value => value.startFrame % value.framesPerBin === 0,
    "Waveform range must align to its source bins"
  )

interface WaveformRangeMetadata {
  sampleRate: number
  totalFrames: number
  startFrame: number
  frameCount: number
}
export type WaveformRangeRequest = z.infer<typeof waveformRangeRequestSchema>
export type WaveformRange = WaveformRangeMetadata &
  (
    | { kind: "samples"; channels: number[][] }
    | { kind: "envelope"; framesPerBin: number; channels: { min: number[]; max: number[] }[] }
  )

export function waveformRangePlan(
  totalFrames: number,
  first: number,
  end: number,
  samplesPerPixel: number
): Omit<WaveformRangeRequest, "path">[] {
  if (end <= first || totalFrames <= 0) return []
  const framesPerBin = samplesPerPixel > 1 ? 2 ** Math.floor(Math.log2(samplesPerPixel)) : 1
  const center = (framesPerBin - 1) / 2
  const startFrame =
    framesPerBin === 1
      ? Math.max(0, Math.floor(first) - 32)
      : Math.max(0, 2 * Math.floor((first - center) / (2 * framesPerBin)) * framesPerBin)
  const endFrame = Math.min(
    totalFrames,
    framesPerBin === 1
      ? Math.ceil(end) + 33
      : (2 * Math.ceil((end - center) / (2 * framesPerBin)) + 2) * framesPerBin
  )
  const chunkFrames = framesPerBin === 1 ? 8192 : framesPerBin * 4096
  const requests: Omit<WaveformRangeRequest, "path">[] = []
  for (let start = startFrame; start < endFrame; start += chunkFrames) {
    const frameCount = Math.min(chunkFrames, endFrame - start)
    requests.push({
      startFrame: start,
      frameCount,
      framesPerBin,
      columns:
        framesPerBin === 1 ? Math.ceil(frameCount / 2) : Math.ceil(frameCount / framesPerBin),
    })
  }
  return requests
}
