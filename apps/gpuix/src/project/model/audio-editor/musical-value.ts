export type AudioMusicalValueKind = "position" | "duration"

export function formatAudioMusicalValue(
  value: number,
  numerator: number,
  denominator: number,
  kind: AudioMusicalValueKind
): string {
  const sixteenthsPerBeat = 16 / denominator
  const subdivisions = numerator * sixteenthsPerBeat
  if (!Number.isSafeInteger(Math.floor(value * subdivisions))) return String(value)
  const total = Math.round(value * subdivisions * 1e10) / 1e10
  const bars = Math.floor(total / subdivisions)
  const remaining = total - bars * subdivisions
  const beats = Math.floor(remaining / sixteenthsPerBeat)
  const sixteenths = remaining - beats * sixteenthsPerBeat
  const base = kind === "position" ? 1 : 0
  const thirdRaw = (sixteenths + base).toFixed(10)
  const third = thirdRaw.includes(".") ? thirdRaw.replace(/0+$/, "").replace(/\.$/, "") : thirdRaw
  return `${bars + base}.${beats + base}.${third}`
}

export function parseAudioMusicalValue(
  raw: string,
  numerator: number,
  denominator: number,
  kind: AudioMusicalValueKind,
  min: number,
  max: number
): number {
  if (
    !Number.isInteger(numerator) ||
    numerator < 1 ||
    !Number.isInteger(denominator) ||
    denominator < 1 ||
    !Number.isInteger(Math.log2(denominator))
  )
    return Number.NaN
  const sixteenthsPerBeat = 16 / denominator
  const text = raw.trim()
  const musical = /^(\d+)\.(\d+)\.(\d+(?:\.\d+)?)$/.exec(text)
  let value: number
  if (musical) {
    const bars = Number(musical[1])
    const beats = Number(musical[2])
    const sixteenths = Number(musical[3])
    const base = kind === "position" ? 1 : 0
    if (
      !Number.isSafeInteger(bars) ||
      bars < base ||
      beats < base ||
      beats >= numerator + base ||
      sixteenths < base ||
      sixteenths >= sixteenthsPerBeat + base
    )
      return Number.NaN
    value = bars - base + (beats - base + (sixteenths - base) / sixteenthsPerBeat) / numerator
  } else {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return Number.NaN
    value = Number(text)
  }
  return Number.isFinite(value) && value >= min && value <= max ? value : Number.NaN
}
