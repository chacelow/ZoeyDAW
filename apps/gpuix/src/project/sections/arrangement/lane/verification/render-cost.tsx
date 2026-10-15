import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { Profiler, useLayoutEffect } from "react"
import type { ProfilerOnRenderCallback } from "react"
import {
  projectActions,
  readProjectPeaks,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeClipboard } from "@/platform/clipboard"
import { CONTROLS_WIDTH } from "@/project/layout"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import type { Theme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { LaneRow } from "../LaneRow"
import { visibleRows } from "../render-projection"
import { labelsByLocale } from "../demo/labels"
import { createVerificationMedia } from "../demo/media"
import { seedLaneProject } from "../demo/project"
import { createTimelineController } from "../../timeline/controller"
import type { TimelineController } from "../../timeline/controller"
import { createSceneStore } from "../../core/scene"
import { createLaneController } from "../interactions/controller"
import type { LaneController } from "../interactions/controller"
import { takeProfileCounters } from "./profile-counters"

const viewportWidth = 976
const viewportHeight = 758
const media = createVerificationMedia()
let timeline: TimelineController | undefined
let lane: LaneController | undefined
let releaseBackend: (() => void) | undefined
let root: TestRoot | undefined
let retainedAfterUnmount: number
const profileEnabled = process.env.LANE_REACT_PROFILE === "1"
const renderDurations = new Map<string, { commits: number; actualMs: number; maxMs: number }>()

function CaptureMetrics({ onMetrics }: { onMetrics: (metrics: Theme["project"]) => void }) {
  const theme = useTheme()
  useLayoutEffect(() => {
    onMetrics(theme.project)
  }, [theme.project, onMetrics])
  return null
}

const onProfileRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  const entry = renderDurations.get(id) ?? { commits: 0, actualMs: 0, maxMs: 0 }
  entry.commits++
  entry.actualMs += actualDuration
  entry.maxMs = Math.max(entry.maxMs, actualDuration)
  renderDurations.set(id, entry)
}

function countTree(node: unknown) {
  const types: Record<string, number> = {}
  let mountedClips = 0
  let mountedRows = 0
  let waveformRoots = 0
  let waveformColumnNodes = 0
  const clipIds = new Set<string>()
  function visit(current: unknown) {
    if (
      !current ||
      typeof current !== "object" ||
      !("type" in current) ||
      typeof current.type !== "string"
    )
      throw new Error("Invalid native tree node")
    types[current.type] = (types[current.type] ?? 0) + 1
    let waveform = false
    if ("testId" in current && current.testId !== undefined) {
      if (typeof current.testId !== "string") throw new Error("Invalid native test ID")
      if (current.testId.startsWith("clip-source-")) {
        mountedClips++
        clipIds.add(current.testId.slice("clip-source-".length))
      }
      if (current.testId.startsWith("lane-row-") && !current.testId.startsWith("lane-row-content-"))
        mountedRows++
      waveform = current.testId.startsWith("waveform-")
      if (waveform) waveformRoots++
    }
    if ("children" in current) {
      if (!Array.isArray(current.children)) throw new Error("Invalid native tree children")
      if (waveform) waveformColumnNodes += current.children.length
      for (const child of current.children) visit(child)
    }
  }
  if (node !== null) visit(node)
  return { mountedClips, mountedRows, waveformRoots, waveformColumnNodes, types, clipIds }
}

function summarizeReactProfile(
  counters: ReturnType<typeof takeProfileCounters>,
  previousClipIds: ReadonlySet<string>,
  trackNames: ReadonlyMap<string, string>
) {
  const rows = Object.entries(counters.laneRows).map(([trackId, renders]) => ({
    trackId,
    name: trackNames.get(trackId),
    renders,
    clipRenders: Object.values(counters.clipCards[trackId] ?? {}).reduce(
      (sum, count) => sum + count,
      0
    ),
    actualMs: renderDurations.get(`row:${trackId}`)?.actualMs ?? 0,
  }))
  let peakCalls = 0
  let retainedDuplicateQueries = 0
  let remountedDuplicateQueries = 0
  for (const [clipId, reads] of Object.entries(counters.peakReads)) {
    peakCalls += reads.calls
    if (previousClipIds.has(clipId)) retainedDuplicateQueries += reads.duplicateQueries
    else remountedDuplicateQueries += reads.duplicateQueries
  }
  return {
    rows,
    rowRenders: rows.reduce((sum, row) => sum + row.renders, 0),
    clipRenders: rows.reduce((sum, row) => sum + row.clipRenders, 0),
    actualReactMs: rows.reduce((sum, row) => sum + row.actualMs, 0),
    peakCalls,
    retainedDuplicateQueries,
    remountedDuplicateQueries,
  }
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    count: sorted.length,
    medianMs: sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0,
    p90Ms: sorted[Math.ceil(sorted.length * 0.9) - 1] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  }
}

try {
  seedLaneProject(media.uri, true)
  releaseBackend = startProjectRuntime()
  if (!(await whenProjectBackendIdle()))
    throw new Error("Native backend did not accept the authored project")
  const state = useProjectState.getState()
  const editable = state.document.tracks.filter(
    track => track.kind === "audio" || track.kind === "midi"
  )
  if (
    editable.length !== 200 ||
    editable.some(track => track.clips.length !== 50) ||
    editable.reduce((sum, track) => sum + track.clips.length, 0) !== 10000
  )
    throw new Error("Stress content was reduced")
  const audio = editable.flatMap(track => track.clips).find(clip => clip.kind === "audio")
  if (!audio || audio.kind !== "audio") throw new Error("Audio source is missing")
  const peaks = readProjectPeaks(audio.samplePath, 1, 1.25, 32, audio.sourceOffsetBars ?? 0)
  if (peaks.length !== 128 || !peaks.some(peak => Math.abs(peak) > 0))
    throw new Error("Native waveform reader returned no source signal")

  let projectMetrics: Theme["project"] | undefined
  root = createTestRoot({ width: viewportWidth, height: viewportHeight })
  root.render(
    <ThemeProvider>
      <CaptureMetrics
        onMetrics={metrics => {
          projectMetrics = metrics
        }}
      />
    </ThemeProvider>
  )
  if (!projectMetrics) throw new Error("Theme metrics were not provided")
  const sceneStore = createSceneStore()
  timeline = createTimelineController({
    sceneStore,
    initialSize: {
      containerWidth: viewportWidth + CONTROLS_WIDTH,
      bodyHeight: viewportHeight,
      timelineLeft: 0,
    },
    metrics: projectMetrics,
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
  lane = createLaneController({
    scene: sceneStore,
    getState: useProjectState.getState,
    actions: projectActions,
    clipboard: createNativeClipboard(),
    edgePixels: projectMetrics.timelineAutoScrollEdge,
    setScroll: timeline.setScroll,
    markDrawModeGesture: timeline.keyboard.markDrawGesture,
  })
  const trackNames = new Map(state.document.tracks.map(track => [track.id, track.name]))
  let previousClipIds = new Set<string>()
  const render = () => {
    if (!lane || !root) throw new Error("Probe is not mounted")
    const scene = sceneStore.get()
    const controller = lane
    const before = performance.now()
    root.render(
      <ThemeProvider>
        <div
          style={sx({
            position: "relative",
            width: viewportWidth,
            height: viewportHeight,
            overflow: "hidden",
          })}
        >
          {visibleRows(scene).map(row => {
            const element = (
              <div
                key={row.track.id}
                style={sx({
                  position: "absolute",
                  top: row.clipTop,
                  left: 0,
                  width: viewportWidth,
                  height: row.clipBottom - row.clipTop,
                  overflow: "hidden",
                })}
              >
                <div
                  style={sx({
                    position: "absolute",
                    top: row.top - row.clipTop,
                    width: viewportWidth,
                    height: row.height,
                  })}
                >
                  <LaneRow
                    row={row}
                    scene={scene}
                    viewport={scene.viewport}
                    controller={controller}
                    readPeaks={readProjectPeaks}
                    labels={labelsByLocale.en}
                  />
                </div>
              </div>
            )
            return profileEnabled ? (
              <Profiler key={row.track.id} id={`row:${row.track.id}`} onRender={onProfileRender}>
                {element}
              </Profiler>
            ) : (
              element
            )
          })}
        </div>
      </ThemeProvider>
    )
    const renderAndFlushMs = performance.now() - before
    const flushStart = performance.now()
    root.renderer.flush()
    const additionalFlushMs = performance.now() - flushStart
    const { clipIds, ...tree } = countTree(root.renderer.toJSON())
    const profile = summarizeReactProfile(takeProfileCounters(), previousClipIds, trackNames)
    previousClipIds = clipIds
    renderDurations.clear()
    return {
      renderAndFlushMs,
      additionalFlushMs,
      viewport: scene.viewport,
      retained: root.renderer.getRetainedElementCount(),
      ...tree,
      profile,
    }
  }
  const first = render()
  root.renderer.resetDebugFrameOverlayStats()
  const steps = [
    { kind: "horizontal", deltaX: -480, deltaY: 0 },
    { kind: "vertical", deltaX: 0, deltaY: -360 },
    { kind: "horizontal", deltaX: -520, deltaY: 0 },
    { kind: "vertical", deltaX: 0, deltaY: -420 },
    { kind: "zoomIn" },
    { kind: "horizontal", deltaX: -600, deltaY: 0 },
    { kind: "vertical", deltaX: 0, deltaY: 440 },
    { kind: "zoomOut" },
    { kind: "horizontal", deltaX: 500, deltaY: 0 },
    { kind: "vertical", deltaX: 0, deltaY: 350 },
  ] as const
  const results = []
  for (const step of steps) {
    if (step.kind === "zoomIn" || step.kind === "zoomOut")
      timeline.view.stepZoom(step.kind === "zoomIn" ? 1 : -1)
    else
      timeline.view.wheel({
        elementId: 0,
        eventType: "scroll",
        deltaX: step.deltaX,
        deltaY: step.deltaY,
        precise: true,
      })
    results.push({ step: step.kind, ...render() })
  }
  const native = root.renderer.getDebugFrameOverlayStats()
  const retained = results.map(result => result.retained)
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "lane-render-cost",
        timestamp: new Date().toISOString(),
        viewport: { width: viewportWidth, height: viewportHeight },
        editableTracks: editable.length,
        clips: 10000,
        backend: state.session.backend.phase,
        nativePeakSamples: peaks.length,
        timingScope: "headless CPU React render + native flush; not real-window GPU frame time",
        projectionOwner: "timeline/controller",
        reactProfilingEnabled: profileEnabled,
        cpuRenderAndFlush: summarize(results.map(result => result.renderAndFlushMs)),
        cpuAdditionalFlush: summarize(results.map(result => result.additionalFlushMs)),
        retained: {
          initial: first.retained,
          min: Math.min(...retained),
          max: Math.max(...retained),
        },
        initial: first,
        steps: results,
        native: { meaningfulFrames: (native.frames ?? 0) > 0, stats: native },
      },
      null,
      2
    )}\n`
  )
} finally {
  try {
    root?.unmount()
    retainedAfterUnmount = root?.renderer.getRetainedElementCount() ?? 0
  } finally {
    try {
      try {
        lane?.dispose()
      } finally {
        try {
          timeline?.dispose()
        } finally {
          releaseBackend?.()
        }
      }
    } finally {
      media.dispose()
    }
  }
}
if (retainedAfterUnmount !== 0)
  throw new Error(`Lane tree leaked ${retainedAfterUnmount} native nodes after unmount`)
