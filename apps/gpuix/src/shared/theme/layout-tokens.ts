import { CONTROL_METRICS, PROJECT_METRICS } from "./metrics/config"
import type { ControlMetrics, ProjectMetrics } from "./metrics/config"

/** Resolved geometry shared by rendering, hit testing, scrolling and resize. */
export interface TrackGeometry {
  readonly controlHeight: number
  readonly spacing: number
  readonly border: number
  readonly collapsedHeight: number
  readonly titleHeight: number
  readonly defaultHeight: number
  readonly mainHeight: number
  readonly maxHeight: number
  readonly resizeStep: number
  readonly revealThreshold: number
  readonly controlsWidth: number
}

export interface LayoutTokens {
  readonly project: {
    readonly panels: {
      readonly browserDefaultSize: number | `${number}%`
      readonly browserMaxSize: number | `${number}%`
      readonly arrangementMinWidth: number | `${number}%`
      readonly clipDefaultSize: number | `${number}%`
      readonly clipMinSize: number | `${number}%`
      readonly clipMaxSize: number | `${number}%`
    }
  }
  readonly home: { readonly maxWidth: number; readonly recentCardWidth: number }
  readonly gallery: { readonly cardWidth: number; readonly settingsPreviewWidth: number }
  readonly clipEditor: { readonly colorSwatchSize: number; readonly nameWidth: number }
  readonly scrollArea: { readonly defaultHeight: number }
  readonly track: TrackGeometry
  readonly arrangement: {
    readonly markerRulerHeight: number
    readonly loopRulerHeight: number
    readonly timeRulerHeight: number
    readonly barRulerHeight: number
    readonly minimapClipInset: number
    readonly automationPointRadius: number
    readonly rulerLabelSpacing: {
      readonly subdivision: number
      readonly beat: number
      readonly bar: number
    }
    readonly gridMinSubdivisionWidth: number
    readonly clip: {
      readonly minWidth: number
      readonly minHeight: number
      readonly verticalInset: number
      readonly bodyThresholdInset: number
      readonly fadeHandleMargin: number
      readonly nameEditorLeftInset: number
      readonly nameEditorRightInset: number
    }
    readonly hit: {
      readonly clipResizeEdge: number
      readonly clipFadeHandle: number
      readonly automationPointX: number
      readonly automationPointY: number
      readonly automationSegmentMax: number
      readonly automationSegmentHeightFraction: number
      readonly automationNear: number
      readonly rulerMarker: number
      readonly rulerLoopEdge: number
    }
  }
}

/** Default relationships are resolved here, never independently at a consumer. */
export function createLayoutTokens(control: ControlMetrics, project: ProjectMetrics): LayoutTokens {
  const controlHeight = control["--spacing-control-track"]
  const spacing = control["--spacing-control-track-gap"]
  const titleHeight = controlHeight + spacing * 2
  const resizeStep = controlHeight + spacing
  const markerRulerHeight = 17
  const loopRulerHeight = 17
  return {
    project: {
      panels: {
        browserDefaultSize: "25%",
        browserMaxSize: "50%",
        arrangementMinWidth: "30%",
        clipDefaultSize: "40%",
        clipMinSize: "20%",
        clipMaxSize: "70%",
      },
    },
    home: { maxWidth: 912, recentCardWidth: 304 },
    gallery: { cardWidth: 304, settingsPreviewWidth: 608 },
    clipEditor: { colorSwatchSize: spacing * 2, nameWidth: project.identityWidth * 2 },
    scrollArea: { defaultHeight: controlHeight * 20 },
    track: {
      controlHeight,
      spacing,
      border: project.trackBorder,
      titleHeight,
      collapsedHeight: titleHeight + project.trackBorder,
      defaultHeight: project.defaultTrackHeight,
      mainHeight: 108,
      maxHeight: project.maxTrackHeight,
      resizeStep,
      revealThreshold: resizeStep / 2,
      controlsWidth: 304,
    },
    arrangement: {
      markerRulerHeight,
      loopRulerHeight,
      timeRulerHeight: 18,
      barRulerHeight: markerRulerHeight + loopRulerHeight,
      minimapClipInset: 1,
      automationPointRadius: 4,
      rulerLabelSpacing: { subdivision: 38, beat: 56, bar: 56 },
      gridMinSubdivisionWidth: 2,
      clip: {
        minWidth: 2,
        minHeight: 4,
        verticalInset: 1,
        bodyThresholdInset: 4,
        fadeHandleMargin: 3,
        nameEditorLeftInset: 1,
        nameEditorRightInset: 2,
      },
      hit: {
        clipResizeEdge: 6,
        clipFadeHandle: 7,
        automationPointX: 6,
        automationPointY: 7,
        automationSegmentMax: 14,
        automationSegmentHeightFraction: 0.125,
        automationNear: 4,
        rulerMarker: 9,
        rulerLoopEdge: 5,
      },
    },
  }
}

export const DEFAULT_LAYOUT_TOKENS = createLayoutTokens(CONTROL_METRICS.default, PROJECT_METRICS)
