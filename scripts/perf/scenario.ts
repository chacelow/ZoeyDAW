// One-command performance scenarios for the real gpuix window: `pnpm perf:scenario`.
//
// Launches the app (production by default, `--dev` for bun --hot semantics off but dev React),
// drives each scenario through automation input, and reports per scenario:
// - GPUI draw durations and draw count (automation `getFrameStats`)
// - React commits and rendered components (DevTools hook installed by a preload)
// - JS event-loop lag p50/p90
// Automation input does not need a foreground window, so this runs beside other work. For
// OS-level input-to-present latency against Ableton Live use scripts/perf/vs-live.
/* eslint-disable no-await-in-loop -- scenarios drive input step by step against a live window */
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { launch } from "../../vendor/gpuix/packages/native/js/automation/client.ts"
import type { TreeNode } from "../../vendor/gpuix/packages/native/js/automation/protocol.ts"

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const dev = process.argv.includes("--dev")
const temp = await mkdtemp(path.join(tmpdir(), "gpuix-perf-"))
const preload = path.join(temp, "perf-preload.ts")
// Reports once per 250ms on stderr; the parent reads the lines between scenario marks.
await writeFile(
  preload,
  `
type Fiber = { child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null; type: unknown; flags: number }
let commits = 0
let renders = 0
const walk = (fiber: Fiber | null) => {
  for (let f = fiber; f; f = f.sibling) {
    if (typeof f.type === "function" && f.flags & 1) renders++
    if (!(f.alternate && f.alternate.child === f.child)) walk(f.child)
  }
}
;(globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true, renderers: new Map(), inject: () => 1, checkDCE() {},
  onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  onCommitFiberRoot(_: number, fiberRoot: { current: Fiber }) { commits++; walk(fiberRoot.current) },
}
const lags: number[] = []
let expected = performance.now() + 4
const tick = () => { const now = performance.now(); lags.push(now - expected); expected = now + 4; setTimeout(tick, 4) }
setTimeout(tick, 4)
setInterval(() => {
  process.stderr.write("[perf] " + commits + " " + renders + " " + lags.join(",") + "\\n")
  commits = renders = 0
  lags.length = 0
}, 250)
`
)

interface Sample {
  commits: number
  renders: number
  lags: number[]
}
const samples: Sample[] = []
const app = await launch({
  command: "bun",
  args: ["--preload", preload, "src/main.tsx"],
  cwd: path.join(root, "apps/gpuix"),
  env: dev ? {} : { NODE_ENV: "production" },
  onStderr(chunk) {
    for (const line of chunk.split("\n")) {
      const match = /^\[perf\] (\d+) (\d+) (.*)$/.exec(line)
      if (match)
        samples.push({
          commits: Number(match[1]),
          renders: Number(match[2]),
          lags: match[3].split(",").filter(Boolean).map(Number),
        })
    }
  },
})

const sleep = (ms: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
const quantile = (values: number[], q: number) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))].toFixed(2))
}
const find = (node: TreeNode | null | undefined, testId: string): TreeNode | undefined => {
  if (!node) return undefined
  if (node.testId === testId) return node
  for (const child of node.children ?? []) {
    const hit = find(child, testId)
    if (hit) return hit
  }
  return undefined
}
const center = async (testId: string) => {
  const { tree } = await app.call("getTree", {})
  const bounds = find(tree, testId)?.bounds
  if (!bounds) throw new Error(`Missing painted testId: ${testId}`)
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
}

type Scenario = () => Promise<void>
const scenarios: Record<string, Scenario> = {
  async idle() {
    await sleep(1000)
  },
  async hover() {
    const { x, y } = await center("timeline-viewport")
    for (let i = 0; i < 60; i++) {
      await app.call("mouseMove", { x: x - 150 + i * 5, y })
      await sleep(8)
    }
  },
  async dividerDrag() {
    const { x, y } = await center("project-workspace-border-divider-left")
    await app.call("mouseDown", { x, y, button: 0 })
    for (let i = 1; i <= 60; i++) {
      await app.call("mouseMove", {
        x: x + (i % 30 < 15 ? i % 15 : 15 - (i % 15)) * 6,
        y,
        pressedButton: 0,
      })
      await sleep(8)
    }
    await app.call("mouseUp", { x, y, button: 0 })
  },
  async zoom() {
    const { x, y } = await center("timeline-viewport")
    for (let i = 0; i < 40; i++) {
      await app.call("scrollWheel", {
        x,
        y,
        deltaX: 0,
        deltaY: i < 20 ? -40 : 40,
        modifiers: "ctrl",
      })
      await sleep(16)
    }
  },
  async hscroll() {
    const { x, y } = await center("timeline-viewport")
    for (let i = 0; i < 40; i++) {
      await app.call("scrollWheel", { x, y, deltaX: i < 20 ? -40 : 40, deltaY: 0 })
      await sleep(16)
    }
  },
  async play() {
    const { x, y } = await center("timeline-viewport")
    await app.call("click", { x, y })
    await app.call("keystrokes", { keys: "space" })
    await sleep(1500)
    await app.call("keystrokes", { keys: "space" })
  },
}

const selected = process.argv.slice(2).filter(arg => !arg.startsWith("--"))
const results: Record<string, unknown> = {}
try {
  for (let i = 0; i < 150 && !(await app.call("getTree", {})).tree; i++) await sleep(200)
  await sleep(3000)
  for (const [name, run] of Object.entries(scenarios)) {
    if (selected.length > 0 && !selected.includes(name)) continue
    await sleep(500)
    await app.call("resetFrameStats", {})
    const first = samples.length
    const started = performance.now()
    await run()
    await sleep(300)
    const stats = await app.call("getFrameStats", {})
    const window = samples.slice(first)
    results[name] = {
      seconds: Number(((performance.now() - started) / 1000).toFixed(2)),
      draws: stats.samples,
      drawP90: stats.p90Ms === undefined ? null : Number(stats.p90Ms.toFixed(2)),
      drawMax: stats.maxMs === undefined ? null : Number(stats.maxMs.toFixed(2)),
      reactCommits: window.reduce((n, s) => n + s.commits, 0),
      renderedComponents: window.reduce((n, s) => n + s.renders, 0),
      eventLoopLagP50: quantile(
        window.flatMap(s => s.lags),
        0.5
      ),
      eventLoopLagP90: quantile(
        window.flatMap(s => s.lags),
        0.9
      ),
    }
  }
  console.log(JSON.stringify({ mode: dev ? "dev" : "production", scenarios: results }, null, 2))
} finally {
  await app.close()
  await rm(temp, { recursive: true, force: true })
}
