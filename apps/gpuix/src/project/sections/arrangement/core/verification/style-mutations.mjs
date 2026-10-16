import { fileURLToPath } from "node:url"
import { runMutations } from "./mutation-runner.mjs"

const core = fileURLToPath(new URL("../", import.meta.url))
const preload = fileURLToPath(new URL("./mutation-preload.ts", import.meta.url))
const suites = {
  lane: { files: ["../lane/configuration.test.tsx"] },
  input: {
    files: ["../lane/interactions/controller.test.tsx"],
    pattern:
      "maps retained input drag cursors|maps native fade curve|maps native automation segment|double click on the retained surface|keeps the second-track automation point identity|uses live injected ruler geometry",
  },
  tracks: { files: ["../tracks/style-layout.test.tsx"] },
  meter: { files: ["../tracks/meter/TrackMeter.test.tsx"] },
  timeline: { files: ["../timeline/style-layout.test.tsx"] },
  grid: {
    files: ["../timeline/grid/parity.test.tsx"],
    pattern: "native arrangement grid consumes overridden",
  },
}
const mutations = []
function add(suite, file, name, from, to) {
  mutations.push({ suite, file: `../${file}`, name, from, to })
}

add(
  "tracks",
  "tracks/TrackMixer/index.tsx",
  "meter-layout-border",
  "theme.layout.track.border",
  "theme.project.trackBorder"
)
add(
  "tracks",
  "tracks/TrackResizeOverlay/index.tsx",
  "resize-layout-border",
  "scene.geometry.track.border",
  "theme.project.trackBorder"
)
for (const side of ["Top", "Bottom"]) {
  add(
    "tracks",
    "tracks/Row/index.tsx",
    `row-layout-border-${side}`,
    `border${side}Width: row.trackGeometry.border`,
    `border${side}Width: theme.project.trackBorder`
  )
}

add(
  "lane",
  "lane/ClipCard.tsx",
  "clip-ghost-opacity",
  "theme.design.editor.clipGhostOpacity",
  "0.5"
)
for (const [name, literal] of [
  ["clipBodySelectedOpacity", "0.9"],
  ["clipBodyAutomationOpacity", "0.25"],
  ["clipBodyOpacity", "0.55"],
  ["clipGridHoveredOpacity", "0.3"],
  ["clipGridOpacity", "0.4"],
  ["clipLoopShadeOpacity", "0.1"],
  ["loopLineWidth", "1"],
])
  add("lane", "lane/ClipContents.tsx", `clip-${name}`, `theme.design.editor.${name}`, literal)
add(
  "lane",
  "lane/ClipContents.tsx",
  "clip-pattern-preview-opacity",
  "opacity: automationMode ? theme.design.editor.clipAutomationPreviewOpacity : 1",
  "opacity: automationMode ? 0.4 : 1"
)
add(
  "lane",
  "lane/ClipContents.tsx",
  "clip-waveform-preview-opacity",
  "opacity={automationMode ? theme.design.editor.clipAutomationPreviewOpacity : 1}",
  "opacity={automationMode ? 0.4 : 1}"
)
for (const [name, literal] of [
  ["rangeOpacity", "0.5"],
  ["groupClipPreviewOpacity", "0.85"],
  ["drawPreviewOpacity", "0.2"],
])
  add("lane", "lane/LaneRow/Contents.tsx", `lane-${name}`, `theme.design.editor.${name}`, literal)
for (const [name, literal] of [
  ["insertionLineWidth", "1"],
  ["playheadLineWidth", "1"],
  ["selectionLineWidth", "1"],
])
  add(
    "lane",
    "lane/LaneOverlay/index.tsx",
    `overlay-${name}`,
    `theme.design.editor.${name}`,
    literal
  )
add(
  "lane",
  "lane/LaneOverlay/index.tsx",
  "overlay-ruler-top",
  "arrangementBodyTop(scene.geometry.arrangement)",
  "34"
)
add(
  "lane",
  "lane/LaneRow/Contents.tsx",
  "lane-grid-minor-opacity",
  "theme.project.gridMinorOpacity",
  "0.55"
)
add(
  "lane",
  "lane/LaneOverlay/index.tsx",
  "overlay-ruler-bottom",
  "arrangementBodyBottom(viewport.height, scene.geometry.arrangement)",
  "viewport.height - 18"
)
add(
  "lane",
  "lane/render-projection.ts",
  "lane-visible-ruler-bottom",
  "arrangementBodyBottom(scene.viewport.height, scene.geometry.arrangement)",
  "scene.viewport.height - 18"
)
add(
  "lane",
  "lane/AutomationLayer.tsx",
  "automation-point-radius",
  "scene.geometry.arrangement.automationPointRadius",
  "4"
)
add(
  "lane",
  "lane/GridQuads/index.tsx",
  "lane-grid-minor-width",
  "theme.design.editor.gridMinorStrokeWidth",
  "1"
)
add(
  "lane",
  "lane/GridQuads/index.tsx",
  "lane-grid-major-width",
  "theme.project.arrangementGridMajorLineWidth",
  "1"
)
add(
  "lane",
  "lane/ClipFades/index.tsx",
  "fade-stroke-width",
  "theme.design.editor.fadeStrokeWidth",
  "1"
)
add("lane", "lane/ClipFades/index.tsx", "fade-curve-hit-size", "geometry.fadeHitSize * 2", "7 * 2")
add(
  "lane",
  "lane/clip-card-projection.ts",
  "fade-geometry-cache-invalidation",
  "previous.rect.arrangementGeometry === rect.arrangementGeometry &&",
  "true &&"
)
add(
  "input",
  "lane/useLaneSurface.tsx",
  "lane-ruler-input-origin",
  "originY ?? scene.geometry.arrangement.barRulerHeight",
  "originY ?? 34"
)
for (const [name, literal] of [
  ["default", "default"],
  ["grab", "grab"],
  ["grabbing", "grabbing"],
  ["disabled", "not-allowed"],
  ["horizontalResize", "ew-resize"],
  ["fadeCurve", "move"],
  ["automationDraw", "crosshair"],
  ["verticalResize", "ns-resize"],
])
  add(
    "input",
    "lane/useLaneSurface.tsx",
    `lane-cursor-${name}`,
    "theme.design.cursors[interaction.cursor]",
    `({ ...theme.design.cursors, ${name}: "${literal}" })[interaction.cursor]`
  )
add(
  "input",
  "lane/interactions/clip/NameEditor/index.tsx",
  "clip-name-left-inset",
  "scene.geometry.arrangement.clip.nameEditorLeftInset",
  "1"
)
add(
  "input",
  "lane/interactions/clip/NameEditor/index.tsx",
  "clip-name-right-inset",
  "scene.geometry.arrangement.clip.nameEditorRightInset",
  "2"
)
add(
  "input",
  "lane/interactions/clip/NameEditor/index.tsx",
  "clip-name-top-inset",
  "rect.top + scene.geometry.arrangement.clip.verticalInset",
  "rect.top + 1"
)
add(
  "input",
  "lane/interactions/clip/NameEditor/index.tsx",
  "clip-name-height-inset",
  "row.height - scene.geometry.arrangement.clip.verticalInset * 2",
  "row.height - 2"
)
add(
  "input",
  "lane/interactions/clip/NameEditor/index.tsx",
  "clip-name-radius",
  "theme.design.editor.inlineRadius",
  "0"
)
add(
  "input",
  "lane/interactions/automation/ValueEditor/index.tsx",
  "automation-editor-radius",
  "theme.design.editor.inlineRadius",
  "0"
)

add(
  "tracks",
  "tracks/TrackRows/index.tsx",
  "group-frame-width",
  "theme.design.shape.controlBorderWidth",
  "1"
)
for (const side of ["Left", "Right", "Top", "Bottom"]) {
  const prefix = side === "Top" ? "group.id === track.id ? " : side === "Bottom" ? "closes ? " : ""
  add(
    "tracks",
    "tracks/GroupRails/index.tsx",
    `group-rail-${side.toLowerCase()}-width`,
    `border${side}Width: ${prefix}theme.design.editor.dividerStrokeWidth`,
    `border${side}Width: ${prefix}1`
  )
}
add(
  "tracks",
  "tracks/TrackIdentity/index.tsx",
  "track-name-weight",
  "theme.design.typography.weights.medium",
  "500"
)
for (const [name, literal] of [
  ["grabbing", '"grabbing"'],
  ["default", '"default"'],
  ["grab", '"grab"'],
]) {
  add(
    "tracks",
    "tracks/TrackIdentity/index.tsx",
    `track-cursor-${name}`,
    `theme.design.cursors.${name}${name === "grab" ? "," : ""}`,
    `${literal}${name === "grab" ? "," : ""}`
  )
}
for (const file of [
  "tracks/Row/index.tsx",
  "tracks/TrackIdentity/index.tsx",
  "tracks/TrackResizeOverlay/index.tsx",
]) {
  const name = file.split("/")[1]
  add(
    "tracks",
    file,
    `${name}-focus-width`,
    "outlineWidth: theme.design.shape.focusRingWidth",
    "outlineWidth: 1"
  )
  add(
    "tracks",
    file,
    `${name}-focus-offset`,
    "outlineOffset: -theme.design.shape.focusRingWidth",
    "outlineOffset: -1"
  )
}
add(
  "tracks",
  "tracks/TrackResizeOverlay/index.tsx",
  "track-resize-cursor",
  "theme.design.cursors.verticalResize",
  '"ns-resize"'
)
add(
  "tracks",
  "tracks/Row/index.tsx",
  "track-drop-width",
  "theme.design.editor.insertionLineWidth",
  "1"
)
add(
  "tracks",
  "tracks/TrackRows/useTrackRowLayout.ts",
  "tracks-ruler-top",
  "arrangementBodyTop(scene.geometry.arrangement)",
  "34"
)
add(
  "tracks",
  "tracks/TrackRows/useTrackRowLayout.ts",
  "tracks-ruler-bottom",
  "arrangementBodyBottom(viewport.height, scene.geometry.arrangement)",
  "viewport.height - 18"
)
add(
  "meter",
  "tracks/meter/TrackMeter.tsx",
  "meter-channel-gap",
  "(width - channelGap) / 2",
  "(width - 1) / 2"
)
add("meter", "tracks/meter/TrackMeter.tsx", "meter-peak-width", "height: peakWidth,", "height: 1,")
add("meter", "tracks/meter/TrackMeter.tsx", "meter-zero-width", "height: zeroWidth,", "height: 1,")
add(
  "meter",
  "tracks/meter/TrackMeter.tsx",
  "meter-warning-stop",
  "position: warningStop,",
  "position: 0.3,"
)

add(
  "timeline",
  "timeline/ArrangementTimeline/index.tsx",
  "timeline-bar-ruler-height",
  "const { barRulerHeight, timeRulerHeight } = theme.layout.arrangement",
  "const { timeRulerHeight } = theme.layout.arrangement; const barRulerHeight = 34"
)
add(
  "timeline",
  "timeline/ArrangementTimeline/index.tsx",
  "timeline-time-ruler-height",
  "const { barRulerHeight, timeRulerHeight } = theme.layout.arrangement",
  "const { barRulerHeight } = theme.layout.arrangement; const timeRulerHeight = 18"
)
add(
  "timeline",
  "timeline/ArrangementTimeline/index.tsx",
  "timeline-focus-width",
  "outlineWidth: theme.design.shape.focusRingWidth",
  "outlineWidth: 1"
)
add(
  "timeline",
  "timeline/ArrangementTimeline/index.tsx",
  "timeline-focus-offset",
  "outlineOffset: -theme.design.shape.focusRingWidth",
  "outlineOffset: -1"
)
for (const [name, literal] of [
  ["barRulerHeight", "34"],
  ["markerRulerHeight", "17"],
  ["loopRulerHeight", "17"],
]) {
  const others = ["barRulerHeight", "markerRulerHeight", "loopRulerHeight"]
    .filter(field => field !== name)
    .join(", ")
  add(
    "timeline",
    "timeline/rulers/index.tsx",
    `ruler-${name}`,
    "const { barRulerHeight, markerRulerHeight, loopRulerHeight } = theme.layout.arrangement",
    `const { ${others} } = theme.layout.arrangement; const ${name} = ${literal}`
  )
}
for (const [name, literal] of [
  ["default", "default"],
  ["grab", "grab"],
  ["grabbing", "grabbing"],
  ["horizontalResize", "ew-resize"],
]) {
  add(
    "timeline",
    "timeline/rulers/index.tsx",
    `ruler-cursor-${name}`,
    "theme.design.cursors[pointer]",
    `({ ...theme.design.cursors, ${name}: "${literal}" })[pointer]`
  )
}
add(
  "timeline",
  "timeline/rulers/index.tsx",
  "ruler-divider-width",
  "borderBottomWidth: theme.design.editor.dividerStrokeWidth",
  "borderBottomWidth: 1"
)
add(
  "timeline",
  "timeline/rulers/index.tsx",
  "ruler-marker-padding",
  "theme.project.arrangementMarkerLabelInset - theme.design.editor.markerLineWidth",
  "theme.project.arrangementMarkerLabelInset - 1"
)
add(
  "timeline",
  "timeline/rulers/index.tsx",
  "ruler-marker-width",
  "borderLeftWidth: theme.design.editor.markerLineWidth",
  "borderLeftWidth: 1"
)
for (const side of ["Left", "Right"])
  add(
    "timeline",
    "timeline/rulers/index.tsx",
    `ruler-loop-${side.toLowerCase()}-width`,
    `border${side}Width: theme.design.editor.loopStrokeWidth`,
    `border${side}Width: 1`
  )
add(
  "timeline",
  "timeline/rulers/index.tsx",
  "time-ruler-height",
  "height: theme.layout.arrangement.timeRulerHeight,\n        position:",
  "height: 18,\n        position:"
)
add(
  "timeline",
  "timeline/rulers/index.tsx",
  "time-ruler-label-height",
  "height: theme.layout.arrangement.timeRulerHeight,\n            display:",
  "height: 18,\n            display:"
)
add(
  "timeline",
  "timeline/rulers/index.tsx",
  "time-ruler-divider-width",
  "borderTopWidth: theme.design.editor.dividerStrokeWidth",
  "borderTopWidth: 1"
)
add(
  "timeline",
  "timeline/rulers/index.tsx",
  "time-ruler-tick-width",
  "width: theme.design.editor.markerLineWidth",
  "width: 1"
)
add(
  "timeline",
  "timeline/rulers/MarkerEditor.tsx",
  "marker-editor-ruler-height",
  "theme.layout.arrangement.markerRulerHeight",
  "17"
)
for (const [name, literal] of [
  ["grab", "grab"],
  ["horizontalResize", "ew-resize"],
]) {
  add(
    "timeline",
    "timeline/minimap/index.tsx",
    `minimap-cursor-${name}`,
    "theme.design.cursors[pointer]",
    `({ ...theme.design.cursors, ${name}: "${literal}" })[pointer]`
  )
}
add(
  "timeline",
  "timeline/minimap/Overview.tsx",
  "minimap-divider-width",
  "theme.design.editor.dividerStrokeWidth",
  "1"
)
add(
  "timeline",
  "timeline/minimap/Overview.tsx",
  "minimap-marker-width",
  "theme.design.editor.markerLineWidth",
  "1"
)
add(
  "timeline",
  "timeline/minimap/Overview.tsx",
  "minimap-clip-inset",
  "theme.layout.arrangement.minimapClipInset",
  "1"
)
add(
  "timeline",
  "timeline/minimap/Playhead.tsx",
  "minimap-playhead-width",
  "theme.design.editor.playheadLineWidth",
  "1"
)
add(
  "grid",
  "timeline/grid/index.tsx",
  "timeline-grid-major-width",
  "theme.project.arrangementGridMajorLineWidth",
  "1"
)
add(
  "grid",
  "timeline/grid/index.tsx",
  "timeline-grid-minor-width",
  "theme.design.editor.gridMinorStrokeWidth",
  "1"
)
add(
  "grid",
  "timeline/grid/index.tsx",
  "timeline-grid-minor-opacity",
  "theme.project.gridMinorOpacity",
  "0.55"
)
add(
  "lane",
  "lane/ClipFades/index.tsx",
  "fade-handle-size",
  "theme.project.arrangementFadeHandleSize",
  "5"
)
add(
  "lane",
  "lane/ClipFades/index.tsx",
  "fade-half-stroke-inset",
  "const inset = strokeWidth / 2",
  "const inset = 0.5"
)
add(
  "lane",
  "lane/clip-card-projection.ts",
  "track-geometry-cache-invalidation",
  "previous.rect.trackGeometry === rect.trackGeometry &&",
  "true &&"
)
add(
  "lane",
  "lane/clip-card-projection.ts",
  "grid-readability-cache-invalidation",
  "previous.geometry.arrangement.gridMinSubdivisionWidth",
  "next.geometry.arrangement.gridMinSubdivisionWidth"
)
add(
  "input",
  "lane/interactions/automation/ValueEditor/index.tsx",
  "automation-editor-offset",
  "theme.design.spacing.stackGap",
  "4"
)
add(
  "timeline",
  "timeline/rulers/index.tsx",
  "time-ruler-label-offset",
  "theme.design.spacing.stackGap",
  "4"
)
add(
  "timeline",
  "timeline/minimap/index.tsx",
  "minimap-frame-border",
  "theme.design.shape.controlBorderWidth",
  "1"
)

// Existing shared sources are unchanged here and owned by their original slices.
const unchangedSources = ["contentPaperTint (C1)", "TrackMixer shared Card controls inset (C2)"]
runMutations({
  root: core,
  preload,
  suites,
  mutations,
  notes: [`Unchanged sources: ${unchangedSources.join(", ")}`],
})
