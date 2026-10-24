import { z } from "zod"

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const finite = z.number().finite()
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

const waveformRangeFields = {
  sampleRate: finite.positive(),
  totalFrames: counter.positive(),
  startFrame: counter,
  frameCount: counter.positive(),
}
export const waveformRangeSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...waveformRangeFields,
        kind: z.literal("samples"),
        channels: z.array(z.array(finite).min(1).max(8192)).min(1).max(64),
      })
      .strict(),
    z
      .object({
        ...waveformRangeFields,
        kind: z.literal("envelope"),
        framesPerBin: binSize,
        channels: z
          .array(
            z
              .object({
                min: z.array(finite).min(1).max(4096),
                max: z.array(finite).min(1).max(4096),
              })
              .strict()
          )
          .min(1)
          .max(64),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.startFrame >= value.totalFrames ||
      value.frameCount > value.totalFrames - value.startFrame
    )
      context.addIssue({ code: "custom", message: "Waveform range exceeds its source" })
    if (
      value.kind === "envelope" &&
      (value.framesPerBin === 1 || value.startFrame % value.framesPerBin !== 0)
    )
      context.addIssue({
        code: "custom",
        message: "Waveform extrema must align to binary source bins",
      })
    for (const channel of value.channels) {
      if (Array.isArray(channel)) {
        if (channel.length !== value.frameCount)
          context.addIssue({ code: "custom", message: "Waveform samples must match frameCount" })
      } else if (
        value.kind === "envelope" &&
        (channel.min.length !== Math.ceil(value.frameCount / value.framesPerBin) ||
          channel.min.length !== channel.max.length ||
          channel.min.some((minimum, index) => minimum > channel.max[index]))
      ) {
        context.addIssue({
          code: "custom",
          message: "Waveform extrema must have paired ordered source bins",
        })
      }
    }
  })
export type WaveformRangeRequest = z.infer<typeof waveformRangeRequestSchema>
export type WaveformRange = z.infer<typeof waveformRangeSchema>

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
