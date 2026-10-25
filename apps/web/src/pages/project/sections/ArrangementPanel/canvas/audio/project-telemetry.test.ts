import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ProjectBackend, BackendControlRequest } from "@zoeydaw/project-core/backend"
import { hydrateProject, projectActions, startProjectRuntime } from "@/pages/project/adapters"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { createScheduler } from "../scheduler"
import { createPlayheadProjection } from "./playhead-projection"
import { attachProjectTelemetry } from "./project-telemetry"
import type { Scheduler } from "../scheduler"
import { configureProjectBackend } from "@/pages/project/adapters/context"

let scheduler: Scheduler
let stop: () => void
let detach: () => void
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
function frame(): void {
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) {
    callback(performance.now())
  }
}
function settle(): void {
  for (let attempt = 0; attempt < 5 && frames.size; attempt++) {
    frame()
  }
}
beforeEach(() => {
  configureProjectBackend(createMockProjectBackend)
  frames.clear()
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id)
  })
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  document.tracks = document.tracks.filter(track => track.id === "3-audio" || track.id === "main")
  hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
  scheduler = createScheduler()
  stop = startProjectRuntime()
  detach = () => {}
})
afterEach(() => {
  detach()
  stop()
  scheduler.dispose()
  vi.unstubAllGlobals()
})

it("sleeps while stopped and wakes for playback without perpetual idle frame polling", () => {
  const ring = createPlayheadProjection()
  detach = attachProjectTelemetry(ring, scheduler)
  settle()
  expect(frames.size).toBe(0)
  expect(ring.readPlayhead().playing).toBe(false)
  projectActions.togglePlay()
  frame()
  expect(ring.readPlayhead().playing).toBe(true)
  expect(frames.size).toBe(1)
  projectActions.stop()
  settle()
  expect(ring.readPlayhead().playing).toBe(false)
  expect(frames.size).toBe(0)
})

it("keeps the requested position through the first telemetry gap and clears stopped playback immediately", () => {
  stop()
  const pendingControl = new Promise<never>(() => {})
  const controls: BackendControlRequest[] = []
  configureProjectBackend(() => {
    const backend = createMockProjectBackend()
    return {
      ...backend,
      control(request) {
        controls.push(request)
        return pendingControl
      },
    } satisfies ProjectBackend
  })
  stop = startProjectRuntime()
  const ring = createPlayheadProjection()
  detach = attachProjectTelemetry(ring, scheduler)
  projectActions.seekBar(9.25)
  frame()
  expect(ring.readPlayhead().bar).toBe(9.25)
  projectActions.togglePlay()
  frame()
  expect(controls.length).toBeGreaterThan(0)
  expect(ring.readPlayhead()).toMatchObject({ bar: 9.25, playing: false })
  projectActions.stop()
  settle()
  expect(ring.readPlayhead().bar).toBe(9.25)
  expect(ring.readPlayhead().playing).toBe(false)
})
