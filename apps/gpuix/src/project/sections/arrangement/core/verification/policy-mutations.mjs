import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const core = fileURLToPath(new URL("../", import.meta.url))
const preload = fileURLToPath(new URL("./mutation-preload.ts", import.meta.url))
const tests = [
  "behavior-policy.test.ts",
  "meters/meter-policy.test.ts",
  "viewport/zoom-policy.test.ts",
  "../timeline/keyboard/controller.test.ts",
  "../timeline/rulers/controller.test.ts",
  "../timeline/viewport/controller.test.ts",
].map(file => path.resolve(core, file))
const mutations = [
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
    "performance.now() + policy.follow.manualPanPauseMs",
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
  ["marker-nudge", "../timeline/rulers/controller.ts", ": policy.markerNudgeBars", ": 1 / 16"],
  [
    "keyboard-velocity",
    "../timeline/keyboard/controller.ts",
    'key === "v" ? policy.velocityStep : -policy.velocityStep',
    'key === "v" ? 10 : -10',
  ],
]
const fingerprints = new Map(
  [...new Set(mutations.map(([, relative]) => path.resolve(core, relative)))].map(file => [
    file,
    createHash("sha256").update(readFileSync(file)).digest("hex"),
  ])
)

function run(mutation = []) {
  const [name = "", relative = "", from = "", to = ""] = mutation
  const result = spawnSync(process.execPath, ["test", "--preload", preload, ...tests], {
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      CORE_MUTATION: name,
      CORE_MUTATION_FILE: relative,
      CORE_MUTATION_FROM: from,
      CORE_MUTATION_TO: to,
    },
  })
  if (result.error) throw result.error
  return result
}

const baseline = run()
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
for (const mutation of mutations) {
  const [name, relative, from] = mutation
  if (readFileSync(path.resolve(core, relative), "utf8").split(from).length !== 2)
    throw new Error(`Mutation anchor must be unique: ${name}`)
  const result = run(mutation)
  const output = `${result.stdout}${result.stderr}`
  const failures = Number(output.match(/(\d+) fail\b/u)?.[1] ?? 0)
  if (
    result.status === 0 ||
    failures === 0 ||
    !output.includes(`[core-mutation] applied ${name}`) ||
    /SyntaxError|ParseError/u.test(output)
  )
    throw new Error(`Policy literal mutation escaped or broke syntax: ${name}\n${output}`)
  process.stdout.write(`${name}: ${failures} behavioral regression(s) failed\n`)
}
for (const [file, before] of fingerprints) {
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== before)
    throw new Error(`Mutation changed source on disk: ${file}`)
}
process.stdout.write(`${mutations.length} policy literal mutations killed; source unchanged.\n`)
