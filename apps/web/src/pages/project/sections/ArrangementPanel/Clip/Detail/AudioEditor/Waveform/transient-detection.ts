export function detectWaveformTransients(
  peaks: readonly number[],
  durationSeconds: number
): number[] {
  if (peaks.length < 3 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return []
  const group = Math.max(1, Math.ceil((0.01 * peaks.length) / durationSeconds))
  const envelope: number[] = []
  for (let start = 0; start < peaks.length; start += group) {
    let peak = 0
    for (let index = start; index < Math.min(peaks.length, start + group); index++)
      peak = Math.max(peak, peaks[index])
    envelope.push(peak)
  }
  const result: number[] = []
  let baseline = 0
  let last = -Infinity
  for (let index = 1; index + 1 < envelope.length; index++) {
    const current = envelope[index]
    const seconds = (index * group * durationSeconds) / peaks.length
    if (
      current >= 0.01 &&
      current > baseline * 2 &&
      current > envelope[index - 1] &&
      current >= envelope[index + 1] &&
      seconds - last >= 0.1
    ) {
      result.push(seconds)
      last = seconds
      if (result.length === 256) break
    }
    baseline = baseline * 0.95 + current * 0.05
  }
  return result
}
