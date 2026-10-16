import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const core = fileURLToPath(new URL("../", import.meta.url))
const preload = fileURLToPath(new URL("./mutation-preload.ts", import.meta.url))
const mutations = [
  [
    "hit-left-tolerance",
    "hit-test.ts",
    "fromLeft <= hit.clipResizeEdge",
    "fromLeft <= hit.clipResizeEdge - 1",
  ],
  ["hit-right-sign", "hit-test.ts", "left + width - pointX", "pointX - left - width"],
  [
    "time-scroll-sign",
    "automation/geometry.ts",
    "x + scene.viewport.scrollX",
    "x - scene.viewport.scrollX",
  ],
  ["time-origin", "automation/geometry.ts", "return 1 + (x +", "return 0 + (x +"],
  [
    "snap-disabled",
    "rulers/geometry.ts",
    "snapBar(barAt(scene, x), snap,",
    "snapBar(barAt(scene, x), false,",
  ],
  [
    "snap-double-cell",
    "rulers/geometry.ts",
    "snap, scene.gridPlan.cellBars,",
    "snap, scene.gridPlan.cellBars * 2,",
  ],
  [
    "fade-curve-unclamped",
    "clip/fade.ts",
    "clampFadeCurve(\n      state.curve +",
    "(state.curve +",
  ],
  [
    "fade-position-unclamped",
    "clip/fade.ts",
    "Math.max(\n      state.gap,\n      Math.min(1 - state.gap, state.position + (current.x - state.last.x) / state.width)\n    )",
    "state.position + (current.x - state.last.x) / state.width",
  ],
  [
    "zoom-offset-sign",
    "viewport/zoom.ts",
    "(anchorBar - 1) * next - offset",
    "(anchorBar - 1) * next + offset",
  ],
  [
    "zoom-anchor-scale",
    "viewport/zoom.ts",
    "(scrollX + offset) / pxPerBar",
    "(scrollX + offset) / (pxPerBar * 2)",
  ],
  [
    "minimap-direction",
    "viewport/zoom.ts",
    "Math.exp(-downwardPixels / policy.minimapPixelsPerExponent)",
    "Math.exp(downwardPixels / policy.minimapPixelsPerExponent)",
  ],
  [
    "freehand-original-samples-only",
    "automation/drawing.ts",
    "swept.every(interval => point.bar < interval.start || point.bar > interval.end)",
    "cells.every(cell => !(Math.abs(point.bar - cell.bar) < 0.000001))",
    "freehand removes off-grid original spikes only inside the swept interval",
  ],
  [
    "freehand-prior-samples-retained",
    "automation/drawing.ts",
    "painted.delete(point.key)",
    "painted.get(point.key)",
    "freehand reverse sweeps replace prior samples at different bar positions",
  ],
  [
    "freehand-forget-swept-intervals",
    "automation/drawing.ts",
    "for (const interval of state.swept)",
    "for (const interval of [])",
    "freehand retains earlier swept intervals without erasing unpainted viewport gaps",
  ],
]

const fingerprints = new Map(
  [...new Set(mutations.map(([, relative]) => `${core}${relative}`))].map(path => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ])
)

function run(mutation = []) {
  const [name = "", relative = "", from = "", to = ""] = mutation
  const result = spawnSync(process.execPath, ["test", "--preload", preload, core], {
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      CORE_MUTATION: name,
      CORE_MUTATION_FILE: relative,
      CORE_MUTATION_FROM: from,
      CORE_MUTATION_TO: to,
    },
    timeout: 120000,
  })
  if (result.error) throw result.error
  return result
}

const baseline = run()
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
process.stdout.write("| Mutation | Failing tests |\n| --- | ---: |\n")
for (const mutation of mutations) {
  const [name, relative, from, , testName] = mutation
  const path = `${core}${relative}`
  const source = readFileSync(path, "utf8")
  if (source.split(from).length !== 2) throw new Error(`Mutation anchor must be unique: ${name}`)
  const result = run(mutation)
  const output = `${result.stdout}${result.stderr}`
  const failures = Number(output.match(/(\d+) fail\b/u)?.[1] ?? 0)
  const propertyName =
    testName ??
    (name.startsWith("hit-")
      ? "property: clip interior"
      : name.startsWith("time-")
        ? "property: time pixel"
        : name.startsWith("snap-")
          ? "property: snap lies"
          : name.startsWith("fade-")
            ? "property: fade anchors"
            : name.startsWith("zoom-")
              ? "preserves anchor pixels across seeded"
              : "lowers pxPerBar downward")
  if (
    !output.includes(`[core-mutation] applied ${name}`) ||
    !output.split("\n").some(line => line.includes("(fail)") && line.includes(propertyName))
  ) {
    throw new Error(`Target invariant did not fail: ${name}\n${output}`)
  }
  if (result.status === 0 || failures === 0 || /SyntaxError|ParseError/u.test(output)) {
    throw new Error(`Mutation escaped or broke syntax: ${name}\n${output}`)
  }
  process.stdout.write(`| ${name} | ${failures} |\n`)
}
for (const [path, before] of fingerprints) {
  const after = createHash("sha256").update(readFileSync(path)).digest("hex")
  if (before !== after) throw new Error(`Mutation target changed on disk: ${path}`)
}
process.stdout.write("Mutation targets unchanged on disk.\n")
