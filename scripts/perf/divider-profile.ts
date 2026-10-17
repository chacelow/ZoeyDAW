// Drags the Browser divider like a real pointer (one move per 8ms) and reports what the drag
// costs: React commits, which components re-rendered and how often, and JS event-loop stalls.
// Use it to see which component logic makes a resize stutter.
//
//   bun scripts/perf/divider-profile.ts [--moves 120] [--step 3] [--interval 8]
/* eslint-disable no-await-in-loop -- Moves are paced like a real pointer. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { launch } from "../../vendor/gpuix/packages/native/js/automation/client.ts"

const { values } = parseArgs({
  options: {
    moves: { type: "string", default: "120" },
    step: { type: "string", default: "3" },
    interval: { type: "string", default: "8" },
  },
})
const moves = Number(values.moves)
const stepPx = Number(values.step)
const intervalMs = Number(values.interval)

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const temp = await mkdtemp(path.join(tmpdir(), "gpuix-divider-profile-"))
const preload = path.join(temp, "preload.ts")

// Runs inside the app process: a minimal React DevTools hook that names every component which
// rendered in each commit, and a 4ms timer that measures event-loop stalls. Recording starts and
// stops when this script creates the `start` / `stop` files in the shared temp directory.
await writeFile(
  preload,
  `
import { existsSync, rmSync, writeFileSync } from "node:fs"
type Fiber = { child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null; type: any; flags: number }
const dir = ${JSON.stringify(temp)}
const state = { recording: false, commits: 0, renders: new Map<string, number>(), lag: [] as number[] }
const nameOf = (type: any) => type?.displayName ?? type?.name ?? type?.type?.displayName ?? type?.type?.name ?? type?.render?.name ?? "anonymous"
function walk(fiber: Fiber | null) {
  while (fiber) {
    const rendered = fiber.alternate === null || (fiber.flags & 1) !== 0
    if (rendered && fiber.type !== null && (typeof fiber.type === "function" || typeof fiber.type === "object")) {
      const name = nameOf(fiber.type)
      state.renders.set(name, (state.renders.get(name) ?? 0) + 1)
    }
    if (!(fiber.alternate && fiber.alternate.child === fiber.child)) walk(fiber.child)
    fiber = fiber.sibling
  }
}
;(globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true, renderers: new Map(), inject: () => 1,
  onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {},
  onCommitFiberRoot(_: number, root: { current: Fiber }) { if (!state.recording) return; state.commits++; walk(root.current.child) },
}
let expected = performance.now() + 4
setInterval(() => {
  const now = performance.now()
  if (state.recording) state.lag.push(now - expected)
  expected = now + 4
  if (!state.recording && existsSync(dir + "/start")) {
    rmSync(dir + "/start")
    state.recording = true; state.commits = 0; state.renders.clear(); state.lag.length = 0
  }
  if (state.recording && existsSync(dir + "/stop")) {
    rmSync(dir + "/stop")
    state.recording = false
    writeFileSync(dir + "/report.json", JSON.stringify({ commits: state.commits, renders: [...state.renders].sort((a, b) => b[1] - a[1]), lag: state.lag }))
  }
}, 4)
`
)

const app = await launch({
  command: "bun",
  args: ["--preload", preload, "src/main.tsx"],
  cwd: path.join(root, "apps/gpuix"),
})

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
interface TreeNode {
  testId?: string
  bounds?: Bounds
  children?: TreeNode[]
}
function find(node: TreeNode | null | undefined, testId: string): Bounds | undefined {
  if (!node) return undefined
  if (node.testId === testId && node.bounds) return node.bounds
  for (const child of node.children ?? []) {
    const hit = find(child, testId)
    if (hit) return hit
  }
  return undefined
}

try {
  let divider: Bounds | undefined
  for (let i = 0; i < 100 && !divider; i++) {
    await Bun.sleep(200)
    const { tree } = await app.call("getTree", {})
    divider = find(tree as TreeNode, "project-workspace-border-divider-left")
  }
  if (!divider) throw new Error("divider never painted")
  await Bun.sleep(1500)
  const start = { x: divider.x + divider.width / 2, y: divider.y + divider.height / 2 }
  await app.call("mouseMove", start)
  await app.call("mouseDown", { ...start, button: 0 })
  await writeFile(path.join(temp, "start"), "")
  await Bun.sleep(50)
  const t0 = performance.now()
  for (let i = 1; i <= moves; i++) {
    const dx = (i <= moves / 2 ? i : moves - i) * stepPx
    await app.call("mouseMove", { x: start.x + dx, y: start.y, pressedButton: 0 })
    const wait = t0 + i * intervalMs - performance.now()
    if (wait > 0) await Bun.sleep(wait)
  }
  const elapsed = performance.now() - t0
  await app.call("mouseUp", { x: start.x, y: start.y, button: 0 })
  await Bun.sleep(300)
  await writeFile(path.join(temp, "stop"), "")
  const report = path.join(temp, "report.json")
  for (let i = 0; i < 50 && !(await Bun.file(report).exists()); i++) await Bun.sleep(100)
  const data = JSON.parse(await readFile(report, "utf8")) as {
    commits: number
    renders: Array<[string, number]>
    lag: number[]
  }
  const lag = data.lag.toSorted((a, b) => a - b)
  const q = (f: number) => +(lag[Math.floor(f * (lag.length - 1))] ?? 0).toFixed(1)
  const total = data.renders.reduce((n, [, c]) => n + c, 0)
  console.log(
    JSON.stringify(
      {
        moves,
        wallMs: Math.round(elapsed),
        movesPerSecond: Math.round((moves / elapsed) * 1000),
        reactCommits: data.commits,
        componentRenders: total,
        rendersPerCommit: +(total / Math.max(1, data.commits)).toFixed(1),
        eventLoopStallMs: { p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1) },
        topRenders: data.renders.slice(0, 40),
      },
      null,
      2
    )
  )
} finally {
  await app.close()
  await rm(temp, { recursive: true, force: true })
}
