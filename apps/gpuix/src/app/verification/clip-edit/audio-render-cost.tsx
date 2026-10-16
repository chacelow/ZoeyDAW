import { spyOn } from "bun:test"
import { initializeVerificationProject } from "../project-creation"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { createNativeClipboard } from "@/platform/clipboard"
import {
  readProjectPeaks,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { ClipEditor } from "@/project/sections/clip-edit/ClipEditor"
import { createVerificationMedia } from "./demo/media"
import { seedClipEditProject } from "./demo/project"
import { clipEditorLabels as demoLabels } from "@/app/locales/sections/clip-edit"
import { audioTiming as recorder } from "./audio-timing"
import type { AudioPhase } from "./audio-timing"
import type { ClipEditorEnvironment } from "@/project/sections/clip-edit/environment"

const mode = process.argv[2]
if (mode !== "native-bounds" && mode !== "cached-bounds")
  throw new Error(
    "Usage: --preload audio-profile-preload.ts audio-render-cost.tsx native-bounds|cached-bounds"
  )
const releaseCreation = initializeVerificationProject("clip-audio-render-cost")
const media = createVerificationMedia()
const ids = seedClipEditProject(media.uri, "dense")
const root = createTestRoot({ width: 1100, height: 420 })
const listeners = new Set<(active: boolean) => void>()
const environment: ClipEditorEnvironment = {
  clipboard: createNativeClipboard(),
  subscribeWindowActive(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  drawMode: {
    markGesture() {
      throw new Error("Unexpected draw action")
    },
    latch() {
      throw new Error("Unexpected draw mode")
    },
  },
  onRegionKey() {
    throw new Error("Unexpected keyboard action")
  },
}
const apply = root.renderer.applyBatch.bind(root.renderer)
const applySpy = spyOn(root.renderer, "applyBatch").mockImplementation(commands =>
  recorder.time("applyBatch", () => apply(commands))
)
const nativeBounds = root.renderer.getElementBounds.bind(root.renderer)
let cachedId = -1
let cachedBox: { x: number; y: number; width: number; height: number } | undefined
root.renderer.getElementBounds = id =>
  recorder.time("getBounds", () =>
    mode === "cached-bounds" && id === cachedId && cachedBox ? cachedBox : nativeBounds(id)
  )
let release: (() => void) | undefined
function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    p50: sorted[Math.floor(sorted.length / 2)] ?? 0,
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1] ?? 0,
    max: sorted.at(-1) ?? 0,
  }
}
try {
  release = startProjectRuntime()
  if (!(await whenProjectBackendIdle())) throw new Error("Native project rejected")
  const track = useProjectState
    .getState()
    .document.tracks.find(track => track.clips.some(clip => clip.id === ids.audio))
  if (!track) throw new Error("Missing audio track")
  root.render(
    <ThemeProvider>
      <div style={{ display: "flex", width: 1100, height: 420 }}>
        <ClipEditor
          clipId={ids.audio}
          trackId={track.id}
          close={() => {
            throw new Error("Unexpected close")
          }}
          labels={demoLabels.en}
          readPeaks={readProjectPeaks}
          environment={environment}
        />
      </div>
    </ThemeProvider>
  )
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
  const surface = root.renderer.findByTestId("audio-surface")
  if (!surface) throw new Error("Missing audio surface")
  const box = nativeBounds(surface.id)
  if (!box) throw new Error("Missing audio bounds")
  cachedId = surface.id
  cachedBox = box
  const samples: (Record<AudioPhase, number> & { total: number; action: "zoom" | "scroll" })[] = []
  for (let cycle = 0; cycle < 3; cycle++)
    for (let step = 0; step < 10; step++) {
      recorder.reset()
      const start = performance.now()
      const zoom = step === 0 || step === 5
      const delta = step < 5 ? -120 : 120
      root.renderer.dispatchScrollWheel(
        box.x + box.width / 2,
        box.y + box.height / 2,
        zoom ? 0 : delta,
        zoom ? -delta : 0,
        zoom ? "cmd" : undefined
      )
      root.renderer.flush()
      const total = performance.now() - start
      samples.push({ total, action: zoom ? "zoom" : "scroll", ...recorder.totals })
      root.renderer.dispatchNativeEvents()
    }
  const fields: readonly ("total" | AudioPhase)[] = [
    "total",
    "render",
    "commit",
    "passive",
    "hostCommit",
    "applyBatch",
    "getBounds",
  ]
  const result = {
    mode,
    reactMode: process.env.NODE_ENV ?? "development",
    authoredNotes: 10000,
    authoredSteps: 1024,
    nodes: root.renderer.getRetainedElementCount(),
    timingScope:
      "CPU wall clock. renderRootSync, commitRoot, passive effects, host prepare/reset, applyBatch and getBounds are observed phases; nested columns overlap and must not be summed. Cached mode bypasses only stable surface-bounds TestRenderer flush, matching live renderer cached bounds semantics.",
    summary: Object.fromEntries(
      fields.map(key => [key, summarize(samples.map(sample => sample[key]))])
    ),
    samples,
  }
  const zoomSamples = samples.filter(sample => sample.action === "zoom")
  const zoomSummary = Object.fromEntries(
    fields.map(key => [key, summarize(zoomSamples.map(sample => sample[key]))])
  )
  Object.assign(result, { zoomSummary })
  Object.assign(result, { components: Object.fromEntries(recorder.components) })
  const steady = samples.slice(1)
  const acceptance = {
    cold: samples[0],
    raw: summarize(steady.map(sample => sample.total)),
    logging: summarize(steady.map(sample => sample.logging)),
    adjusted: summarize(steady.map(sample => Math.max(0, sample.total - sample.logging))),
    zoomAdjusted: summarize(
      steady
        .filter(sample => sample.action === "zoom")
        .map(sample => Math.max(0, sample.total - sample.logging))
    ),
    scrollAdjusted: summarize(
      steady
        .filter(sample => sample.action === "scroll")
        .map(sample => Math.max(0, sample.total - sample.logging))
    ),
  }
  Object.assign(result, { acceptance })
  const directory = path.join(import.meta.dir, "../../../project/sections/clip-edit/evidence")
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, `f4-audio-phases-${result.reactMode}-${mode}.json`),
    `${JSON.stringify(result, null, 2)}\n`
  )
  process.stdout.write(
    `${JSON.stringify({ acceptance, all: result.summary, zoom: zoomSummary })}\n`
  )
} finally {
  root.unmount()
  applySpy.mockRestore()
  release?.()
  media.dispose()
  releaseCreation()
}
if (root.renderer.getRetainedElementCount() !== 0 || listeners.size !== 0)
  throw new Error("Audio profile resources leaked")
