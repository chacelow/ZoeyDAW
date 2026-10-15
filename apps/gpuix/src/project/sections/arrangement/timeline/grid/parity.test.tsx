import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { hydrateProject, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import { Grid as DivGrid } from "./div-reference.test-helper"
import { Grid } from "."

for (const appearance of ["dark", "light"] as const) {
  for (const height of [34, 200]) {
    test(`batched grid preserves ${appearance} div pixels at height ${height}, fractional scroll and extreme zoom`, () => {
      hydrateProject(
        JSON.stringify({
          version: 2,
          document: createMockDocument(),
          workspace: createMockWorkspace(),
        })
      )
      const { document, workspace } = useProjectState.getState()
      const scene = createSceneStore()
      scene.setMusic({
        bars: 128,
        grid: workspace.grid,
        transport: document.transport,
        markers: document.markers,
        tracks: document.tracks,
        loop: document.transport.loop,
      })
      const directory = mkdtempSync(path.join(tmpdir(), "timeline-grid-parity-"))
      const results: Array<{ zoom: number; scroll: number; divNodes: number; batchNodes: number }> =
        []
      try {
        for (const pxPerBar of [6.25, 100, 800, 131072]) {
          for (const scrollX of [0, 400.375]) {
            scene.setViewport({ width: 1200, height, pxPerBar, scrollX, scrollY: 0, dpr: 1 })
            const root = createTestRoot({ width: 1200, height })
            try {
              root.render(
                <ThemeProvider appearance={appearance}>
                  <DivGrid scene={scene} height={height} />
                </ThemeProvider>
              )
              root.renderer.captureScreenshot(path.join(directory, "div.png"))
              const divNodes = root.renderer.getRetainedElementCount()
              root.render(
                <ThemeProvider appearance={appearance}>
                  <Grid scene={scene} height={height} />
                </ThemeProvider>
              )
              root.renderer.captureScreenshot(path.join(directory, "batch.png"))
              const batchNodes = root.renderer.getRetainedElementCount()
              expect(readFileSync(path.join(directory, "batch.png"))).toEqual(
                readFileSync(path.join(directory, "div.png"))
              )
              results.push({ zoom: pxPerBar, scroll: scrollX, divNodes, batchNodes })
            } finally {
              root.unmount()
            }
          }
        }
        console.log(JSON.stringify(results))
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
}
