// Drags the left workspace divider in small steps and records, after every step, where the
// arrangement pieces are painted. A stable layout keeps the track header column glued to the
// timeline's right edge and keeps every bar at the same distance from the timeline's left edge
// (zoom unchanged); anything else is a visible jump.
//
//   bun scripts/perf/divider-jitter.ts [--steps 40] [--step 4] [--settle 0]
//
// --settle 0 samples right after each move, so `lag` shows how many pixels the painted layout
// trails the pointer; --settle 120 waits for the layout to catch up and isolates real jumps.
/* eslint-disable no-await-in-loop -- Each drag step must be observed before the next one is sent. */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { launch } from "../../vendor/gpuix/packages/native/js/automation/client.ts"

const { values } = parseArgs({
  options: {
    steps: { type: "string", default: "40" },
    step: { type: "string", default: "4" },
    settle: { type: "string", default: "0" },
  },
})
const steps = Number(values.steps)
const stepPx = Number(values.step)
const settleMs = Number(values.settle)

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const app = await launch({
  command: "bun",
  args: ["src/main.tsx"],
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
type Painted = Map<string, Bounds>

const sleep = (ms: number) => Bun.sleep(ms)

async function snapshot(): Promise<Painted> {
  const { tree } = await app.call("getTree", {})
  const painted: Painted = new Map()
  const walk = (node: TreeNode | null | undefined) => {
    if (!node) return
    if (node.testId && node.bounds && !painted.has(node.testId))
      painted.set(node.testId, node.bounds)
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree as TreeNode)
  return painted
}

function need(painted: Painted, testId: string): Bounds {
  const bounds = painted.get(testId)
  if (!bounds) throw new Error(`not painted: ${testId}`)
  return bounds
}

interface Sample {
  dx: number
  /** Timeline left edge minus where the divider drag should have put it. */
  lag: number
  /** Gap between the last track header column and the timeline's right edge. */
  headerGap: number
  /** How far the track rows paint past the timeline's right edge. */
  rowsOverflow: number
  /** Painted pixels per bar, from two ruler labels. */
  pxPerBar: number
  /** Bar 2's distance from the timeline's left edge, relative to the first sample. */
  barDrift: number
  /** Lane width the painted lane content leaves empty next to the track header. */
  laneUnderfill: number
}

try {
  let painted: Painted = new Map()
  for (let i = 0; i < 100 && !painted.has("project-workspace-border-divider-left"); i++) {
    await sleep(200)
    painted = await snapshot()
  }
  await sleep(1500)
  painted = await snapshot()
  const divider = need(painted, "project-workspace-border-divider-left")
  const mixerId = [...painted.keys()].find(id => id.startsWith("track-mixer-"))
  if (!mixerId) throw new Error("needs a project with at least one track")
  const start = { x: divider.x + divider.width / 2, y: divider.y + divider.height / 2 }
  const base = { layoutLeft: need(painted, "timeline-layout").x, bar2: Number.NaN }

  const samples: Sample[] = []
  const record = (dx: number, p: Painted) => {
    const layout = need(p, "timeline-layout")
    const rows = need(p, "track-rows")
    const mixer = need(p, mixerId)
    const trackId = mixerId.slice("track-mixer-".length)
    const lane = need(p, `track-lane-${trackId}`)
    const content = need(p, `lane-row-${trackId}`)
    const bars = [...p.keys()]
      .map(id => /^ruler-position-(\d+)$/.exec(id))
      .filter(m => m !== null)
      .map(m => ({ bar: Number(m[1]), x: need(p, m[0]).x - layout.x }))
      .sort((a, b) => a.bar - b.bar)
    const [first, second] = bars
    const pxPerBar = first && second ? (second.x - first.x) / (second.bar - first.bar) : Number.NaN
    const bar2 = first ? first.x - (first.bar - 2) * pxPerBar : Number.NaN
    if (Number.isNaN(base.bar2)) base.bar2 = bar2
    samples.push({
      dx,
      lag: +(layout.x - base.layoutLeft - dx).toFixed(1),
      headerGap: +(layout.x + layout.width - (mixer.x + mixer.width)).toFixed(1),
      rowsOverflow: +(rows.x + rows.width - (layout.x + layout.width)).toFixed(1),
      pxPerBar: +pxPerBar.toFixed(2),
      barDrift: +(bar2 - base.bar2).toFixed(1),
      laneUnderfill: +(lane.x + lane.width - (content.x + content.width)).toFixed(1),
    })
  }

  record(0, painted)
  await app.call("mouseMove", start)
  await app.call("mouseDown", { ...start, button: 0 })
  const offsets: number[] = []
  for (let i = 1; i <= steps; i++) offsets.push(i * stepPx)
  for (let i = steps - 1; i >= 0; i--) offsets.push(i * stepPx)
  for (const dx of offsets) {
    await app.call("mouseMove", { x: start.x + dx, y: start.y, pressedButton: 0 })
    if (settleMs) await sleep(settleMs)
    record(dx, await snapshot())
  }
  await app.call("mouseUp", { x: start.x, y: start.y, button: 0 })
  await sleep(500)
  record(0, await snapshot())

  const maxAbs = (key: keyof Sample) => Math.max(...samples.map(s => Math.abs(s[key])))
  const zooms = samples.map(s => s.pxPerBar)
  console.log(
    JSON.stringify(
      {
        samples: samples.length,
        maxAbs: {
          lag: maxAbs("lag"),
          headerGap: maxAbs("headerGap"),
          rowsOverflow: maxAbs("rowsOverflow"),
          barDrift: maxAbs("barDrift"),
          laneUnderfill: maxAbs("laneUnderfill"),
        },
        pxPerBar: { min: Math.min(...zooms), max: Math.max(...zooms) },
        trace: samples.filter((_, i) => i % 4 === 0),
      },
      null,
      2
    )
  )
} finally {
  await app.close()
}
