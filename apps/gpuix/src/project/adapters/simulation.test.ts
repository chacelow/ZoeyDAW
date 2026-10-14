import { afterEach, beforeEach, expect, it, jest } from "bun:test"
import { createMockDocument, createMockWorkspace } from "./fixtures"
import {
  hydrateProject,
  projectActions,
  readTransportBar,
  startProjectRuntime,
  useProjectState,
} from "."

let stop: (() => void) | undefined

beforeEach(() => {
  jest.useFakeTimers()
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

afterEach(() => {
  stop?.()
  stop = undefined
  jest.useRealTimers()
})

it("interpolates the existing transport clock with both signature values", () => {
  projectActions.setNumerator(3)
  projectActions.setDenominator(8)
  stop = startProjectRuntime()
  projectActions.togglePlay()
  jest.advanceTimersByTime(75)
  expect(readTransportBar()).toBeCloseTo(1.1, 5)
  projectActions.stop()
  projectActions.seekBar(20.25)
  expect(readTransportBar()).toBe(20.25)
})

it("keeps the interpolated cursor inside the active musical loop", () => {
  projectActions.setLoop({ enabled: true, startBar: 10, endBar: 11 })
  projectActions.seekBar(10.875)
  stop = startProjectRuntime()
  projectActions.togglePlay()
  jest.advanceTimersByTime(500)
  expect(readTransportBar()).toBeCloseTo(10.125, 5)
})

it("starts and restarts from the exact track insertion instead of the last simulated tick", () => {
  const bar = 129 + 1 / 65_536
  projectActions.setInsertionPoint({ trackId: "3-audio", bar })
  expect(useProjectState.getState().session.insertionPoint).toEqual({ trackId: "3-audio", bar })
  expect(readTransportBar()).toBe(bar)
  stop = startProjectRuntime()
  projectActions.togglePlay()
  expect(readTransportBar()).toBe(bar)
  jest.advanceTimersByTime(100)
  expect(readTransportBar()).toBeGreaterThan(bar)
  expect(useProjectState.getState().session.insertionPoint?.bar).toBe(bar)
  projectActions.togglePlay()
  expect(useProjectState.getState().session.playing).toBe(false)
  expect(useProjectState.getState().session.insertionPoint?.bar).toBe(bar)
  projectActions.togglePlay()
  expect(readTransportBar()).toBe(bar)
  projectActions.stop()
  projectActions.seekBar(21 + 1 / 65_536)
  expect(useProjectState.getState().session.insertionPoint).toBeNull()
  expect(readTransportBar()).toBe(21 + 1 / 65_536)
})

it("preserves a fine anchor at a distant bar across an odd meter", () => {
  projectActions.setNumerator(7)
  projectActions.setDenominator(8)
  const bar = 257 + 3 / (7 * 16_384)
  projectActions.setInsertionPoint({ trackId: "3-audio", bar })
  expect(readTransportBar()).toBeCloseTo(bar, 12)
  projectActions.togglePlay()
  expect(readTransportBar()).toBeCloseTo(bar, 12)
  projectActions.stop()
  expect(useProjectState.getState().session.insertionPoint?.bar).toBe(bar)
})
