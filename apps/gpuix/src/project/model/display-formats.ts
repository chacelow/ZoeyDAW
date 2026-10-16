export type NumericKind =
  | "bpm"
  | "latency"
  | "db"
  | "integer"
  | "fade"
  | "sourceMarker"
  | "midi"
  | "ruler"
  | "zoom"
  | "viewport"

export interface DisplayFormats {
  number(value: number, kind: NumericKind): string
  parseNumber(text: string): number
  parseParameter(text: string, options?: { percentage?: boolean; step?: number }): number
  parameter(value: number, options?: { percentage?: boolean; step?: number }): string
  percent(valueFraction: number): string
  db(value: number): string
  audioGain(value: number): string
  parseDb(text: string): number
  pan(value: number): string
  parsePan(text: string): number
  meter(leftDb: number, rightDb: number): string
  sampleRate(hz: number): string
  latency(ms: number): string
  zoom(value: number): string
  duration(seconds: number, variant?: "ruler" | "transport"): string
  dateTime(timestamp: number): string
  accessiblePixels(px: number): string
  normalizeSearch(text: string): string
  musicalPosition(
    value: number,
    numerator: number,
    denominator: number,
    kind: "position" | "duration"
  ): string
  musicalWidthSamples(
    numerator: number,
    denominator: number,
    kind: "position" | "duration"
  ): string[]
  pitchName(pitch: number, octaveLabelOffset: number): string
  readonly widthSamples: Record<NumericKind | "pan" | "parameter" | "audioGain", string[]>
}
