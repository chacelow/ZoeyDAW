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
  readonly dialog: { readonly confirmationWidth: number }
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
      readonly warningStop: number
    }
  }
  readonly dragPad: {
    readonly fillOpacity: number
    readonly centerMarker: { readonly inset: number; readonly width: number }
    readonly caretWidth: number
  }
  readonly progress: { readonly indeterminateOpacity: number; readonly widthFraction: number }
  readonly motion: { readonly tabs: { readonly duration: number; readonly easing: MotionEasing } }
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
  readonly icon: { readonly strokeWidth: number }
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
  dialog: { confirmationWidth: 304 },
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
    meter: { channelGap: 1, peakWidth: 1, zeroWidth: 1, warningStop: 0.3 },
  },
  dragPad: { fillOpacity: 0.3, centerMarker: { inset: 2, width: 1 }, caretWidth: 1 },
  progress: { indeterminateOpacity: 0.5, widthFraction: 0.3 },
  motion: { tabs: { duration: 0.16, easing: "easeOut" } },
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
  icon: { strokeWidth: 2 },
}
