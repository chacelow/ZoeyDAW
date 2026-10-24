import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  hydrateProject,
  projectActions,
  startProjectRuntime,
  useProjectState,
} from "@/pages/project/adapters"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { createScheduler } from "../scheduler"
import { createAudioRingBuffer } from "./ring-buffer"
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
  const ring = createAudioRingBuffer()
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

it("reclaims deleted offscreen track slots without relying on mounted meter components", () => {
  projectActions.addTrack("midi")
  const ring = createAudioRingBuffer({ maxTracks: 3 })
  detach = attachProjectTelemetry(ring, scheduler)
  settle()
  ring.writeMeter("3-audio", { left: -2, right: -3 })
  projectActions.deleteTracks(["3-audio"])
  settle()
  projectActions.addTrack("audio")
  settle()
  const created = useProjectState.getState().document.tracks.find(track => track.kind === "audio")!
  ring.writeMeter(created.id, { left: -4, right: -9 })
  expect(ring.readMeter(created.id)).toEqual({ left: -4, right: -9 })
  expect(ring.readMeter("3-audio")).toEqual({ left: -Infinity, right: -Infinity })
  expect(frames.size).toBe(0)
})
