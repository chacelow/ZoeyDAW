import { spyOn } from "bun:test"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import * as engine from "@/platform/engine"
import { createNativeClipboard } from "@/platform/clipboard"
import {
  projectActions,
  readProjectPeaks,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import type { PeakReader } from "@/project/model/backend"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ClipEditor } from "../ClipEditor"
import { createVerificationMedia } from "../demo/media"
import { seedClipEditProject } from "../demo/project"
import { demoLabels } from "../demo/labels"
import type { ClipEditorEnvironment } from "../environment"

const [label, workload = "normal", only] = process.argv.slice(2)
if (!label || !/^[a-z0-9-]+$/.test(label) || (workload !== "normal" && workload !== "dense"))
  throw new Error("Usage: bun consumer-probe.tsx LABEL [normal|dense] [audio|midi|pattern]")
const replayDoubleWheel = process.env.CLIP_EDIT_REPLAY_DOUBLE_WHEEL === "1"
if (replayDoubleWheel && process.env.CLIP_EDIT_REFERENCE)
  throw new Error("Replay mode is only for the new single-owner consumer")
const output = path.join(import.meta.dir, "../evidence", `f4-${label}-${workload}`)
mkdirSync(output, { recursive: true })
const size = { width: 1100, height: 420 }
const media = createVerificationMedia()
// Observation only: spyOn without an implementation calls the real native function.
const opened = spyOn(engine, "openSession")
const ids = seedClipEditProject(media.uri, workload)
let release: (() => void) | undefined
const root = createTestRoot(size)
// TestRoot has no OS window activation callbacks; only desktop verification covers activation.
const activeListeners = new Set<(active: boolean) => void>()
const regionKeys: (number | undefined)[] = []
const drawGestures = { count: 0 }
const environment: ClipEditorEnvironment = {
  clipboard: createNativeClipboard(),
  subscribeWindowActive(listener) {
    activeListeners.add(listener)
    return () => activeListeners.delete(listener)
  },
  drawMode: {
    markGesture() {
      drawGestures.count++
    },
    latch: enabled => projectActions.setMode("drawMode", enabled),
  },
  onRegionKey: key => {
    regionKeys.push(key)
  },
}
const queries: {
  start: number
  end: number
  pixels: number
  offset: number
  floats: number
  ms: number
  hash: string
}[] = []
const reader: PeakReader = (source, start, end, pixels, offset) => {
  const before = performance.now()
  const peaks = readProjectPeaks(source, start, end, pixels, offset)
  const ms = performance.now() - before
  queries.push({ start, end, pixels, offset, floats: peaks.length, ms, hash: hashBytes(peaks) })
  return peaks
}
function Consumer({ kind }: { kind: "audio" | "midi" | "pattern" }) {
  const tracks = useProjectState(state => state.document.tracks)
  const track = tracks.find(item => item.clips.some(clip => clip.id === ids[kind]))
  const clip = track?.clips.find(item => item.id === ids[kind])
  if (!track || !clip) throw new Error(`Missing ${kind}`)
  return (
    <ClipEditor
      clipId={clip.id}
      trackId={track.id}
      close={() => {
        throw new Error("Probe unexpectedly closed")
      }}
      labels={demoLabels.en}
      readPeaks={reader}
      environment={environment}
    />
  )
}
function hashBytes(bytes: Uint8Array | Float32Array) {
  return createHash("sha256")
    .update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    .digest("hex")
}
function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1] ?? 0,
    max: sorted.at(-1) ?? 0,
  }
}
function census(node: unknown) {
  const types: Record<string, number> = {}
  const ids: Record<string, number> = {}
  function visit(value: unknown) {
    if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string")
      throw new Error("Invalid native retained node")
    types[value.type] = (types[value.type] ?? 0) + 1
    if ("testId" in value && typeof value.testId === "string") {
      const id = value.testId
      const group =
        value.type === "quad-batch"
          ? "quadBatches"
          : id.startsWith("midi-note-row-")
            ? "noteRows"
            : id.startsWith("midi-note-")
              ? "notes"
              : id.startsWith("midi-velocity-") && !id.startsWith("midi-velocity-value")
                ? "velocity"
                : id.startsWith("pattern-step-")
                  ? "steps"
                  : id
      ids[group] = (ids[group] ?? 0) + 1
    }
    if ("children" in value) {
      if (!Array.isArray(value.children)) throw new Error("Invalid native children")
      for (const child of value.children) visit(child)
    }
  }
  if (node !== null) visit(node)
  return { types, ids }
}
function bounds(id: string) {
  const element = root.renderer.findByTestId(id)
  const box = element && root.renderer.getElementBounds(element.id)
  if (!box) throw new Error(`Missing ${id}`)
  return box
}
function settle() {
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
}
function screenshot(name: string) {
  const filename = path.join(output, `${name}.png`)
  root.renderer.captureScreenshot(filename)
  return {
    file: filename,
    sha256: createHash("sha256").update(readFileSync(filename)).digest("hex"),
  }
}
function readPatternSteps(): boolean[] {
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.id === ids.pattern)
  if (clip?.kind !== "pattern" || !clip.steps) throw new Error("Missing verification Pattern data")
  return clip.steps
}

const results = []
try {
  release = startProjectRuntime()
  if (!(await whenProjectBackendIdle()))
    throw new Error("Real native engine did not accept project")
  const handle: unknown = opened.mock.results.at(-1)?.value
  if (typeof handle !== "number") throw new Error("No real session opened")
  const audio = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.id === ids.audio)
  if (audio?.kind !== "audio") throw new Error("Missing real audio clip")
  const decoded = engine.sourceInfo(handle, audio.samplePath)
  if (decoded?.sampleRate !== 44100 || decoded.frames !== 88200 || decoded.channels !== 2)
    throw new Error(`Incorrect decoded source metadata: ${JSON.stringify(decoded)}`)
  const peakChecks = [0, -0.25, 0.25, 1.25].map(offset => {
    const peaks = readProjectPeaks(audio.samplePath, 1, 1.25, 16384, offset)
    if (
      peaks.length !== 65536 ||
      !peaks.every(Number.isFinite) ||
      !peaks.some(value => value !== 0)
    )
      throw new Error("Full-resolution real peaks invalid")
    return { offset, floats: peaks.length, hash: hashBytes(peaks) }
  })
  if (peakChecks[2]?.hash !== peakChecks[3]?.hash)
    throw new Error("Native peak wrap is not cycle-equivalent")
  for (const kind of ["audio", "midi", "pattern"] as const) {
    if (only && kind !== only) continue
    queries.length = 0
    const mountStart = performance.now()
    root.render(
      <ThemeProvider>
        <div style={{ display: "flex", ...size }}>
          <Consumer key={kind} kind={kind} />
        </div>
      </ThemeProvider>
    )
    settle()
    const mountMs = performance.now() - mountStart
    const initialTree = census(root.renderer.toJSON())
    const initialNodes = root.renderer.getRetainedElementCount()
    const firstNote = root.renderer.findByTestId(
      `midi-note-${workload === "dense" ? "dense-0" : "c-0"}`
    )
    const measuredBounds =
      kind === "midi"
        ? {
            grid: bounds("midi-grid"),
            firstNote: firstNote ? root.renderer.getElementBounds(firstNote.id) : null,
            firstNoteStyle: firstNote?.style,
            velocity: bounds("midi-velocity"),
          }
        : kind === "pattern"
          ? {
              strip: bounds("pattern-steps"),
              first: bounds("pattern-step-0"),
              last: bounds(`pattern-step-${workload === "dense" ? 1023 : 15}`),
            }
          : null
    const initialImage = screenshot(`${kind}-initial`)
    root.renderer.resetDebugFrameOverlayStats()
    const timings: {
      cycle: number
      step: number
      action: "scroll" | "zoom" | "edit"
      actionAndFlushMs: number
      additionalFlushMs: number
      retained: number
      visibleNotes: number
      visibleVelocity: number
      peakQuery?: (typeof queries)[number]
    }[] = []
    const viewportImages = []
    const patternHitChecks: { requested: number; changed: number[] }[] = []
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let step = 0; step < 10; step++) {
        const box = bounds(
          kind === "pattern"
            ? `pattern-step-${step}`
            : kind === "audio"
              ? "audio-surface"
              : "midi-grid"
        )
        const before = performance.now()
        if (kind === "pattern") {
          const previous = cycle === 0 ? readPatternSteps() : null
          root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
          if (previous) {
            const current = readPatternSteps()
            patternHitChecks.push({
              requested: step,
              changed: current.flatMap((value, index) =>
                value !== previous[index] ? [index] : []
              ),
            })
          }
          root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
          const backend = useProjectState.getState().session.backend
          if (backend.phase !== "ready" || backend.pending !== 0 || backend.error)
            throw new Error("Synchronous native pattern transaction rejected")
        } else {
          const zoom = step === 0 || step === 5
          const delta = step < 5 ? -120 : 120
          const vertical = kind === "midi" && (step === 2 || step === 7)
          for (let repeat = 0; repeat < (replayDoubleWheel && kind === "midi" ? 2 : 1); repeat++) {
            root.renderer.dispatchScrollWheel(
              box.x + box.width / 2,
              box.y + box.height / 2,
              zoom || vertical ? 0 : delta,
              zoom ? -delta : vertical ? delta : 0,
              zoom ? "cmd" : undefined
            )
          }
        }
        root.renderer.flush()
        const actionAndFlushMs = performance.now() - before
        const flushStart = performance.now()
        root.renderer.flush()
        const additionalFlushMs = performance.now() - flushStart
        root.renderer.dispatchNativeEvents()
        const tree = census(root.renderer.toJSON())
        timings.push({
          cycle,
          step,
          action: kind === "pattern" ? "edit" : step === 0 || step === 5 ? "zoom" : "scroll",
          actionAndFlushMs,
          additionalFlushMs,
          retained: root.renderer.getRetainedElementCount(),
          visibleNotes: tree.ids.notes ?? 0,
          visibleVelocity: tree.ids.velocity ?? 0,
          peakQuery: kind === "audio" ? queries.at(-1) : undefined,
        })
        if (cycle === 0 && (step === 0 || step === 2))
          viewportImages.push(screenshot(`${kind}-step-${step}`))
      }
    }
    const finalImage = screenshot(`${kind}-final`)
    const edits = []
    if (kind === "midi") {
      const stem = root.renderer.findByTestId(
        `midi-velocity-${workload === "dense" ? "dense-0" : "c-0"}`
      )
      if (!stem) throw new Error("Missing active velocity slider for real edit sampling")
      for (let index = 0; index < 30; index++) {
        const before = performance.now()
        root.renderer.nativeSimulateKeystrokes(stem.id, index % 2 === 0 ? "up" : "down")
        root.renderer.flush()
        const actionAndFlushMs = performance.now() - before
        const state = useProjectState.getState()
        const edited = state.document.tracks
          .flatMap(track => track.clips)
          .find(clip => clip.id === ids.midi)
        if (
          edited?.kind !== "midi" ||
          edited.notes[0]?.velocity !==
            (workload === "dense" ? 1 : 96) + (index % 2 === 0 ? 1 : 0) ||
          state.session.backend.pending !== 0 ||
          state.session.backend.error
        )
          throw new Error("Real MIDI velocity edit was not accepted exactly once")
        edits.push(actionAndFlushMs)
      }
    }
    results.push({
      kind,
      mountMs,
      initialNodes,
      measuredBounds,
      initialTree,
      initialImage,
      viewportImages,
      finalTree: census(root.renderer.toJSON()),
      finalImage,
      actionAndFlushMs: summarize(timings.map(item => item.actionAndFlushMs)),
      additionalFlushMs: summarize(timings.map(item => item.additionalFlushMs)),
      byAction: Object.fromEntries(
        ["scroll", "zoom", "edit"].map(action => [
          action,
          summarize(
            timings.filter(item => item.action === action).map(item => item.actionAndFlushMs)
          ),
        ])
      ),
      editActionAndFlushMs: summarize(edits),
      patternHitChecks,
      native: root.renderer.getDebugFrameOverlayStats(),
      queries: [...queries],
      timings,
    })
  }
  const result = {
    timestamp: new Date().toISOString(),
    label,
    workload,
    reactMode: process.env.NODE_ENV ?? "development",
    inputProtocol: replayDoubleWheel
      ? "Legacy two-handler viewport replay; pixel parity only, not default performance gating"
      : process.env.CLIP_EDIT_REFERENCE
        ? "Historical consumer with duplicate native wheel handlers"
        : "Single native wheel owner",
    size,
    backend: useProjectState.getState().session.backend,
    decoded,
    peakChecks,
    authoredNotes: workload === "dense" ? 10000 : 13,
    authoredSteps: workload === "dense" ? 1024 : 16,
    drawGestures,
    regionKeys,
    timingScope:
      "Real ClipEditor + Rust backend + offscreen native GPU; scroll/zoom use dispatchScrollWheel plus exactly one native flush, redraw is one additional flush; editing includes native input's preflush (Pattern two complete clicks and two accepted edits); CPU wall time, not GPU completion or desktop frame time; bounds, census and PNG capture excluded",
    results,
  }
  writeFileSync(path.join(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(
    `${JSON.stringify({ label, workload, decoded, results: results.map(({ kind, initialNodes, actionAndFlushMs, additionalFlushMs, editActionAndFlushMs, byAction }) => ({ kind, initialNodes, actionAndFlushMs, additionalFlushMs, editActionAndFlushMs, byAction })) })}\n`
  )
} finally {
  root.unmount()
  release?.()
  opened.mockRestore()
  media.dispose()
}
if (root.renderer.getRetainedElementCount() !== 0)
  throw new Error("Native tree leaked after unmount")
if (activeListeners.size !== 0) throw new Error("Activation test seam leaked subscriptions")
