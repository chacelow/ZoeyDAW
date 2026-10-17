import { expect, test } from "bun:test"
import { Profiler, useState } from "react"
import type { ReactNode } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { englishDockLabels } from "@/app/locales/sections/dock"
import { ListRow } from "@/ui/controls/ListRow"
import { DockLayout } from "./index"
import type { DockLayoutJSON, DockPanelRegistry } from "./index"

let contentCommits = 0
function HeavyContent({ name }: { name: string }) {
  return (
    <Profiler id={name} onRender={() => contentCommits++}>
      <div>
        {Array.from({ length: 24 }, (_, index) => (
          <ListRow key={index} label={`${name} long row label ${index}`} />
        ))}
      </div>
    </Profiler>
  )
}
const registry: DockPanelRegistry = {
  left: { title: "Left", minimumSize: 50, render: () => <HeavyContent name="Left" /> },
  right: { title: "Right", minimumSize: 50, render: () => <HeavyContent name="Right" /> },
  tools: { title: "Tools", minimumSize: 50, render: () => <HeavyContent name="Tools" /> },
}
function Harness({ layout: initial }: { layout: DockLayoutJSON }) {
  const [layout, setLayout] = useState(initial)
  return (
    <ThemeProvider>
      <DockLayout
        layout={layout}
        registry={registry}
        labels={englishDockLabels}
        onLayoutChange={setLayout}
      />
    </ThemeProvider>
  )
}
const splitLayout: DockLayoutJSON = {
  version: 2,
  borders: {},
  hidden: [],
  activeGroup: "left",
  maximizedGroup: null,
  root: {
    kind: "split",
    id: "split",
    orientation: "horizontal",
    sizes: [1, 1],
    children: [
      { kind: "group", id: "left", tabs: ["left"], active: "left" },
      { kind: "group", id: "right", tabs: ["right"], active: "right" },
    ],
  },
}
const borderLayout: DockLayoutJSON = {
  ...splitLayout,
  borders: { left: { tabs: ["tools"], selected: "tools", size: 240, type: "split" } },
}
async function measure(
  node: ReactNode,
  panelId: string,
  sashId: string,
  scenario: string,
  limit?: number
) {
  const root = createTestRoot({ width: 1400, height: 900 })
  let commits = 0
  try {
    root.render(
      <Profiler id={scenario} onRender={() => commits++}>
        {node}
      </Profiler>
    )
    for (let frame = 0; frame < 8; frame++) {
      await Bun.sleep(30)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    const sash = root.renderer.findByTestId(sashId),
      panel = root.renderer.findByTestId(panelId)
    const hit = sash && root.renderer.getElementBounds(sash.id),
      before = panel && root.renderer.getElementBounds(panel.id)
    if (!sash || !panel || !hit || !before)
      throw new Error(`Missing resize performance fixture: ${scenario}`)
    const x = hit.x + hit.width / 2,
      y = hit.y + hit.height / 2
    root.renderer.nativeSimulateMouseMove(x, y)
    root.renderer.nativeSimulateMouseDown(x, y)
    const times: number[] = [],
      counts: number[] = []
    for (let move = 1; move <= 24; move++) {
      commits = 0
      contentCommits = 0
      const start = performance.now()
      root.renderer.dispatchMouseMove(x + move, y, 0)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
      const elapsed = performance.now() - start
      if (move > 3) {
        times.push(elapsed)
        counts.push(contentCommits)
      }
      const width = root.renderer.getElementBounds(panel.id)?.width
      if (scenario === "heavy-dock-border") expect(width).toBeLessThan(before.width)
      else expect(width).toBeGreaterThan(before.width)
    }
    times.sort((a, b) => a - b)
    const p50 = times[Math.floor(times.length / 2)]
    process.stdout.write(
      JSON.stringify({
        scenario,
        p50Ms: p50,
        contentCommitsPerMove: Math.max(...counts),
        dockCommits: commits,
        samples: times.length,
        limitMs: limit ?? null,
      }) + "\n"
    )
    if (limit !== undefined) expect(p50).toBeLessThanOrEqual(limit)
    expect(Math.max(...counts)).toBe(0)
    root.renderer.nativeSimulateMouseUp(x + 24, y)
  } finally {
    root.unmount()
  }
}
const lightweightRegistry: DockPanelRegistry = {
  left: { title: "Left", minimumSize: 50, render: () => <text>Left content</text> },
  right: { title: "Right", minimumSize: 50, render: () => <text>Right content</text> },
}
function LightweightHarness() {
  const [layout, setLayout] = useState(splitLayout)
  return (
    <ThemeProvider>
      <DockLayout
        layout={layout}
        registry={lightweightRegistry}
        labels={englishDockLabels}
        onLayoutChange={setLayout}
      />
    </ThemeProvider>
  )
}

test("Dock divider previews keep heavy content out of per-move renders", async () => {
  const limit = process.env.CI ? 56 : 32
  await measure(
    <LightweightHarness />,
    "dock-group-left",
    "dock-divider-split-1",
    "lightweight-dock",
    process.env.CI ? 24 : 8
  )
  await measure(
    <Harness layout={splitLayout} />,
    "dock-group-left",
    "dock-divider-split-1",
    "heavy-dock-split",
    limit
  )
  await measure(
    <Harness layout={borderLayout} />,
    "dock-group-left",
    "dock-border-divider-left",
    "heavy-dock-border",
    process.env.CI ? 72 : 52
  )
})
