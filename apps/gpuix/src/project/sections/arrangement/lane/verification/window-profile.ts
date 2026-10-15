import { writeFileSync } from "node:fs"
import { flushSync } from "@gpuix/react"
import type { useGpuix } from "@gpuix/react"
import { useLayoutEffect, useMemo } from "react"
import type { AnimationFrameSource } from "@/platform/frame"
import { useProjectState, whenProjectBackendIdle } from "@/project/adapters"
import type { LaneDemoRuntime } from "../demo/runtime"
import { beginFramePhases, markReactStart, recordObserver, takeFramePhases } from "./frame-phases"
import { MutationProfile } from "./mutation-profile"
import { takeProfileCounters } from "./profile-counters"
import { visibleRows, visibleClipCards } from "../render-projection"

type Renderer = NonNullable<ReturnType<typeof useGpuix>["renderer"]>
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

function nextNativeFrame(source: AnimationFrameSource, signal: AbortSignal): Promise<number> {
  const { promise, resolve, reject } = Promise.withResolvers<number>()
  const pending: { unsubscribe: (() => void) | null } = { unsubscribe: null }
  const abort = () => {
    pending.unsubscribe?.()
    reject(signal.reason)
  }
  pending.unsubscribe = source.subscribe(timestamp => {
    pending.unsubscribe?.()
    signal.removeEventListener("abort", abort)
    resolve(timestamp)
  })
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  return promise
}

function captureWindowMutations(renderer: Renderer) {
  const originalBatch = renderer.applyBatch.bind(renderer)
  const originalQuads = renderer.setQuads?.bind(renderer)
  const getStats = renderer.getDebugFrameOverlayStats?.bind(renderer)
  const resetStats = renderer.resetDebugFrameOverlayStats?.bind(renderer)
  if (!originalQuads || !getStats || !resetStats)
    throw new Error("Window profiling renderer capabilities are missing")
  const mutation = new MutationProfile()
  const batch = { calls: 0, ms: 0, uploadCalls: 0, uploadMs: 0, uploadValues: 0 }
  Reflect.set(renderer, "applyBatch", (payload: string) => {
    const before = performance.now()
    const destroyed = originalBatch(payload)
    batch.calls++
    batch.ms += performance.now() - before
    const observeStart = performance.now()
    mutation.observe(payload, destroyed)
    recordObserver(performance.now() - observeStart)
    return destroyed
  })
  Reflect.set(renderer, "setQuads", (id: number, values: Float32Array) => {
    const before = performance.now()
    originalQuads(id, values)
    batch.uploadCalls++
    batch.uploadValues += values.length
    batch.uploadMs += performance.now() - before
  })
  return { originalBatch, originalQuads, getStats, resetStats, mutation, batch }
}

export function useWindowProfile(
  renderer: Renderer | undefined,
  source: AnimationFrameSource,
  runtime: LaneDemoRuntime
): void {
  const capture = useMemo(() => {
    if (!renderer) throw new Error("Window profiling requires the real renderer")
    return captureWindowMutations(renderer)
  }, [renderer])
  useLayoutEffect(() => {
    if (!renderer) throw new Error("Window profiling requires the real renderer")
    const output = process.env.LANE_WINDOW_PROFILE_OUTPUT
    const rawDeadline = process.env.LANE_WINDOW_PROFILE_DEADLINE
    const deadline = rawDeadline?.endsWith("Z") ? Date.parse(rawDeadline) : Number.NaN
    if (!output || !Number.isFinite(deadline) || deadline <= Date.now())
      throw new Error("Window profiling requires an output path and future absolute UTC deadline")
    const { originalBatch, originalQuads, getStats, resetStats, mutation, batch } = capture
    const state: { disposed: boolean; error: string | null; phase: string } = {
      disposed: false,
      error: null,
      phase: "mounted",
    }
    const abort = new AbortController()
    const records: unknown[] = []
    const save = () =>
      writeFileSync(
        output,
        `${JSON.stringify(
          {
            event: "lane-window-profile",
            mode: process.env.NODE_ENV,
            protocol: "real background bun --hot window; fixed976x758;200x50;original10inputs",
            phase: state.phase,
            native: getStats(),
            viewport: runtime.scene.get().viewport,
            records,
            error: state.error,
          },
          null,
          2
        )}\n`
      )
    save()
    process.stdout.write("window-profile-mounted\n")
    const timer = setTimeout(() => {
      state.error = "Absolute UTC window profiling deadline reached"
      save()
      process.kill(process.pid, "SIGTERM")
    }, deadline - Date.now())
    timer.unref()
    const run = async () => {
      if (!(await whenProjectBackendIdle()))
        throw new Error("Native fixture backend did not become idle")
      const tracks = useProjectState
        .getState()
        .document.tracks.filter(track => track.kind === "audio" || track.kind === "midi")
      if (tracks.length !== 200 || tracks.some(track => track.clips.length !== 50))
        throw new Error("Window profiling workload changed")
      state.phase = "await-initial-native-frame"
      save()
      process.stdout.write("window-profile-await-frame\n")
      await nextNativeFrame(source, abort.signal)
      const initial = runtime.scene.get().viewport
      if (initial.width !== 976 || initial.height !== 758)
        throw new Error(`Window viewport changed: ${initial.width}x${initial.height}`)
      resetStats()
      state.phase = "replaying"
      takeProfileCounters()
      process.stdout.write("window-profile-ready\n")
      const replay = async (index: number): Promise<void> => {
        const step = steps[index]
        if (!step) return
        if (state.disposed || Date.now() >= deadline)
          throw new Error("Window profiling UTC gate closed")
        mutation.beginFrame()
        batch.calls = 0
        batch.ms = 0
        batch.uploadCalls = 0
        batch.uploadMs = 0
        batch.uploadValues = 0
        beginFramePhases(0)
        const presented = nextNativeFrame(source, abort.signal)
        const before = performance.now()
        let inputMs = 0
        flushSync(() => {
          const inputStart = performance.now()
          if (step.kind === "zoomIn" || step.kind === "zoomOut")
            runtime.zoom(step.kind === "zoomIn" ? 1 : -1)
          else
            runtime.wheel({
              elementId: 0,
              eventType: "scroll",
              deltaX: step.deltaX,
              deltaY: step.deltaY,
              precise: true,
            })
          inputMs = performance.now() - inputStart
          markReactStart()
        })
        const syncJsMs = performance.now() - before
        const phases = takeFramePhases()
        await presented
        const scene = runtime.scene.get()
        const rows = visibleRows(scene)
        records.push({
          step: step.kind,
          viewport: scene.viewport,
          syncJsMs,
          inputMs,
          phases,
          nativeDraw: getStats(),
          nativeFlush: null,
          taffy: null,
          host: { ...batch },
          mutations: mutation.snapshot(),
          counters: takeProfileCounters(),
          visibleRows: rows.length,
          visibleClips: rows.reduce(
            (sum, row) => sum + visibleClipCards(scene, row, false).length,
            0
          ),
        })
        save()
        await replay(index + 1)
      }
      await replay(0)
      process.stdout.write("window-profile-complete\n")
    }
    run().catch(error => {
      if (state.disposed) return
      state.error = String(error)
      save()
      process.stderr.write(`${state.error}\n`)
      process.kill(process.pid, "SIGTERM")
    })
    return () => {
      state.disposed = true
      abort.abort(new Error("Owned window profiling disposed"))
      clearTimeout(timer)
      Reflect.set(renderer, "applyBatch", originalBatch)
      Reflect.set(renderer, "setQuads", originalQuads)
    }
  }, [renderer, source, runtime, capture])
}
