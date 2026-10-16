import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
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

for (const changedSource of ["majorWidth", "minorWidth", "minorOpacity"] as const) {
  test(`native arrangement grid consumes overridden ${changedSource} against an independent div oracle`, () => {
    const document = createMockDocument()
    const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    scene.setMusic({
      bars: 128,
      grid: { mode: "fixed", bars: 0.25 },
      transport: document.transport,
      markers: document.markers,
      tracks: document.tracks,
      loop: document.transport.loop,
    })
    scene.setViewport({ width: 640, height: 100, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
    const design = {
      ...DEFAULT_DESIGN_TOKENS,
      editor: {
        ...DEFAULT_DESIGN_TOKENS.editor,
        gridMinorStrokeWidth:
          changedSource === "minorWidth" ? 4 : DEFAULT_DESIGN_TOKENS.editor.gridMinorStrokeWidth,
      },
    }
    const project = {
      ...PROJECT_METRICS,
      arrangementGridMajorLineWidth:
        changedSource === "majorWidth" ? 3 : PROJECT_METRICS.arrangementGridMajorLineWidth,
      gridMinorOpacity: changedSource === "minorOpacity" ? 0.2 : PROJECT_METRICS.gridMinorOpacity,
    }
    const directory = mkdtempSync(path.join(tmpdir(), "timeline-grid-config-"))
    const root = createTestRoot({ width: 640, height: 100 })
    try {
      root.render(
        <ThemeProvider design={design} project={project}>
          <DivGrid scene={scene} height={100} />
        </ThemeProvider>
      )
      root.renderer.captureScreenshot(path.join(directory, "reference.png"))
      root.render(
        <ThemeProvider>
          <Grid scene={scene} height={100} />
        </ThemeProvider>
      )
      root.renderer.captureScreenshot(path.join(directory, "default.png"))
      root.render(
        <ThemeProvider design={design} project={project}>
          <Grid scene={scene} height={100} />
        </ThemeProvider>
      )
      root.renderer.captureScreenshot(path.join(directory, "override.png"))
      const actual = readFileSync(path.join(directory, "override.png"))
      expect(actual).toEqual(readFileSync(path.join(directory, "reference.png")))
      expect(actual).not.toEqual(readFileSync(path.join(directory, "default.png")))
    } finally {
      root.unmount()
      rmSync(directory, { recursive: true, force: true })
    }
  })
}
