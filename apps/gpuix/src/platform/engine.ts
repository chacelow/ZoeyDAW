import { readPeaksAtBars } from "@zoeydaw/native"

export {
  openSession,
  apply,
  subscribeTelemetry,
  dispose,
  readPeaks,
  readPeaksAtBars,
  sourceInfo,
  type SourceInfo,
} from "@zoeydaw/native"

/** Composition-contract waveform reader; layout matches `readPeaks`. */
export type PeakReader = (
  sourceId: string,
  startBar: number,
  endBar: number,
  pixels: number,
  contentOffsetBars: number
) => Float32Array

/** Bar→frame conversion and looping run in the engine on the applied project tempo. */
export function musicalPeakReader(session: number): PeakReader {
  return (sourceId, startBar, endBar, pixels, contentOffsetBars) =>
    readPeaksAtBars(session, sourceId, startBar, endBar, pixels, contentOffsetBars)
}
