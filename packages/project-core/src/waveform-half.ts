const storage = new Float32Array(1)
const bits = new Uint32Array(
  storage.buffer,
  storage.byteOffset,
  storage.byteLength / Uint32Array.BYTES_PER_ELEMENT
)

export function waveformPeakValue(value: number): number {
  storage[0] = value
  const word = bits[0]
  const sign = word >>> 31 ? -1 : 1
  const exponent = ((word >>> 23) & 255) - 127
  if (exponent < -24) return 0
  if (exponent < -14) {
    const mantissa = (word & 0x7fffff) | 0x800000
    return sign * Math.floor(mantissa / 2 ** (-exponent - 1)) * 2 ** -24
  }
  if (exponent > 15) return sign * Infinity
  return sign * (1 + ((word >>> 13) & 1023) / 1024) * 2 ** exponent
}

export function waveformPeakBase(totalFrames: number): number {
  return totalFrames >= 33554432 ? 512 : totalFrames >= 16777216 ? 256 : 128
}
