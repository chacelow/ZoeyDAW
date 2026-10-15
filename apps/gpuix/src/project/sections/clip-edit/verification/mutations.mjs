// Mutation check for clip-edit pure logic. Run from apps/gpuix: bun src/project/sections/clip-edit/verification/mutations.mjs
// Each mutation rewrites one source file in place, runs the named tests, and restores the original bytes.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"

const mutations = [
  {
    name: "quantize ignores the selection",
    file: "src/project/model/midi-editing/operations.ts",
    from: "if (!indices.has(index) || Math.abs(cells",
    to: "if (Math.abs(cells",
    tests: ["src/project/model/midi-editing/quantize.test.ts"],
  },
  {
    name: "quantize floors instead of rounding",
    file: "src/project/model/midi-editing/operations.ts",
    from: "new Set([Math.round(cells), Math.ceil(cells), Math.floor(cells)])",
    to: "new Set([Math.floor(cells), Math.ceil(cells)])",
    tests: ["src/project/model/midi-editing/quantize.test.ts"],
  },
  {
    name: "quantize never moves a note",
    file: "src/project/model/midi-editing/operations.ts",
    from: "if (moved.startBeat === target) {",
    to: "if (moved.startBeat === target && false) {",
    tests: ["src/project/model/midi-editing/quantize.test.ts"],
  },
  {
    name: "note viewport ignores vertical clipping",
    file: "src/project/sections/clip-edit/midi/layout.ts",
    from: "top + roll.rowHeight <= roll.scrollY ||\n      top >= roll.scrollY + roll.viewHeight",
    to: "false",
    tests: ["src/project/sections/clip-edit/midi/layout.test.ts"],
  },
  {
    name: "MIDI consumed keys leak to region",
    file: "src/project/sections/clip-edit/midi/useMidiEditor.ts",
    from: "if (handled) {\n      event.preventDefault()\n      event.stopPropagation()",
    to: "if (handled) {\n      event.preventDefault()",
    tests: ["src/project/sections/clip-edit/midi/MidiEditor.test.tsx"],
  },
  {
    name: "text field routes shortcuts to project undo",
    file: "src/project/sections/clip-edit/NameInput.tsx",
    from: "event.stopPropagation()",
    to: "finish(true); projectActions.undo()",
    tests: ["src/project/sections/clip-edit/ClipEditor.test.tsx"],
  },
  {
    name: "stable peaks ignore backend generation",
    file: "src/project/sections/clip-edit/audio/SourceWaveform.tsx",
    from: "window.end, generation]",
    to: "window.end]",
    tests: ["src/project/sections/clip-edit/audio/SourceWaveform-runtime.test.tsx"],
  },
  {
    name: "viewport ignores folded pitch shrink",
    file: "src/project/sections/clip-edit/midi/useMidiViewport.ts",
    from: "const next = clampScroll(previous.x, previous.y, roll)",
    to: "const next = { scrollX: previous.x, scrollY: previous.y }",
    tests: ["src/project/sections/clip-edit/midi/viewport-behavior.test.tsx"],
  },
  {
    name: "piano pointer selection keeps key focus",
    file: "src/project/sections/clip-edit/midi/useMidiEditor.ts",
    from: 'if (source === "pointer" && host.current)',
    to: 'if (source === "keyboard" && host.current)',
    tests: ["src/project/sections/clip-edit/midi/keyboard-reachability.test.tsx"],
  },
  {
    name: "velocity keyboard adjustment is ignored",
    file: "src/project/sections/clip-edit/midi/VelocityLane.tsx",
    from: 'onVelocityChange(active.index, event.key === "up" ? 1 : -1)',
    to: "onVelocityChange(active.index, 0)",
    tests: ["src/project/sections/clip-edit/midi/keyboard-reachability.test.tsx"],
  },
  {
    name: "destructive commands interrupt active move",
    file: "src/project/sections/clip-edit/midi/useMidiEditor.ts",
    from: "if (gesture.current && mutatesNotes && !modifiers?.alt)",
    to: "if (false && gesture.current && mutatesNotes && !modifiers?.alt)",
    tests: ["src/project/sections/clip-edit/midi/gesture-shortcuts.test.tsx"],
  },
  {
    name: "marker nudge commits current drag",
    file: "src/project/sections/clip-edit/audio/SourceMarker.tsx",
    from: "event.stopPropagation()\n        cancel()\n        const baseline",
    to: "event.stopPropagation()\n        const baseline",
    tests: ["src/project/sections/clip-edit/audio/marker-shortcuts.test.tsx"],
  },
  {
    name: "insertion uses window relative grid",
    file: "src/project/model/midi-notes.ts",
    from: "const target = sourceOffsetBeats + horizontalRatio * totalBeats",
    to: "const target = horizontalRatio * totalBeats",
    tests: ["src/project/sections/clip-edit/midi/grid-phase.test.ts"],
  },
  {
    name: "paint grid follows trimmed window",
    file: "src/project/model/midi-editing/operations.ts",
    from: "Math.floor(window.sourceOffsetBeats * 4) / 4",
    to: "window.sourceOffsetBeats",
    tests: ["src/project/sections/clip-edit/midi/grid-phase.test.ts"],
  },
  {
    name: "erase grid follows trimmed window",
    file: "src/project/model/midi-editing/operations.ts",
    from: "const high = Math.max(firstCell, lastCell)\n  const origin = Math.floor(window.sourceOffsetBeats * 4) / 4",
    to: "const high = Math.max(firstCell, lastCell)\n  const origin = window.sourceOffsetBeats",
    tests: ["src/project/sections/clip-edit/midi/grid-phase.test.ts"],
  },
  {
    name: "quantize target follows trimmed window",
    file: "src/project/model/midi-editing/operations.ts",
    from: "const target = cell * gridBeats",
    to: "const target = window.sourceOffsetBeats + cell * gridBeats",
    tests: ["src/project/sections/clip-edit/midi/grid-phase.test.ts"],
  },
  {
    name: "cell hit uses relative source origin",
    file: "src/project/sections/clip-edit/midi/layout.ts",
    from: "Math.floor(beat / NOTE_GRID_BEATS)",
    to: "Math.floor((beat - roll.window.sourceOffsetBeats) / NOTE_GRID_BEATS)",
    tests: ["src/project/sections/clip-edit/midi/grid-phase.test.ts"],
  },
  {
    name: "display grid follows trimmed window",
    file: "src/project/sections/clip-edit/midi/layout.ts",
    from: "Math.ceil(firstBeat / step) * step",
    to: "sourceOffsetBeats + Math.ceil((firstBeat - sourceOffsetBeats) / step) * step",
    tests: ["src/project/sections/clip-edit/midi/grid-phase.test.ts"],
  },
  {
    name: "paint discards crossing half cell",
    file: "src/project/model/midi-editing/operations.ts",
    from: "beat + 0.25 <= window.sourceOffsetBeats",
    to: "beat < window.sourceOffsetBeats",
    tests: ["src/project/sections/clip-edit/midi/grid-phase.test.ts"],
  },
  {
    name: "tiny window insertion overshoots right edge",
    file: "src/project/model/midi-notes.ts",
    from: "Math.floor(sourceOffsetBeats / NOTE_GRID_BEATS)",
    to: "Math.ceil(sourceOffsetBeats / NOTE_GRID_BEATS)",
    tests: ["src/project/sections/clip-edit/midi/grid-phase.test.ts"],
  },
  {
    name: "erase deletes hidden left notes",
    file: "src/project/model/midi-editing/operations.ts",
    from: "note.startBeat + note.lengthBeats <= window.sourceOffsetBeats",
    to: "false",
    tests: ["src/project/model/midi-editing/visible-cells.test.ts"],
  },
  {
    name: "erase deletes hidden right notes",
    file: "src/project/model/midi-editing/operations.ts",
    from: "note.startBeat >= window.sourceOffsetBeats + window.totalBeats",
    to: "false",
    tests: ["src/project/model/midi-editing/visible-cells.test.ts"],
  },
  {
    name: "paint tests occupancy only at grid start",
    file: "src/project/model/midi-editing/operations.ts",
    from: "note.startBeat < visibleEnd",
    to: "note.startBeat <= beat",
    tests: ["src/project/model/midi-editing/visible-cells.test.ts"],
  },
  {
    name: "paint allows hidden left notes to block",
    file: "src/project/model/midi-editing/operations.ts",
    from: "note.startBeat + note.lengthBeats > visibleStart",
    to: "note.startBeat + note.lengthBeats > beat",
    tests: ["src/project/model/midi-editing/visible-cells.test.ts"],
  },
  {
    name: "held Button loses latched release state",
    file: "src/project/sections/clip-edit/midi/MidiEditor.tsx",
    from: "active={view.fold}",
    to: "active={false}",
    tests: ["src/project/sections/clip-edit/pressed-families.test.tsx"],
  },
  {
    name: "held DragPad fill is overridden",
    file: "src/project/sections/clip-edit/midi/MidiEditor.tsx",
    from: 'testId="midi-velocity-value"',
    to: 'testId="midi-velocity-value" style={{ backgroundColor: theme.colors.muted }}',
    tests: ["src/project/sections/clip-edit/pressed-families.test.tsx"],
  },
  {
    name: "held piano key has idle fill",
    file: "src/project/sections/clip-edit/midi/PianoKeys.tsx",
    from: "backgroundColor: active ? theme.colors.primary : black ? ebony : ivory",
    to: "backgroundColor: black ? ebony : ivory",
    tests: ["src/project/sections/clip-edit/pressed-families.test.tsx"],
  },
  {
    name: "held Pattern step has idle fill",
    file: "src/project/sections/clip-edit/pattern/PatternSteps.tsx",
    from: "backgroundColor: on",
    to: "backgroundColor: false",
    tests: ["src/project/sections/clip-edit/pressed-families.test.tsx"],
  },
  {
    name: "held marker placement stays frozen",
    file: "src/project/sections/clip-edit/audio/SourceMarker.tsx",
    from: "left: right ? left - hit : left",
    to: "left: right ? left - hit : 0",
    tests: ["src/project/sections/clip-edit/pressed-families.test.tsx"],
  },
  {
    name: "held menu release discards selection",
    file: "src/project/sections/clip-edit/audio/AudioParameters.tsx",
    from: "onChange={warpMode => change({ warpMode })}",
    to: "onChange={() => {}}",
    tests: ["src/project/sections/clip-edit/pressed-families.test.tsx"],
  },
  {
    name: "wheel pan consumes the delta twice",
    file: "src/project/sections/clip-edit/midi/MidiEditor.tsx",
    from: "else view.scrollTo(view.roll.scrollX - dx, view.roll.scrollY - dy)",
    to: "else view.scrollTo(view.roll.scrollX - 2 * dx, view.roll.scrollY - 2 * dy)",
    tests: ["src/project/sections/clip-edit/midi/viewport-behavior.test.tsx"],
  },
  {
    name: "wheel zoom applies two source steps",
    file: "src/project/sections/clip-edit/midi/useMidiViewport.ts",
    from: "horizontalZoom * HORIZONTAL_ZOOM.factor ** direction",
    to: "horizontalZoom * HORIZONTAL_ZOOM.factor ** (direction * 2)",
    tests: ["src/project/sections/clip-edit/midi/viewport-behavior.test.tsx"],
  },
  {
    name: "active velocity ignores the selection owner",
    file: "src/project/sections/clip-edit/midi/VelocityLane.tsx",
    from: "stems.find(stem => stem.index === currentNoteIndex)",
    to: "stems[0]",
    tests: ["src/project/sections/clip-edit/midi/keyboard-reachability.test.tsx"],
  },
  {
    name: "velocity restores a Tab stop per stem",
    file: "src/project/sections/clip-edit/midi/VelocityLane.tsx",
    from: "{active ? (",
    to: '{stems.filter(stem => stem.index !== active?.index).map(stem => <div key={"legacy-" + stem.index} role="slider" tabIndex={0} aria-label={label} aria-valuetext={String(stem.note.velocity)} style={{ position: "absolute", left: stem.x, bottom: 0, width: 1, height: stem.stem, pointerEvents: "none" }} />)}\n      {active ? (',
    tests: ["src/project/sections/clip-edit/midi/keyboard-reachability.test.tsx"],
  },
  {
    name: "memoized paint hosts never receive new viewport geometry",
    file: "src/project/sections/clip-edit/midi/QuadPaint.tsx",
    from: "[controllers, layers]",
    to: "[controllers]",
    tests: ["src/project/sections/clip-edit/midi/QuadPaint.test.tsx"],
  },
  {
    name: "new paint hosts are never registered",
    file: "src/project/sections/clip-edit/midi/QuadPaint.tsx",
    from: "bind(id, batch)",
    to: "bind(id, null)",
    tests: ["src/project/sections/clip-edit/midi/QuadPaint.test.tsx"],
  },
  {
    name: "group hit discards the current note anchor",
    file: "src/project/sections/clip-edit/midi/useMidiEditor.ts",
    from: "setSelected(selection, selection.includes(hit.index) ? hit.index : currentNoteIndex)",
    to: "setSelected(selection, currentNoteIndex)",
    tests: ["src/project/sections/clip-edit/midi/keyboard-reachability.test.tsx"],
  },
  {
    name: "Cmd+A replaces the current note anchor",
    file: "src/project/sections/clip-edit/midi/useMidiEditor.ts",
    from: "setSelected(selectVisibleNotes(notes, view.window), currentNoteIndex)",
    to: "setSelected(selectVisibleNotes(notes, view.window), null)",
    tests: ["src/project/sections/clip-edit/midi/keyboard-reachability.test.tsx"],
  },
]

const extra = process.argv.slice(2)
const selected = extra.length
  ? mutations.filter(mutation => extra.some(name => mutation.name.includes(name)))
  : mutations
const digest = text => createHash("sha256").update(text).digest("hex").slice(0, 12)
const run = tests => {
  try {
    execFileSync(process.execPath, ["test", ...tests], { encoding: "utf8", stdio: "pipe" })
    return { failed: 0 }
  } catch (error) {
    const out = `${error.stdout ?? ""}${error.stderr ?? ""}`
    return { failed: Number(/(\d+) fail/.exec(out)?.[1] ?? Number.NaN), output: out }
  }
}

const baseline = run([...new Set(selected.flatMap(mutation => mutation.tests))])
console.log(`baseline: ${baseline.failed} failing`)
if (baseline.failed !== 0) {
  console.log(baseline.output)
  process.exit(1)
}
let survived = 0
for (const mutation of selected) {
  const original = readFileSync(mutation.file, "utf8")
  if (!original.includes(mutation.from)) {
    console.log(`MISSING  ${mutation.name}: pattern not found`)
    survived++
    continue
  }
  writeFileSync(
    mutation.file,
    original.replace(mutation.from, () => mutation.to)
  )
  try {
    const result = run(mutation.tests)
    console.log(
      `${result.failed > 0 ? "KILLED " : "SURVIVED"} ${mutation.name}: ${result.failed} failing`
    )
    if (!(result.failed > 0)) survived++
  } finally {
    writeFileSync(mutation.file, original)
  }
  if (digest(readFileSync(mutation.file, "utf8")) !== digest(original))
    throw new Error(`${mutation.file} was not restored`)
}
process.exit(survived ? 1 : 0)
