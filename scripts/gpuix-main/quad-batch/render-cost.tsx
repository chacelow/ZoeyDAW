import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Surface } from "./Surface"
import { PROJECT, STEPS, summarize, VIEWPORT } from "./workload"

const mode = process.argv[2]
if (mode !== "div" && mode !== "quad")
  throw new Error("Usage: bun render-cost.tsx div|quad [screenshot.png]")

function runProbe(mode: "div" | "quad") {
  const root = createTestRoot(VIEWPORT)
  const nativeFlush = root.renderer.flush.bind(root.renderer)
  let nativeFlushMs = 0
  root.renderer.flush = () => {
    const start = performance.now()
    nativeFlush()
    nativeFlushMs += performance.now() - start
  }
  try {
    const render = (viewport: (typeof STEPS)[number]) => {
      nativeFlushMs = 0
      const start = performance.now()
      root.render(
        <ThemeProvider>
          <Surface mode={mode} viewport={viewport} />
        </ThemeProvider>
      )
      const renderAndFlushMs = performance.now() - start
      const nativeDuringRenderMs = nativeFlushMs
      const flushStart = performance.now()
      root.renderer.flush()
      return {
        renderAndFlushMs,
        nativeDuringRenderMs,
        reactAndMutationMs: renderAndFlushMs - nativeDuringRenderMs,
        additionalFlushMs: performance.now() - flushStart,
        retained: root.renderer.getRetainedElementCount(),
      }
    }
    const initial = render({ x: 0, y: 0, zoom: 1 })
    if (process.argv[3]) root.renderer.captureScreenshot(process.argv[3])
    root.renderer.resetDebugFrameOverlayStats()
    const samples = []
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const viewport of STEPS) samples.push(render(viewport))
    }
    const result = {
      reactMode: process.env.NODE_ENV ?? "development",
      mode,
      workload: { ...PROJECT, rectangles: 14065, grid: 1565, midiNotes: 2500, peakColumns: 10000 },
      viewport: VIEWPORT,
      initial,
      timingScope:
        "Synthetic equal-geometry CPU React render + headless native flush; not lane readProjectPeaks or GPU completion time",
      cpuRenderAndFlush: summarize(samples.map(s => s.renderAndFlushMs)),
      cpuAdditionalFlush: summarize(samples.map(s => s.additionalFlushMs)),
      nativeDuringRender: summarize(samples.map(s => s.nativeDuringRenderMs)),
      reactAndMutation: summarize(samples.map(s => s.reactAndMutationMs)),
      native: root.renderer.getDebugFrameOverlayStats(),
      samples,
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } finally {
    root.unmount()
  }
  const retainedAfterUnmount = root.renderer.getRetainedElementCount()
  if (retainedAfterUnmount !== 0)
    throw new Error(`Retained tree leaked ${retainedAfterUnmount} nodes`)
}

runProbe(mode)
