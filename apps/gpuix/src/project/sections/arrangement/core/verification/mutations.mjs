import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const core = fileURLToPath(new URL("../", import.meta.url))
const mutations = [
  [
    "hit-left-tolerance",
    "hit-test.ts",
    "fromLeft <= RESIZE_EDGE_PX",
    "fromLeft <= RESIZE_EDGE_PX - 1",
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
    "Math.exp(-downwardPixels / 100)",
    "Math.exp(downwardPixels / 100)",
  ],
]

const baseline = spawnSync(process.execPath, ["test", core], { encoding: "utf8" })
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
process.stdout.write("| Mutation | Failing tests |\n| --- | ---: |\n")
for (const [name, relative, from, to] of mutations) {
  const path = `${core}${relative}`
  const source = readFileSync(path, "utf8")
  if (source.split(from).length !== 2) throw new Error(`Mutation anchor must be unique: ${name}`)
  let result
  try {
    writeFileSync(
      path,
      source.replace(from, () => to)
    )
    result = spawnSync(process.execPath, ["test", core], { encoding: "utf8" })
  } finally {
    writeFileSync(path, source)
  }
  const output = `${result.stdout}${result.stderr}`
  const failures = Number(output.match(/(\d+) fail\b/u)?.[1] ?? 0)
  const propertyName = name.startsWith("hit-")
    ? "property: clip interior"
    : name.startsWith("time-")
      ? "property: time pixel"
      : name.startsWith("snap-")
        ? "property: snap lies"
        : name.startsWith("fade-")
          ? "property: fade anchors"
          : name.startsWith("zoom-")
            ? "preserves anchor pixels across seeded"
            : "lowers pxPerBar downward"
  if (!output.split("\n").some(line => line.includes("(fail)") && line.includes(propertyName))) {
    throw new Error(`Target invariant did not fail: ${name}\n${output}`)
  }
  if (result.status === 0 || failures === 0 || /SyntaxError|ParseError/u.test(output)) {
    throw new Error(`Mutation escaped or broke syntax: ${name}\n${output}`)
  }
  process.stdout.write(`| ${name} | ${failures} |\n`)
}
