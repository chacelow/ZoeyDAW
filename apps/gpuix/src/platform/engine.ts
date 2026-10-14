import {
  openSession,
  apply,
  subscribeTelemetry,
  dispose,
  readPeaks,
  sourceInfo,
  type SourceInfo,
} from "@zoeydaw/native"

export { openSession, apply, subscribeTelemetry, dispose, readPeaks, sourceInfo, type SourceInfo }

export type PeakReader = (
  sourceId: string,
  startBar: number,
  endBar: number,
  pixels: number,
  contentOffsetBars?: number
) => Float32Array

export interface MusicalProjectContext {
  bpm: number
  numerator: number
  denominator: number
}

export function musicalPeakReader(session: number, project: MusicalProjectContext): PeakReader {
  return (
    sourceId: string,
    startBar: number,
    endBar: number,
    pixels: number,
    contentOffsetBars = 0
  ): Float32Array => {
    if (!Number.isFinite(pixels) || pixels <= 0) {
      return new Float32Array(0)
    }

    const roundedPixels = Math.floor(pixels)
    if (!Number.isFinite(startBar) || !Number.isFinite(endBar) || endBar <= startBar) {
      return new Float32Array(roundedPixels * 4)
    }

    const offsetBars = Number.isFinite(contentOffsetBars) ? contentOffsetBars : 0
    const { bpm, numerator, denominator } = project
    if (
      !Number.isFinite(bpm) ||
      bpm <= 0 ||
      !Number.isFinite(numerator) ||
      numerator <= 0 ||
      !Number.isFinite(denominator) ||
      denominator <= 0
    ) {
      return new Float32Array(roundedPixels * 4)
    }

    const barsPerSecond = (bpm * denominator) / (240 * numerator)
    if (!Number.isFinite(barsPerSecond) || barsPerSecond <= 0) {
      return new Float32Array(roundedPixels * 4)
    }

    let info: SourceInfo | null
    try {
      info = sourceInfo(session, sourceId)
    } catch {
      return new Float32Array(roundedPixels * 4)
    }

    if (!info || info.sampleRate <= 0 || info.frames <= 0) {
      return new Float32Array(roundedPixels * 4)
    }

    const sampleRate = info.sampleRate
    const totalFrames = Math.floor(info.frames)
    if (totalFrames <= 0) {
      return new Float32Array(roundedPixels * 4)
    }

    const rawStartFrame = Math.round(((startBar - 1 + offsetBars) / barsPerSecond) * sampleRate)
    const rawEndFrame = Math.round(((endBar - 1 + offsetBars) / barsPerSecond) * sampleRate)
    const frameSpan = rawEndFrame - rawStartFrame
    if (frameSpan <= 0) {
      return new Float32Array(roundedPixels * 4)
    }

    const loopedStart = ((rawStartFrame % totalFrames) + totalFrames) % totalFrames
    const result = new Float32Array(roundedPixels * 4)

    let framesHandled = 0
    let pixelsHandled = 0

    while (framesHandled < frameSpan && pixelsHandled < roundedPixels) {
      const currentStart = (loopedStart + framesHandled) % totalFrames
      const framesRemaining = frameSpan - framesHandled
      const chunkFrames = Math.min(framesRemaining, totalFrames - currentStart)
      const isLast = framesHandled + chunkFrames >= frameSpan
      const chunkPixels = isLast
        ? roundedPixels - pixelsHandled
        : Math.max(1, Math.round((chunkFrames / frameSpan) * roundedPixels))
      const actualChunkPixels = Math.min(chunkPixels, roundedPixels - pixelsHandled)
      if (actualChunkPixels <= 0) break

      try {
        const chunk = readPeaks(
          session,
          sourceId,
          currentStart,
          currentStart + chunkFrames,
          actualChunkPixels
        )
        const expectedChunkLen = actualChunkPixels * 4
        if (chunk && chunk.length >= expectedChunkLen) {
          const lSrc = chunk.subarray(0, actualChunkPixels * 2)
          result.set(lSrc, pixelsHandled * 2)
          const rSrc = chunk.subarray(actualChunkPixels * 2, actualChunkPixels * 4)
          result.set(rSrc, roundedPixels * 2 + pixelsHandled * 2)
        }
      } catch {
        // Unloaded or invalid frames yield silence; unwritten range remains 0.
      }

      framesHandled += chunkFrames
      pixelsHandled += actualChunkPixels
    }

    for (let i = 0; i < result.length; i++) {
      if (!Number.isFinite(result[i])) {
        result[i] = 0
      }
    }

    return result
  }
}
