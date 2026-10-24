const kernels = new Map<number, readonly Float32Array[]>()
const tinyAngle = 0.00040283203125

function sinc(value: number): number {
  const angle = Math.PI * value
  return Math.abs(angle) < tinyAngle ? 1 - (angle * angle) / 6 : Math.sin(angle) / angle
}

function phaseKernels(level: number): readonly Float32Array[] {
  const cached = kernels.get(level)
  if (cached) return cached
  const phases: Float32Array[] = []
  const resolution = 2 ** level
  for (let phase = 1; phase < resolution; phase += 2) {
    const weights = new Float32Array(65)
    let sum = 0
    for (let tap = 0; tap <= 64; tap++) {
      const z = tap - 32 - phase / resolution
      const weight = Math.abs(z / 32) < 1 ? Math.fround(sinc(z / 32) * sinc(z)) : 0
      weights[tap] = weight
      sum = Math.fround(sum + weight)
    }
    for (let tap = 0; tap <= 64; tap++) weights[tap] = Math.fround(weights[tap] / sum)
    phases.push(weights)
  }
  kernels.set(level, phases)
  return phases
}

export function interpolateWaveform(
  firstFrame: number,
  endFrame: number,
  samplesPerPixel: number,
  sample: (frame: number) => number | null
): { frames: Float64Array; values: Float32Array } | null {
  const magnification = 1 / samplesPerPixel
  const logarithm = Math.log2(magnification)
  const level = Math.max(0, Math.min(7, Math.ceil(logarithm)))
  const resolution = 2 ** level
  const alpha = Math.max(0, Math.fround(level - logarithm))
  const first = Math.floor(firstFrame)
  const end = Math.ceil(endFrame)
  const count = (end - first) * resolution + 1
  const frames = new Float64Array(count)
  const values = new Float32Array(count)
  for (let index = 0; index < count; index++) frames[index] = first + index / resolution
  for (let frame = first; frame <= end; frame++) {
    const value = sample(frame)
    if (value === null) return null
    values[(frame - first) * resolution] = value
  }
  for (let current = 1; current <= level; current++) {
    const phases = phaseKernels(current)
    const stride = resolution / 2 ** current
    for (let frame = first; frame < end; frame++) {
      for (let phase = 0; phase < phases.length; phase++) {
        const kernel = phases[phase]
        let value = 0
        for (let tap = 0; tap <= 64; tap++) {
          const source = sample(frame + tap - 32)
          if (source === null) return null
          value = Math.fround(value + kernel[tap] * source)
        }
        const index = (frame - first) * resolution + (2 * phase + 1) * stride
        values[index] =
          current === level
            ? Math.fround(
                value + alpha * (Math.fround((values[index - 1] + values[index + 1]) * 0.5) - value)
              )
            : value
      }
    }
  }
  return { frames, values }
}
