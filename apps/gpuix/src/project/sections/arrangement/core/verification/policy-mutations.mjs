import { fileURLToPath } from "node:url"
import { runMutations } from "./mutation-runner.mjs"

const core = fileURLToPath(new URL("../", import.meta.url))
const preload = fileURLToPath(new URL("./mutation-preload.ts", import.meta.url))
const tests = [
  "behavior-policy.test.ts",
  "configuration.test.ts",
  "meters/meter-policy.test.ts",
  "viewport/zoom-policy.test.ts",
  "viewport/minimap.test.ts",
  "../timeline/keyboard/controller.test.ts",
  "../timeline/rulers/controller.test.ts",
  "../timeline/viewport/controller.test.ts",
]
const mutations = [
  ["minimap-edge-hit", "viewport/minimap.ts", "geometry.policy.zoom.minimapEdgeHitPixels", "6"],
  ["meter-silence", "meters/meter-peak.ts", "db: policy.minDb", "db: -60"],
  ["meter-invalid", "meters/meter-peak.ts", "? policy.minDb", "? -60"],
  [
    "meter-headroom",
    "meters/meter-peak.ts",
    "Math.min(policy.maxDb, levelDb)",
    "Math.min(6, levelDb)",
  ],
  ["meter-hold", "meters/meter-peak.ts", "now + policy.holdMs", "now + 600"],
  ["meter-fall", "meters/meter-peak.ts", "elapsed * policy.fallDbPerSecond", "elapsed * 24"],
  ["zoom-unmeasured", "viewport/zoom.ts", ": policy.unmeasuredMinPxPerBar", ": 1"],
  ["zoom-fit-extent", "viewport/zoom.ts", "bars * policy.minZoomTimelineRatio", "bars * 1"],
  [
    "zoom-wheel",
    "viewport/zoom.ts",
    "input.deltaY / policy.wheelPixelsPerExponent",
    "input.deltaY / 260",
  ],
  [
    "zoom-minimap",
    "viewport/zoom.ts",
    "downwardPixels / policy.minimapPixelsPerExponent",
    "downwardPixels / 100",
  ],
  ["zoom-step-in", "viewport/zoom.ts", "? policy.stepInFactor", "? 1.25"],
  ["zoom-step-out", "viewport/zoom.ts", ": policy.stepOutFactor", ": 0.8"],
  [
    "zoom-anchor",
    "viewport/zoom.ts",
    "input.viewportWidth * policy.stepAnchorRatio",
    "input.viewportWidth * 0.5",
  ],
  [
    "minimap-pan",
    "viewport/minimap.ts",
    "deltaBars * geometry.policy.zoom.minimapPanScale",
    "deltaBars * 0.25",
  ],
  [
    "follow-trigger",
    "viewport/zoom.ts",
    "viewportWidth * policy.triggerRatio",
    "viewportWidth * 0.5",
  ],
  [
    "follow-anchor",
    "viewport/zoom.ts",
    "viewportWidth * policy.anchorRatio",
    "viewportWidth * 0.5",
  ],
  [
    "follow-pause",
    "../timeline/viewport/controller.ts",
    "performance.now() + readPolicy().follow.manualPanPauseMs",
    "performance.now() + 2000",
  ],
  ["scroll-cap", "viewport/edge-scroll.ts", "Math.min(policy.maxElapsedMs,", "Math.min(48,"],
  [
    "scroll-horizontal",
    "viewport/edge-scroll.ts",
    "duration * policy.horizontalPixelsPerMs",
    "duration * 0.75",
  ],
  [
    "scroll-vertical",
    "viewport/edge-scroll.ts",
    "duration * policy.verticalPixelsPerMs",
    "duration * 0.6",
  ],
  ["pointer-threshold", "interactions/layers.ts", ">= policy.dragThresholdPixels", ">= 3"],
  ["automation-sampling", "automation/drawing.ts", "/ policy.freehandSamplePixels", "/ 3"],
  [
    "marker-nudge",
    "../timeline/rulers/controller.ts",
    ": readPolicy().markerNudgeBars",
    ": 1 / 16",
  ],
  [
    "keyboard-velocity-down",
    "../timeline/keyboard/controller.ts",
    "session.midiVelocity - readPolicy().velocityStep",
    "session.midiVelocity - 10",
  ],
  [
    "keyboard-velocity-up",
    "../timeline/keyboard/controller.ts",
    "session.midiVelocity + readPolicy().velocityStep",
    "session.midiVelocity + 10",
  ],
].map(([name, file, from, to]) => ({ name, file, from, to, suite: "policy" }))

mutations.push(
  ...[
    ["ruler-body-top", "layout.ts", "return geometry.barRulerHeight", "return 34"],
    ["ruler-body-bottom", "layout.ts", "height - geometry.timeRulerHeight", "height - 18"],
    [
      "clip-rect-min-width",
      "layout.ts",
      "Math.max(row.arrangementGeometry.clip.minWidth,",
      "Math.max(2,",
    ],
    ["clip-visual-min-width", "clip-geometry.ts", "Math.max(metrics.clip.minWidth,", "Math.max(2,"],
    ["clip-min-height", "clip-geometry.ts", "metrics.clip.minHeight", "4"],
    ["clip-top-inset", "clip-geometry.ts", "rect.top + metrics.clip.verticalInset", "rect.top + 1"],
    [
      "clip-height-inset",
      "clip-geometry.ts",
      "rect.height - metrics.clip.verticalInset * 2",
      "rect.height - 2",
    ],
    [
      "clip-body-threshold",
      "clip-geometry.ts",
      "rect.trackGeometry.titleHeight + metrics.clip.bodyThresholdInset",
      "rect.trackGeometry.titleHeight + 4",
    ],
    ["fade-margin", "clip-geometry.ts", "Math.min(geometry.fadeHandleMargin,", "Math.min(3,"],
    ["fade-handle-visibility", "clip-geometry.ts", "width >= fadeHitSize * 2", "width >= 7 * 2"],
    ["fade-drag-hit-gap", "clip/fade.ts", "fadeHitSize / width", "7 / width"],
    ["resize-left-hit", "hit-test.ts", "fromLeft <= hit.clipResizeEdge", "fromLeft <= 6"],
    ["resize-right-hit", "hit-test.ts", "fromRight <= hit.clipResizeEdge", "fromRight <= 6"],
    [
      "fade-length-hit-x",
      "hit-test.ts",
      "Math.abs(pointX - fadeHandleX(visual, peak.x)) <= hit.clipFadeHandle",
      "Math.abs(pointX - fadeHandleX(visual, peak.x)) <= 7",
    ],
    [
      "fade-length-hit-y",
      "hit-test.ts",
      "Math.abs(pointY - peak.y) <= hit.clipFadeHandle",
      "Math.abs(pointY - peak.y) <= 7",
    ],
    [
      "fade-curve-span",
      "hit-test.ts",
      "fade.end.x - fade.start.x >= hit.clipFadeHandle * 2",
      "fade.end.x - fade.start.x >= 7 * 2",
    ],
    [
      "automation-value-top-radius",
      "automation/geometry.ts",
      "row.top + titleInset + geometry.automationPointRadius",
      "row.top + titleInset + 4",
    ],
    [
      "automation-value-height-radius",
      "automation/geometry.ts",
      "geometry.automationPointRadius * 2",
      "4 * 2",
    ],
    ["automation-point-hit-x", "automation/hit.ts", "<= hit.automationPointX", "<= 6"],
    ["automation-point-hit-y", "automation/hit.ts", "<= hit.automationPointY", "<= 7"],
    [
      "automation-segment-cap",
      "automation/hit.ts",
      "Math.min(hit.automationSegmentMax,",
      "Math.min(14,",
    ],
    [
      "automation-segment-fraction",
      "automation/hit.ts",
      "row.valueHeight * hit.automationSegmentHeightFraction",
      "row.valueHeight / 8",
    ],
    [
      "automation-segment-near",
      "automation/hit.ts",
      "distance > hit.automationNear",
      "distance > 4",
    ],
    [
      "automation-lane-near",
      "automation/hit.ts",
      "distance <= hit.automationNear",
      "distance <= 4",
    ],
    ["ruler-marker-height", "rulers/geometry.ts", "y < markerRulerHeight", "y < 17"],
    [
      "ruler-marker-hit",
      "rulers/geometry.ts",
      "let distance = hit.rulerMarker",
      "let distance = 9",
    ],
    [
      "ruler-loop-left-hit",
      "rulers/geometry.ts",
      "Math.abs(x - left) <= hit.rulerLoopEdge",
      "Math.abs(x - left) <= 5",
    ],
    [
      "ruler-loop-right-hit",
      "rulers/geometry.ts",
      "Math.abs(x - right) <= hit.rulerLoopEdge",
      "Math.abs(x - right) <= 5",
    ],
    ["ruler-subdivision-spacing", "rulers/grid-lines.ts", ">= spacing.subdivision", ">= 38"],
    ["ruler-beat-spacing", "rulers/grid-lines.ts", ">= spacing.beat", ">= 56"],
    [
      "ruler-bar-spacing-threshold",
      "rulers/grid-lines.ts",
      "pxPerBar >= spacing.bar",
      "pxPerBar >= 56",
    ],
    [
      "ruler-bar-spacing-cadence",
      "rulers/grid-lines.ts",
      "Math.log2(spacing.bar / pxPerBar)",
      "Math.log2(56 / pxPerBar)",
    ],
    [
      "grid-minor-readability",
      "rulers/grid-lines.ts",
      "cellPx >= scene.geometry.arrangement.gridMinSubdivisionWidth",
      "cellPx >= 2",
    ],
  ].map(([name, file, from, to]) => ({ name, file, from, to, suite: "geometry" }))
)

mutations.push(
  ...[
    [
      "sparse-zero-anchor",
      "configuration.ts",
      "zoom.stepAnchorRatio ?? source.zoom.stepAnchorRatio",
      "zoom.stepAnchorRatio || source.zoom.stepAnchorRatio",
    ],
    [
      "sparse-zero-pan",
      "configuration.ts",
      "zoom.minimapPanScale ?? source.zoom.minimapPanScale",
      "zoom.minimapPanScale || source.zoom.minimapPanScale",
    ],
    [
      "sparse-zero-hold",
      "configuration.ts",
      "meter.holdMs ?? source.meter.holdMs",
      "meter.holdMs || source.meter.holdMs",
    ],
  ].map(([name, file, from, to]) => ({ name, file, from, to, suite: "policy" }))
)

const appHook = "../../../../app/project/useProjectComposition.ts"
mutations.push(
  {
    name: "live-policy-stale-ref",
    file: appHook,
    from: "policyRef.current = policy",
    to: "policyRef.current = policyRef.current",
    suite: "live",
  },
  {
    name: "live-policy-owner-recreated",
    file: appHook,
    from: "    readPolicy,\n    minimapMinHeight,",
    to: "    readPolicy,\n    policy,\n    minimapMinHeight,",
    suite: "live",
  },
  {
    name: "live-policy-lane-not-interrupted",
    file: appHook,
    from: "composition?.lane.interrupt()",
    to: "void composition",
    suite: "live",
  },
  {
    name: "live-policy-ruler-not-interrupted",
    file: appHook,
    from: "composition?.timeline.view.cancelGestures()",
    to: "void composition",
    suite: "live",
  }
)

runMutations({
  root: core,
  preload,
  suites: {
    policy: { files: tests },
    geometry: { files: ["geometry-policy.test.ts"] },
    live: { files: ["../../../../app/project/live-policy.test.tsx"] },
  },
  mutations,
})
