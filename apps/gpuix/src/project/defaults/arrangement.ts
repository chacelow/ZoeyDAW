import { PREFERENCE_DEFAULTS } from "./preferences"

export const ARRANGEMENT_DEFAULTS = {
  zoom: {
    unmeasuredMinPxPerBar: 1,
    minZoomTimelineRatio: 1,
    stepInFactor: 1.25,
    stepOutFactor: 0.8,
    stepAnchorRatio: 0.5,
    wheelPixelsPerExponent: 260,
    minimapPixelsPerExponent: 100,
    minimapPanScale: 0.25,
    minimapEdgeHitPixels: 6,
  },
  follow: {
    manualPanPauseMs: 2000,
    triggerRatio: 0.5,
    anchorRatio: 0.5,
  },
  autoScroll: {
    maxElapsedMs: 48,
    horizontalPixelsPerMs: 0.75,
    verticalPixelsPerMs: 0.6,
  },
  pointer: {
    dragThresholdPixels: PREFERENCE_DEFAULTS.pointer.dragThresholdPixels,
  },
  automation: {
    freehandSamplePixels: 3,
  },
  meter: {
    minDb: -60,
    maxDb: 6,
    holdMs: 600,
    fallDbPerSecond: 24,
  },
  keyboard: {
    markerNudgeBars: 1 / 16,
    velocityStep: 10,
  },
} as const

export type ArrangementPolicy = {
  readonly [Group in keyof typeof ARRANGEMENT_DEFAULTS]: {
    readonly [Key in keyof (typeof ARRANGEMENT_DEFAULTS)[Group]]: number
  }
}
