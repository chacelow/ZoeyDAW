import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
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
  for (const initialHeight of [34, 200]) {
    test(`batched grid preserves ${appearance} div pixels from height ${initialHeight} through scrolling, resizing and extreme zoom`, () => {
      hydrateProject(
        JSON.stringify({
          version: 2,
          document: createMockDocument(),
          workspace: createMockWorkspace(),
        })
      )
      const { document, workspace } = useProjectState.getState()
      const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
      scene.setMusic({
        bars: 128,
        grid: workspace.grid,
        transport: document.transport,
        markers: document.markers,
        tracks: document.tracks,
        loop: document.transport.loop,
      })
      const directory = mkdtempSync(path.join(tmpdir(), "timeline-grid-parity-"))
      const frames: Array<{
        pxPerBar: number
        scrollX: number
        height: number
        reference: Buffer<ArrayBuffer>
        divNodes: number
      }> = []
      try {
        for (const pxPerBar of [6.25, 100, 800, 131072]) {
          for (const scrollX of [0, 400.375]) {
            const height = scrollX === 0 ? initialHeight : initialHeight === 34 ? 200 : 34
            scene.setViewport({ width: 1200, height, pxPerBar, scrollX, scrollY: 0, dpr: 1 })
            const reference = createTestRoot({ width: 1200, height: 200 })
            try {
              reference.render(
                <ThemeProvider appearance={appearance}>
                  <DivGrid scene={scene} height={height} />
                </ThemeProvider>
              )
              reference.renderer.captureScreenshot(path.join(directory, "div.png"))
              frames.push({
                pxPerBar,
                scrollX,
                height,
                reference: readFileSync(path.join(directory, "div.png")),
                divNodes: reference.renderer.getRetainedElementCount(),
              })
            } finally {
              reference.unmount()
            }
          }
        }
        const root = createTestRoot({ width: 1200, height: 200 })
        const results: Array<{
          zoom: number
          scroll: number
          divNodes: number
          batchNodes: number
        }> = []
        try {
          for (const frame of frames) {
            scene.setViewport({
              width: 1200,
              height: frame.height,
              pxPerBar: frame.pxPerBar,
              scrollX: frame.scrollX,
              scrollY: 0,
              dpr: 1,
            })
            root.render(
              <ThemeProvider appearance={appearance}>
                <Grid scene={scene} height={frame.height} />
              </ThemeProvider>
            )
            root.renderer.captureScreenshot(path.join(directory, "batch.png"))
            expect(readFileSync(path.join(directory, "batch.png"))).toEqual(frame.reference)
            results.push({
              zoom: frame.pxPerBar,
              scroll: frame.scrollX,
              divNodes: frame.divNodes,
              batchNodes: root.renderer.getRetainedElementCount(),
            })
          }
          console.log(JSON.stringify(results))
        } finally {
          root.unmount()
        }
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
}
