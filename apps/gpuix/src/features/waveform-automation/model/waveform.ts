/**
 * Fake waveform peak synthesis. gpuix has no audio engine, so every peak
 * array here is a sine-plus-noise stand-in for what a real decoder would
 * hand the renderer later; the rendering contract (array of 0..1 peak
 * magnitudes) is what matters for this slice, not the source audio.
 */

export interface WaveformSynthesisOptions {
  /** Number of peak bars to produce. */
  sampleCount?: number
  /** Deterministic seed so a given clip renders the same fake waveform twice. */
  seed?: number
  /** Number of sine cycles across the full sample range. */
  frequency?: number
  /** Random jitter mixed into the sine, as a fraction of full scale. */
  noiseAmount?: number
}

/** Small deterministic PRNG so synthesized peaks are reproducible per seed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Produces a plausible fake waveform: a sine carrier shaped by a bell
 * envelope (so it looks like a real transient instead of a flat tone) with
 * noise mixed in, clamped to the 0..1 peak-magnitude range every renderer
 * in this slice expects.
 */
export function synthesizeWaveformPeaks(options: WaveformSynthesisOptions = {}): number[] {
  const { sampleCount = 96, seed = 1, frequency = 3, noiseAmount = 0.25 } = options
  const next = mulberry32(seed)
  const peaks: number[] = []
  for (let index = 0; index < sampleCount; index++) {
    const t = sampleCount > 1 ? index / (sampleCount - 1) : 0
    const carrier = Math.sin(t * Math.PI * 2 * frequency)
    const envelope = 0.35 + 0.65 * Math.sin(t * Math.PI)
    const noise = (next() * 2 - 1) * noiseAmount
    const magnitude = Math.min(1, Math.max(0, Math.abs(carrier * envelope + noise)))
    peaks.push(magnitude)
  }
  return peaks
}
