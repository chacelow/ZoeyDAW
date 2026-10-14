export interface TransportLabels {
  readonly controls: string
  readonly toggleBrowser: string
  readonly back: string
  readonly link: string
  readonly tap: string
  readonly bpm: string
  readonly meter: string
  readonly numerator: string
  readonly denominator: string
  readonly scale: string
  readonly shortLengths: string
  readonly longLengths: string
  readonly scaleRoot: string
  readonly scaleMode: string
  readonly groove: string
  readonly barLength: string
  readonly follow: string
  readonly position: string
  readonly bar: string
  readonly beat: string
  readonly sixteenth: string
  readonly play: string
  readonly pause: string
  readonly stop: string
  readonly rewind: string
  readonly record: string
  readonly loop: string
  readonly drawMode: string
  readonly computerKeyboard: string
  readonly metronome: string
  readonly metronomeSilent: string
  readonly engine: string
  readonly unavailable: string
  readonly latency: string
  readonly cpu: string
  readonly scaleModes: Readonly<
    Record<
      | "major"
      | "minor"
      | "dorian"
      | "phrygian"
      | "lydian"
      | "mixolydian"
      | "locrian"
      | "harmonic-minor"
      | "melodic-minor"
      | "pentatonic",
      string
    >
  >
  readonly barLengths: Readonly<Record<"1-bar" | "2-bar" | "4-bar" | "8-bar" | "16-bar", string>>
  readonly time: string
}
