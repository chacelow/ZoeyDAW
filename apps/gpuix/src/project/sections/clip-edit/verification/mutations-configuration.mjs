import { verifyConfigurationMutations } from "@/app/verification/configuration-mutation-runner.mjs"
import { DEFAULT_THEME_PRESET, getThemePreset } from "@/shared/theme/presets"

const base = "project/sections/"
const paint = `${base}clip-edit/midi/note-paint.ts`
const grid = `${base}clip-edit/midi/NoteGrid.tsx`
const footer = `${base}footer/`
const cases = []
function mutation(name, file, from, to, pattern) {
  cases.push({ name, file, from, to, pattern })
}
mutation(
  "browser divider",
  `${base}browser/index.tsx`,
  "theme.design.editor.dividerStrokeWidth",
  "1",
  "browser divider native paint follows editor divider stroke source"
)
for (const [field, value, file, pattern] of [
  ["dividerStrokeWidth", 1, paint, "MIDI pure paint consumes editor dividerStrokeWidth"],
  [
    "fadeStrokeWidth",
    1,
    `${base}clip-edit/audio/AudioWaveformLayer.tsx`,
    "native editor paint follows fadeStrokeWidth",
  ],
  ["gridMinorStrokeWidth", 1, paint, "MIDI pure paint consumes editor gridMinorStrokeWidth"],
  ["noteInset", 1, paint, "MIDI pure paint consumes editor noteInset"],
  [
    "loopStrokeWidth",
    1,
    `${base}clip-edit/audio/AudioWaveformRulers.tsx`,
    "native editor paint follows loopStrokeWidth",
  ],
  ["selectionStrokeWidth", 1, grid, "native editor paint follows selectionStrokeWidth"],
  [
    "selectionLineWidth",
    1,
    `${base}clip-edit/audio/AudioWaveformLayer.tsx`,
    "native editor paint follows selectionLineWidth",
  ],
  [
    "markerLineWidth",
    1,
    `${base}clip-edit/audio/SourceMarker.tsx`,
    "native editor paint follows markerLineWidth",
  ],
  [
    "loopLineWidth",
    1,
    `${base}clip-edit/midi/MidiRuler.tsx`,
    "native editor paint follows loopLineWidth",
  ],
  [
    "velocityLineWidth",
    1,
    `${base}clip-edit/midi/VelocityLane.tsx`,
    "native editor paint follows velocityLineWidth",
  ],
  [
    "waveformAxisOpacity",
    0.4,
    `${base}clip-edit/audio/AudioWaveformLayer.tsx`,
    "native editor paint follows waveformAxisOpacity",
  ],
  [
    "midiLoopOpacity",
    0.35,
    `${base}clip-edit/midi/MidiRuler.tsx`,
    "native editor paint follows midiLoopOpacity",
  ],
  ["insertionLineWidth", 1, `${footer}EffectChain/index.tsx`, "device chain insertion paint"],
])
  mutation(
    `editor.${field}`,
    file,
    `${file === paint ? "design" : "theme.design"}.editor.${field}`,
    String(value),
    pattern
  )
for (const [field, value] of [
  ["gridMajorOpacity", 0.45],
  ["gridMinorOpacity", 0.55],
  ["arrangementGridMajorLineWidth", 1],
])
  mutation(
    `project.${field}`,
    paint,
    `project.${field}`,
    String(value),
    field === "arrangementGridMajorLineWidth"
      ? "MIDI pure paint consumes major grid width"
      : `MIDI pure paint consumes project ${field}`
  )
mutation(
  "note border",
  paint,
  "design.shape.controlBorderWidth",
  "1",
  "MIDI pure paint consumes control border width"
)
mutation(
  "focus ring",
  grid,
  "theme.design.shape.focusRingWidth",
  "1",
  "native keyboard focus paint follows focus ring width for midi-test"
)
mutation(
  "velocity focus ring",
  `${base}clip-edit/midi/VelocityLane.tsx`,
  "theme.design.shape.focusRingWidth",
  "1",
  "native keyboard focus paint follows focus ring width for midi-test midi-velocity-retained"
)
mutation(
  "card border",
  `${footer}EffectChain/DeviceCard/index.tsx`,
  "theme.design.shape.cardBorderWidth",
  "1",
  "footer device border changes native content inset"
)
mutation(
  "response stroke",
  `${footer}EffectChain/DeviceDisplay/index.tsx`,
  "theme.project.deviceResponseStrokeWidth",
  "2",
  "device curve native paint"
)
mutation(
  "tabs.footerJoinedGroupGap",
  `${footer}index.tsx`,
  "theme.design.tabs.footerJoinedGroupGap",
  "0",
  "footer native paint follows tabs footerJoinedGroupGap"
)
for (const field of ["disabledOpacity", "deviceDragSourceOpacity"])
  mutation(
    `states.${field}`,
    `${footer}EffectChain/DeviceCard/index.tsx`,
    `theme.design.states.${field}`,
    "0.5",
    field === "disabledOpacity" ? "disabled device native paint" : "dragging device native paint"
  )
mutation(
  "semibold",
  `${base}clip-edit/NameInput.tsx`,
  "theme.design.typography.weights.semibold",
  "600",
  "native clip name typography"
)
for (const [field, file, value] of [
  ["default", grid, "default"],
  ["action", grid, "pointer"],
  ["verticalResize", `${base}clip-edit/midi/VelocityLane.tsx`, "ns-resize"],
  ["horizontalResize", `${base}clip-edit/audio/SourceMarker.tsx`, "ew-resize"],
  ["grab", `${footer}EffectChain/DeviceCard/index.tsx`, "grab"],
  ["grabbing", `${footer}EffectChain/DeviceCard/index.tsx`, "grabbing"],
])
  mutation(
    `cursors.${field}`,
    file,
    `theme.design.cursors.${field}`,
    JSON.stringify(value),
    `state resolves configured ${field} cursor`
  )
const colors = getThemePreset(DEFAULT_THEME_PRESET).colors.dark
for (const [role, file, field] of [
  ["editorOverviewViewport", "audio/AudioWaveformOverview.tsx", "overviewViewport"],
  ["editorAudioLoop", "audio/AudioWaveformRulers.tsx", "audioLoop"],
  ["editorMarkerHover", "audio/SourceMarker.tsx", "markerHover"],
  ["editorMarquee", "midi/NoteGrid.tsx", "marquee"],
  ["pianoIvory", "midi/PianoKeys.tsx", "pianoIvoryDark"],
  ["pianoEbony", "midi/PianoKeys.tsx", "pianoEbony"],
])
  mutation(
    `colors.${role}`,
    `${base}clip-edit/${file}`,
    `theme.colors.${role}`,
    JSON.stringify(colors[role]),
    `native editor paint follows semantic recipe ${field}`
  )
for (const [field, member, value] of [
  ["velocityNoteBorder", null, 60],
  ["velocitySelected", "base", 55],
  ["velocitySelected", "range", 45],
  ["velocityUnselected", "base", 35],
  ["velocityUnselected", "range", 65],
]) {
  const replacement =
    member === null
      ? String(value)
      : `{ ...design.colorRecipes.editor.${field}, ${member}: ${value} }`
  mutation(
    `recipe.${field}${member ? `.${member}` : ""}`,
    paint,
    "const recipe = design.colorRecipes.editor",
    `const recipe = { ...design.colorRecipes.editor, ${field}: ${replacement} }`,
    `MIDI pure paint consumes recipe ${field}.${member ?? "percentage"}`
  )
}
verifyConfigurationMutations({
  testFiles: [
    "src/project/sections/clip-edit/configuration-native.test.tsx",
    "src/project/sections/clip-edit/midi/configuration-paint.test.ts",
    "src/project/sections/footer/configuration-native.test.tsx",
    "src/project/sections/browser/configuration-native.test.tsx",
  ],
  cases,
})
