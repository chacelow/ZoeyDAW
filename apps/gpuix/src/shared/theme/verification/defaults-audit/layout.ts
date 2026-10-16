import type { BaselineMetrics, Expectation } from "./types"

/** Baseline expressions are the pre-token consumers, not dependencies between new tokens. */
export function layoutExpectations(
  metrics: BaselineMetrics
): Readonly<Record<string, Expectation>> {
  const { control, project } = metrics
  const titleHeight = control.track + control.trackGap * 2
  const resizeStep = control.track + control.trackGap
  const markerRulerHeight = 17
  const loopRulerHeight = 17
  return {
    "project.panels.browserDefaultSize": {
      expression: "app/project/layout-constraints.ts PROJECT_LAYOUT.browserDefaultSize = '25%'",
      value: "25%",
    },
    "project.panels.browserMaxSize": {
      expression: "app/project/layout-constraints.ts PROJECT_LAYOUT.browserMaxSize = '50%'",
      value: "50%",
    },
    "project.panels.arrangementMinWidth": {
      expression: "app/project/layout-constraints.ts PROJECT_LAYOUT.arrangementMinWidth = '30%'",
      value: "30%",
    },
    "project.panels.clipDefaultSize": {
      expression: "app/project/layout-constraints.ts PROJECT_LAYOUT.clipDefaultSize = '40%'",
      value: "40%",
    },
    "project.panels.clipMinSize": {
      expression: "app/project/layout-constraints.ts PROJECT_LAYOUT.clipMinSize = '20%'",
      value: "20%",
    },
    "project.panels.clipMaxSize": {
      expression: "app/project/layout-constraints.ts PROJECT_LAYOUT.clipMaxSize = '70%'",
      value: "70%",
    },
    "home.maxWidth": {
      expression: "app/home/HomePage.tsx theme.project.controlsWidth * 3",
      value: project.controlsWidth * 3,
    },
    "home.recentCardWidth": {
      expression: "app/home/HomePage.tsx theme.project.controlsWidth",
      value: project.controlsWidth,
    },
    "gallery.cardWidth": {
      expression: "gallery/GalleryCard.tsx theme.project.controlsWidth",
      value: project.controlsWidth,
    },
    "gallery.settingsPreviewWidth": {
      expression: "gallery/states.tsx theme.project.controlsWidth * 2",
      value: project.controlsWidth * 2,
    },
    "track.controlHeight": {
      expression: "project/layout/track.ts CONTROL_METRICS.default['--spacing-control-track']",
      value: control.track,
    },
    "track.spacing": {
      expression: "project/layout/track.ts CONTROL_METRICS.default['--spacing-control-track-gap']",
      value: control.trackGap,
    },
    "track.border": {
      expression: "project/layout/track.ts PROJECT_METRICS.trackBorder",
      value: project.trackBorder,
    },
    "track.titleHeight": {
      expression: "project/layout/track.ts COLLAPSED_TRACK_HEIGHT - PROJECT_METRICS.trackBorder",
      value: titleHeight,
    },
    "track.collapsedHeight": {
      expression:
        "project/layout/track.ts TRACK_LAYOUT.controlHeight + TRACK_LAYOUT.spacing * 2 + PROJECT_METRICS.trackBorder",
      value: titleHeight + project.trackBorder,
    },
    "track.defaultHeight": {
      expression: "project/layout/track.ts PROJECT_METRICS.defaultTrackHeight",
      value: project.defaultTrackHeight,
    },
    "track.mainHeight": {
      expression: "project/stores/slices/document.ts Main heightPx: 108",
      value: 108,
    },
    "track.maxHeight": {
      expression: "project/layout/track.ts DEFAULT_TRACK_HEIGHT * 4",
      value: project.defaultTrackHeight * 4,
    },
    "track.resizeStep": {
      expression: "project/layout/track.ts TRACK_LAYOUT.controlHeight + TRACK_LAYOUT.spacing",
      value: resizeStep,
    },
    "track.revealThreshold": {
      expression: "project/layout/track.ts TRACK_RESIZE_STEP / 2",
      value: resizeStep / 2,
    },
    "track.controlsWidth": {
      expression: "shared/theme/metrics/control-metrics.json project.controlsWidth",
      value: project.controlsWidth,
    },
    "arrangement.markerRulerHeight": {
      expression: "project/sections/arrangement/core/layout.ts MARKER_RULER_HEIGHT = 17",
      value: markerRulerHeight,
    },
    "arrangement.loopRulerHeight": {
      expression: "project/sections/arrangement/core/layout.ts LOOP_RULER_HEIGHT = 17",
      value: loopRulerHeight,
    },
    "arrangement.timeRulerHeight": {
      expression: "project/sections/arrangement/core/layout.ts TIME_RULER_HEIGHT = 18",
      value: 18,
    },
    "arrangement.barRulerHeight": {
      expression:
        "project/sections/arrangement/core/layout.ts MARKER_RULER_HEIGHT + LOOP_RULER_HEIGHT",
      value: markerRulerHeight + loopRulerHeight,
    },
    "arrangement.automationPointRadius": {
      expression:
        "project/sections/arrangement/core/automation/geometry.ts AUTOMATION_POINT_RADIUS = 4",
      value: 4,
    },
    "arrangement.minimapClipInset": {
      expression: "project/sections/arrangement/timeline/minimap/Overview.tsx rowHeight - 1",
      value: 1,
    },
    "arrangement.rulerLabelSpacing.subdivision": {
      expression:
        "project/sections/arrangement/core/rulers/grid-lines.ts RULER_LABEL_SPACING.subdivision = 38",
      value: 38,
    },
    "arrangement.rulerLabelSpacing.beat": {
      expression:
        "project/sections/arrangement/core/rulers/grid-lines.ts RULER_LABEL_SPACING.beat = 56",
      value: 56,
    },
    "arrangement.rulerLabelSpacing.bar": {
      expression:
        "project/sections/arrangement/core/rulers/grid-lines.ts RULER_LABEL_SPACING.bar = 56",
      value: 56,
    },
    "arrangement.gridMinSubdivisionWidth": {
      expression: "project/sections/arrangement/core/rulers/grid-lines.ts cellPx >= 2",
      value: 2,
    },
    "arrangement.clip.minWidth": {
      expression:
        "project/sections/arrangement/core/clip-geometry.ts Math.max(2, Math.round(rect.width))",
      value: 2,
    },
    "arrangement.clip.minHeight": {
      expression:
        "project/sections/arrangement/core/clip-geometry.ts Math.max(4, Math.round(rect.height - 2))",
      value: 4,
    },
    "arrangement.clip.verticalInset": {
      expression: "project/sections/arrangement/core/clip-geometry.ts Math.round(rect.top + 1)",
      value: 1,
    },
    "arrangement.clip.bodyThresholdInset": {
      expression:
        "project/sections/arrangement/core/clip-geometry.ts height <= TRACK_TITLE_HEIGHT + 4",
      value: 4,
    },
    "arrangement.clip.fadeHandleMargin": {
      expression:
        "project/sections/arrangement/core/clip-geometry.ts Math.min(3, geometry.width / 2)",
      value: 3,
    },
    "arrangement.clip.nameEditorLeftInset": {
      expression:
        "project/sections/arrangement/lane/interactions/clip/NameEditor/index.tsx Math.round(rect.left) + 1",
      value: 1,
    },
    "arrangement.clip.nameEditorRightInset": {
      expression:
        "project/sections/arrangement/lane/interactions/clip/NameEditor/index.tsx rect.left + rect.width - left - 2",
      value: 2,
    },
    "arrangement.hit.clipResizeEdge": {
      expression: "project/sections/arrangement/core/clip-geometry.ts RESIZE_EDGE_PX = 6",
      value: 6,
    },
    "arrangement.hit.clipFadeHandle": {
      expression: "project/sections/arrangement/core/clip-geometry.ts FADE_HANDLE_PX = 7",
      value: 7,
    },
    "arrangement.hit.automationPointX": {
      expression:
        "project/sections/arrangement/core/automation/hit.ts Math.abs(pointer.x - automationX(...)) <= 6",
      value: 6,
    },
    "arrangement.hit.automationPointY": {
      expression:
        "project/sections/arrangement/core/automation/hit.ts Math.abs(pointer.y - automationY(...)) <= 7",
      value: 7,
    },
    "arrangement.hit.automationSegmentMax": {
      expression:
        "project/sections/arrangement/core/automation/hit.ts Math.min(14, row.valueHeight / 8)",
      value: 14,
    },
    "arrangement.hit.automationSegmentHeightFraction": {
      expression: "project/sections/arrangement/core/automation/hit.ts row.valueHeight / 8",
      value: 1 / 8,
    },
    "arrangement.hit.automationNear": {
      expression:
        "project/sections/arrangement/core/automation/hit.ts distance > 4; onLine: distance <= 4",
      value: 4,
    },
    "arrangement.hit.rulerMarker": {
      expression: "project/sections/arrangement/core/rulers/geometry.ts let distance = 9",
      value: 9,
    },
    "arrangement.hit.rulerLoopEdge": {
      expression: "project/sections/arrangement/core/rulers/geometry.ts Math.abs(x - edge) <= 5",
      value: 5,
    },
  }
}
