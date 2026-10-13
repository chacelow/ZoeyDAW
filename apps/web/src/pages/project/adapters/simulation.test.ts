// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  hydrateProject,
  projectActions,
  readSimulatedBar,
  startProjectSimulation,
  useProjectState,
} from "."
import { createMockDocument, createMockWorkspace } from "./fixtures"

let stop: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["Date", "performance", "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
  })
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
})

it("interpolates the existing transport clock with both signature values", () => {
  projectActions.setNumerator(3)
  projectActions.setDenominator(8)
  stop = startProjectSimulation()
  projectActions.togglePlay()
  vi.advanceTimersByTime(75)
  expect(readSimulatedBar()).toBeCloseTo(1.1, 5)
  projectActions.stop()
  projectActions.seekBar(20.25)
  expect(readSimulatedBar()).toBe(20.25)
})

it("keeps the interpolated cursor inside the active musical loop", () => {
  projectActions.setLoop({ enabled: true, startBar: 10, endBar: 11 })
  projectActions.seekBar(10.875)
  stop = startProjectSimulation()
  projectActions.togglePlay()
  vi.advanceTimersByTime(500)
  expect(readSimulatedBar()).toBeCloseTo(10.125, 5)
})

it("starts and restarts from the exact track insertion instead of the last simulated tick", () => {
  const bar = 129 + 1 / 65536
  projectActions.setInsertionPoint({ trackId: "3-audio", bar })
  expect(useProjectState.getState().session.insertionPoint).toEqual({ trackId: "3-audio", bar })
  expect(readSimulatedBar()).toBe(bar)
  stop = startProjectSimulation()
  projectActions.togglePlay()
  expect(readSimulatedBar()).toBe(bar)
  vi.advanceTimersByTime(100)
  expect(readSimulatedBar()).toBeGreaterThan(bar)
  expect(useProjectState.getState().session.insertionPoint?.bar).toBe(bar)
  projectActions.togglePlay()
  expect(useProjectState.getState().session.playing).toBe(false)
  expect(useProjectState.getState().session.insertionPoint?.bar).toBe(bar)
  projectActions.togglePlay()
  expect(readSimulatedBar()).toBe(bar)
  projectActions.stop()
  projectActions.seekBar(21 + 1 / 65536)
  expect(useProjectState.getState().session.insertionPoint).toBeNull()
  expect(readSimulatedBar()).toBe(21 + 1 / 65536)
})

it("preserves a fine anchor at a distant bar across an odd meter", () => {
  projectActions.setNumerator(7)
  projectActions.setDenominator(8)
  const bar = 257 + 3 / (7 * 16384)
  projectActions.setInsertionPoint({ trackId: "3-audio", bar })
  expect(readSimulatedBar()).toBeCloseTo(bar, 12)
  projectActions.togglePlay()
  expect(readSimulatedBar()).toBeCloseTo(bar, 12)
  projectActions.stop()
  expect(useProjectState.getState().session.insertionPoint?.bar).toBe(bar)
})
