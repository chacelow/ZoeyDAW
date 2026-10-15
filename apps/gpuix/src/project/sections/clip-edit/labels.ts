import type { AUDIO_WARP_MODES } from "@/project/model/audio-editor"

/** Every visible or announced string of the Clip editor; the composition root supplies one locale. */
export interface ClipEditorLabels {
  readonly clipEditor: string
  readonly close: string
  readonly rename: string
  readonly kind: { readonly audio: string; readonly midi: string; readonly pattern: string }
  readonly step: string
  readonly midi: MidiEditorLabels
  readonly audio: AudioEditorLabels
}

export interface MidiEditorLabels {
  readonly pianoRoll: string
  readonly fold: string
  readonly draw: string
  readonly timeZoom: string
  readonly pitchZoom: string
  readonly zoomOutTime: string
  readonly zoomInTime: string
  readonly zoomOutPitch: string
  readonly zoomInPitch: string
  readonly gridStep: string
  readonly selected: string
  readonly audition: string
  readonly sourceWindow: string
  readonly loopBars: string
  readonly loopBoundary: string
  readonly velocity: string
  readonly velocityLane: string
}

export interface AudioEditorLabels {
  readonly title: string
  readonly source: string
  readonly sample: string
  readonly emptySource: string
  readonly unknownWaveform: string
  readonly start: string
  readonly end: string
  readonly gain: string
  readonly fadeIn: string
  readonly fadeOut: string
  readonly warp: string
  readonly warpMode: string
  readonly sourceBpm: string
  readonly transpose: string
  readonly detune: string
  readonly semitones: string
  readonly cents: string
  readonly reverse: string
  readonly loop: string
  readonly loopPosition: string
  readonly loopLength: string
  readonly loopWindow: string
  readonly loopWindowOff: string
  readonly loopStart: string
  readonly loopEnd: string
  readonly sourceStart: string
  readonly sourceEnd: string
  readonly fadeInMarker: string
  readonly fadeOutMarker: string
  readonly waveform: string
  readonly overview: string
  readonly musicalRuler: string
  readonly timeRuler: string
  readonly zoomIn: string
  readonly zoomOut: string
  readonly fit: string
  readonly zoom: string
  readonly panLeft: string
  readonly panRight: string
  readonly selection: string
  readonly modes: Readonly<Record<(typeof AUDIO_WARP_MODES)[number], string>>
}
