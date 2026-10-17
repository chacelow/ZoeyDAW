import { expect, test } from "bun:test"
import { Profiler, useState } from "react"
import type { ReactNode } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { englishDockLabels } from "@/app/locales/sections/dock"
import { GalleryDemo } from "@/gallery/GalleryDemo"
import { DockLayout } from "./index"
import type { DockLayoutJSON, DockPanelRegistry } from "./index"

const registry: DockPanelRegistry = {
  left: { title: "Left", minimumSize: 50, render: () => <text>Left content</text> },
  right: { title: "Right", minimumSize: 50, render: () => <text>Right content</text> },
}
function LightweightDock() {
  const [layout, setLayout] = useState<DockLayoutJSON>({ version: 2, borders: {}, hidden: [], activeGroup: "left", maximizedGroup: null, root: { kind: "split", id: "split", orientation: "horizontal", sizes: [1, 1], children: [{ kind: "group", id: "left", tabs: ["left"], active: "left" }, { kind: "group", id: "right", tabs: ["right"], active: "right" }] } })
  return <ThemeProvider><DockLayout layout={layout} registry={registry} labels={englishDockLabels} onLayoutChange={setLayout} /></ThemeProvider>
}
async function measure(node: ReactNode, sashId: string, panelId: string, scenario: string, limit?: number) {
  const root = createTestRoot({ width: 1400, height: 900 })
  let commits = 0
  try {
    root.render(<Profiler id={scenario} onRender={() => commits++}>{node}</Profiler>)
    for (let frame = 0; frame < 8; frame++) { await Bun.sleep(30); root.renderer.flush(); root.renderer.dispatchNativeEvents() }
    const sash = root.renderer.findByTestId(sashId), panel = root.renderer.findByTestId(panelId)
    const hit = sash && root.renderer.getElementBounds(sash.id), before = panel && root.renderer.getElementBounds(panel.id)
    if (!sash || !panel || !hit || !before) throw new Error("Missing resize performance fixture")
    if (scenario === "gallery-realtime-resize") expect(root.renderer.findByTestId("gallery-theme-panel")).toBeUndefined()
    const x = hit.x + hit.width / 2, y = hit.y + hit.height / 2
    root.renderer.nativeSimulateMouseMove(x, y)
    root.renderer.nativeSimulateMouseDown(x, y)
    const times: number[] = [], counts: number[] = []
    for (let move = 1; move <= 24; move++) {
      commits = 0
      const start = performance.now()
      root.renderer.dispatchMouseMove(x + move, y, 0)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
      const elapsed = performance.now() - start
      if (move > 3) { times.push(elapsed); counts.push(commits) }
      expect(root.renderer.getElementBounds(panel.id)?.width).toBeGreaterThan(before.width)
    }
    times.sort((a, b) => a - b)
    const p50 = times[Math.floor(times.length / 2)]
    process.stdout.write(JSON.stringify({ scenario, p50Ms: p50, maxCommitsPerMove: Math.max(...counts), samples: times.length, limitMs: limit ?? null }) + "\n")
    if (limit !== undefined) expect(p50).toBeLessThanOrEqual(limit)
    expect(Math.max(...counts)).toBeLessThanOrEqual(1)
    root.renderer.nativeSimulateMouseUp(x + 24, y)
  } finally { root.unmount() }
}

test("lightweight Dock realtime resize is one commit and at most 8ms p50", async () => {
  await measure(<LightweightDock />, "dock-divider-split-1", "dock-group-left", "dock-realtime-resize", process.env.CI ? 24 : 8)
})
test("Gallery realtime resize reports its full native content cost without mounting the collapsed Theme", async () => {
  await measure(<GalleryDemo />, "gallery-workspace-border-divider-left", "gallery-workspace-border-panel-left-group-border:left", "gallery-realtime-resize")
})
