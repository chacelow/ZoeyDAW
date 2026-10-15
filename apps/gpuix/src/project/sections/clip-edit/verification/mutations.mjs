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
    from: "event.preventDefault()\n      event.stopPropagation()",
    to: "event.preventDefault()",
    tests: ["src/project/sections/clip-edit/midi/MidiEditor.test.tsx"],
  },
  {
    name: "text field routes shortcuts to project undo",
    file: "src/project/sections/clip-edit/NameInput.tsx",
    from: "event.stopPropagation()",
    to: "finish(true); projectActions.undo()",
    tests: ["src/project/sections/clip-edit/ClipEditor.test.tsx"],
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
    return { failed: Number(/(\d+) fail/.exec(out)?.[1] ?? Number.NaN) }
  }
}

const baseline = run([...new Set(selected.flatMap(mutation => mutation.tests))])
console.log(`baseline: ${baseline.failed} failing`)
if (baseline.failed !== 0) process.exit(1)
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
