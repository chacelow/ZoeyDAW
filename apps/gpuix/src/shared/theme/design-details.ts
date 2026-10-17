import { CONTROL_METRICS } from "@/shared/theme/metrics/config"
import type { motion, StyleDesc } from "@gpuix/react"
import type { ComponentProps } from "react"

type MotionEasing = NonNullable<
  NonNullable<ComponentProps<typeof motion.div>["transition"]>["ease"]
>

export interface DesignDetails {
  readonly trackCreationColors: Readonly<
    Record<"audio" | "midi" | "group" | "return" | "main", string>
  >
  readonly overlay: { readonly sideOffset: number; readonly collisionPadding: number }
  readonly dragPreview: {
    readonly maxWidth: number
    readonly gap: number
    readonly opacity: number
    readonly pointerOffset: { readonly x: number; readonly y: number }
  }
  readonly empty: {
    readonly gap: number
    readonly inset: number
    readonly radius: number
    readonly contentGap: number
    readonly headerMaxWidth: number
  }
  readonly loading: {
    readonly brandWidth: number
    readonly brandHeight: number
    readonly gap: number
    readonly progressWidth: number
  }
  readonly toast: {
    readonly edgeInset: number
    readonly stackGap: number
    readonly inset: number
    readonly radius: number
    readonly width: number
  }
  readonly states: {
    readonly disabledOpacity: number
    readonly dragSourceOpacity: number
    readonly deviceDragSourceOpacity: number
  }
  readonly feedback: {
    readonly maxWidth: number
    readonly gap: number
    readonly inset: number
    readonly actionGap: number
  }
  readonly dialog: { readonly confirmationWidth: number; readonly formWidth: number }
  readonly editor: {
    readonly dividerStrokeWidth: number
    readonly loopStrokeWidth: number
    readonly selectionStrokeWidth: number
    readonly gridMinorStrokeWidth: number
    readonly fadeStrokeWidth: number
    readonly playheadLineWidth: number
    readonly insertionLineWidth: number
    readonly selectionLineWidth: number
    readonly markerLineWidth: number
    readonly loopLineWidth: number
    readonly velocityLineWidth: number
    readonly waveformAxisOpacity: number
    readonly clipGhostOpacity: number
    readonly rangeOpacity: number
    readonly groupClipPreviewOpacity: number
    readonly drawPreviewOpacity: number
    readonly clipLoopShadeOpacity: number
    readonly midiLoopOpacity: number
    readonly clipBodySelectedOpacity: number
    readonly clipBodyAutomationOpacity: number
    readonly clipBodyOpacity: number
    readonly clipGridHoveredOpacity: number
    readonly clipGridOpacity: number
    readonly clipAutomationPreviewOpacity: number
    readonly inlineRadius: number
    readonly noteInset: number
    readonly meter: {
      readonly channelGap: number
      readonly peakWidth: number
      readonly zeroWidth: number
      readonly peakOpacity: number
      /** Live body gradient: clip colour at 0 dB → warn at `warnDb` → good at `goodDb`. */
      readonly warnDb: number
      readonly goodDb: number
      readonly trackWidthUnits: number
      readonly collapsedWidthUnits: number
      readonly inlineWidthUnits: number
      readonly inlineHeightUnits: number
      readonly mixerWidthUnits: number
      readonly mixerHeightUnits: number
      readonly shortMixerHeightUnits: number
      readonly tickWidth: number
      readonly tickGap: number
      /** Bar height (units) at which left ticks appear. */
      readonly ticksMinHeightUnits: number
      /** Bar height (units) at which right dB numbers appear (mixer only). */
      readonly numbersMinHeightUnits: number
      readonly numberWidthUnits: number
      readonly readoutHeightUnits: number
      readonly readoutGap: number
      readonly readoutRadius: number
      readonly readoutDecimals: number
      readonly clipDb: number
      /** Clip band stays at least this tall (px) so short meters still show red. */
      readonly clipMinHeight: number
      readonly scale: readonly { readonly db: number; readonly position: number }[]
    }
  }
  readonly dragPad: {
    readonly fillOpacity: number
    readonly centerMarker: { readonly inset: number; readonly width: number }
    readonly caretWidth: number
  }
  readonly grid: {
    readonly buttonWidthUnits: number
    readonly numericWidthUnits: number
    readonly labelWidthUnits: number
    readonly knobTextUnits: number
    readonly segmentWidthUnits: number
    readonly mixerWidthUnits: number
    readonly deviceWidthUnits: number
    readonly headerHeightUnits: number
    readonly previewUnits: readonly number[]
  }
  readonly fader: {
    readonly lengthUnits: number
    readonly scaleWidthUnits: number
    readonly meterWidthUnits: number
    readonly handleWidthUnits: number
    readonly handleGapUnits: number
    readonly triangleWidthRatio: number
    readonly triangleHeightRatio: number
  }
  readonly treeRow: { readonly indent: number }
  readonly list: { readonly rowGap: number }
  readonly switch: { readonly widthRatio: number; readonly thumbInset: number }
  readonly knob: {
    readonly diameterRatio: number
    readonly sweepDegrees: number
    readonly strokeWidth: number
    readonly indicatorWidth: number
  }
  readonly progress: { readonly indeterminateOpacity: number; readonly widthFraction: number }
  readonly motion: {
    readonly dockHoverCloseDelayMs: number
    readonly tabs: { readonly duration: number; readonly easing: MotionEasing }
    readonly switch: { readonly duration: number; readonly easing: MotionEasing }
  }
  readonly cursors: {
    readonly default: StyleDesc["cursor"]
    readonly action: StyleDesc["cursor"]
    readonly disabled: StyleDesc["cursor"]
    readonly text: StyleDesc["cursor"]
    readonly grab: StyleDesc["cursor"]
    readonly grabbing: StyleDesc["cursor"]
    readonly verticalResize: StyleDesc["cursor"]
    readonly horizontalResize: StyleDesc["cursor"]
    readonly columnResize: StyleDesc["cursor"]
    readonly rowResize: StyleDesc["cursor"]
    readonly automationDraw: StyleDesc["cursor"]
    readonly fadeCurve: StyleDesc["cursor"]
  }
  readonly icon: { readonly strokeWidth: number; readonly hoverGrowth: number }
}

const DEFAULT_TRACK_COLOR = "oklch(0.65 0.18 230)"

export const DEFAULT_DESIGN_DETAILS: DesignDetails = {
  trackCreationColors: {
    audio: DEFAULT_TRACK_COLOR,
    midi: DEFAULT_TRACK_COLOR,
    group: "oklch(0.65 0.17 265)",
    return: DEFAULT_TRACK_COLOR,
    main: "var(--chart-3)",
  },
  overlay: { sideOffset: 4, collisionPadding: 8 },
  dragPreview: { maxWidth: 320, gap: 8, opacity: 0.85, pointerOffset: { x: 12, y: 12 } },
  toast: { edgeInset: 12, stackGap: 8, inset: 12, radius: 8, width: 304 },
  empty: { gap: 16, inset: 24, radius: 12, contentGap: 8, headerMaxWidth: 304 },
  loading: { gap: 12, brandWidth: 60, brandHeight: 39, progressWidth: 304 },
  states: { disabledOpacity: 0.5, dragSourceOpacity: 0.4, deviceDragSourceOpacity: 0.5 },
  feedback: { maxWidth: 304, gap: 12, inset: 24, actionGap: 8 },
  dialog: { confirmationWidth: 304, formWidth: 440 },
  editor: {
    dividerStrokeWidth: 1,
    loopStrokeWidth: 1,
    selectionStrokeWidth: 1,
    gridMinorStrokeWidth: 1,
    fadeStrokeWidth: 1,
    playheadLineWidth: 1,
    insertionLineWidth: 1,
    selectionLineWidth: 1,
    markerLineWidth: 1,
    loopLineWidth: 1,
    velocityLineWidth: 1,
    waveformAxisOpacity: 0.4,
    clipGhostOpacity: 0.5,
    rangeOpacity: 0.5,
    groupClipPreviewOpacity: 0.85,
    drawPreviewOpacity: 0.2,
    clipLoopShadeOpacity: 0.1,
    midiLoopOpacity: 0.35,
    clipBodySelectedOpacity: 0.9,
    clipBodyAutomationOpacity: 0.25,
    clipBodyOpacity: 0.55,
    clipGridHoveredOpacity: 0.3,
    clipGridOpacity: 0.4,
    clipAutomationPreviewOpacity: 0.4,
    inlineRadius: 0,
    noteInset: 1,
    meter: {
      channelGap: 1,
      peakWidth: 1,
      zeroWidth: 1,
      peakOpacity: 0.35,
      warnDb: -9,
      goodDb: -17.5,
      trackWidthUnits: 1,
      collapsedWidthUnits: 0.5,
      inlineWidthUnits: 0.5,
      inlineHeightUnits: 1,
      mixerWidthUnits: 1,
      mixerHeightUnits: 21,
      shortMixerHeightUnits: 5,
      tickWidth: 3,
      tickGap: 2,
      ticksMinHeightUnits: 4,
      numbersMinHeightUnits: 8,
      numberWidthUnits: 1.2,
      readoutHeightUnits: 1.5,
      readoutGap: 3,
      readoutRadius: 3,
      readoutDecimals: 1,
      clipDb: 0,
      clipMinHeight: 3,
      scale: [
        { db: 6, position: 0 },
        { db: 0, position: 0.1 },
        { db: -6, position: 0.199 },
        { db: -12, position: 0.299 },
        { db: -18, position: 0.398 },
        { db: -24, position: 0.498 },
        { db: -30, position: 0.598 },
        { db: -36, position: 0.685 },
        { db: -42, position: 0.761 },
        { db: -48, position: 0.829 },
        { db: -54, position: 0.888 },
        { db: -60, position: 0.944 },
        { db: -120, position: 1 },
      ],
    },
  },
  dragPad: { fillOpacity: 0.55, centerMarker: { inset: 2, width: 1 }, caretWidth: 1 },
  grid: {
    buttonWidthUnits: 4,
    numericWidthUnits: 3,
    labelWidthUnits: 8,
    knobTextUnits: 2,
    segmentWidthUnits: 2,
    mixerWidthUnits: 8,
    deviceWidthUnits: 20,
    headerHeightUnits: 2,
    previewUnits: [1, 2, 3],
  },
  fader: {
    lengthUnits: 8,
    scaleWidthUnits: 2,
    meterWidthUnits: 0.5,
    handleWidthUnits: 1,
    handleGapUnits: 0,
    triangleWidthRatio: 0.6,
    triangleHeightRatio: 0.6,
  },
  treeRow: { indent: 12 },
  list: { rowGap: CONTROL_METRICS.default["--spacing-control-track-gap"] },
  switch: { widthRatio: 2, thumbInset: 2 },
  knob: { diameterRatio: 2, sweepDegrees: 300, strokeWidth: 2, indicatorWidth: 1.5 },
  progress: { indeterminateOpacity: 0.5, widthFraction: 0.3 },
  motion: {
    dockHoverCloseDelayMs: 300,
    tabs: { duration: 0.16, easing: "easeOut" },
    switch: { duration: 0.16, easing: "easeOut" },
  },
  cursors: {
    default: "default",
    action: "pointer",
    disabled: "not-allowed",
    text: "text",
    grab: "grab",
    grabbing: "grabbing",
    verticalResize: "ns-resize",
    horizontalResize: "ew-resize",
    columnResize: "col-resize",
    rowResize: "row-resize",
    automationDraw: "crosshair",
    fadeCurve: "move",
  },
  icon: { strokeWidth: 2, hoverGrowth: 2 },
}
