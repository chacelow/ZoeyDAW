import { PREFERENCE_DEFAULTS } from "./preferences"

/** Editing policies for new Arrangement sessions; persisted viewport values remain project data. */
export const ARRANGEMENT_DEFAULTS = {
  zoom: {
    /** Pixels per bar; finite and > 0. */
    unmeasuredMinPxPerBar: 1,
    /** Timeline-extent multiplier for minimum fit zoom; finite and > 0. */
    minZoomTimelineRatio: 1,
    /** Dimensionless zoom-in multiplier; finite and > 1. */
    stepInFactor: 1.25,
    /** Dimensionless zoom-out multiplier; finite and in (0, 1). */
    stepOutFactor: 0.8,
    /** Horizontal viewport ratio; finite and in [0, 1]. */
    stepAnchorRatio: 0.5,
    /** Wheel pixels per exponential zoom unit; finite and > 0. */
    wheelPixelsPerExponent: 260,
    /** Minimap vertical pixels per exponential zoom unit; finite and > 0. */
    minimapPixelsPerExponent: 100,
    /** Minimap horizontal projection multiplier; finite and >= 0. */
    minimapPanScale: 0.25,
    /** Minimap resize-edge hit slop in pixels; finite and > 0. */
    minimapEdgeHitPixels: 6,
  },
  follow: {
    /** Milliseconds; finite and >= 0. */
    manualPanPauseMs: 2000,
    /** Horizontal viewport ratio that triggers following; finite and in [0, 1]. */
    triggerRatio: 0.5,
    /** Horizontal viewport ratio at which following places the playhead; finite and in [0, 1]. */
    anchorRatio: 0.5,
  },
  autoScroll: {
    /** Maximum elapsed milliseconds consumed per frame; finite and > 0. */
    maxElapsedMs: 48,
    /** Horizontal pixels per millisecond; finite and >= 0. */
    horizontalPixelsPerMs: 0.75,
    /** Vertical pixels per millisecond; finite and >= 0. */
    verticalPixelsPerMs: 0.6,
  },
  pointer: {
    /** Euclidean pointer travel in pixels; finite and >= 0. Shared pointer preference. */
    dragThresholdPixels: PREFERENCE_DEFAULTS.pointer.dragThresholdPixels,
  },
  automation: {
    /** Horizontal pixels per freehand sample; finite and > 0. */
    freehandSamplePixels: 3,
  },
  meter: {
    /** Display-floor decibels; finite and < 0. The display range includes zero dB. */
    minDb: -60,
    /** Display-headroom decibels; finite and >= 0. */
    maxDb: 6,
    /** Peak-hold milliseconds; finite and >= 0. */
    holdMs: 600,
    /** Peak decay in decibels per second; finite and > 0. */
    fallDbPerSecond: 24,
  },
  keyboard: {
    /** Unsnapped marker nudge in bars; finite and > 0. */
    markerNudgeBars: 1 / 16,
    /** MIDI velocity units per press; integer in [1, 127]. */
    velocityStep: 10,
  },
} as const

/** Numeric policy shape derived from the documented source above; external overrides are validated by settings. */
export type ArrangementPolicy = {
  readonly [Group in keyof typeof ARRANGEMENT_DEFAULTS]: {
    readonly [Key in keyof (typeof ARRANGEMENT_DEFAULTS)[Group]]: number
  }
}
