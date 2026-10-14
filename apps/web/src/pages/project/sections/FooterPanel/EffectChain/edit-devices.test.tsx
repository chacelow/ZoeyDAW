// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  hydrateProject,
  projectActions,
  useProjectEditGesture,
  useProjectState,
} from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { createDevice, withDeviceParameter } from "@/pages/project/model/devices"
import { editDevices, reorderDevice } from "./edit-devices"

const trackId = "device-test-a"
const otherTrackId = "device-test-b"

function devices(id = trackId) {
  return useProjectState.getState().document.tracks.find(track => track.id === id)?.devices ?? []
}

beforeEach(() => {
  const document = createMockDocument()
  const template = document.tracks.find(track => track.kind === "audio")
  if (!template) throw new Error("Missing audio fixture")
  document.tracks.push(
    {
      ...structuredClone(template),
      id: trackId,
      clips: [],
      devices: [{ ...createDevice("utility"), id: "utility-test" }],
    },
    { ...structuredClone(template), id: otherTrackId, clips: [], devices: [] }
  )
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
})

afterEach(cleanup)

describe("device chain document edits", () => {
  it("adds, reorders, bypasses, folds and removes independently per track", () => {
    editDevices(trackId, current => [...current, { ...createDevice("delay"), id: "delay-test" }])
    editDevices(trackId, current => reorderDevice(current, "delay-test", 0))
    expect(devices().map(device => device.id)).toEqual(["delay-test", "utility-test"])
    editDevices(trackId, current =>
      current.map(device =>
        device.id === "delay-test" ? { ...device, enabled: false, collapsed: true } : device
      )
    )
    expect(devices()[0]).toMatchObject({ enabled: false, collapsed: true })
    expect(devices(otherTrackId)).toEqual([])
    editDevices(trackId, current => current.filter(device => device.id !== "delay-test"))
    expect(devices().map(device => device.id)).toEqual(["utility-test"])
  })

  it("keeps continuous parameter updates in one undo and reads the latest chain", () => {
    const hook = renderHook(() =>
      useProjectEditGesture((value: number) => {
        editDevices(trackId, current =>
          current.map(device =>
            device.id === "utility-test" ? withDeviceParameter(device, "gainDb", value) : device
          )
        )
      })
    )
    act(() => {
      hook.result.current.onGestureStart()
      hook.result.current.onChange(3)
      editDevices(trackId, current => [
        ...current,
        { ...createDevice("filter"), id: "filter-test" },
      ])
      hook.result.current.onChange(6)
      hook.result.current.onGestureEnd()
    })
    expect(devices()[0]).toMatchObject({ gainDb: 6 })
    expect(devices().map(device => device.id)).toEqual(["utility-test", "filter-test"])
    expect(useProjectState.getState().session.canUndo).toBe(true)
    act(() => projectActions.undo())
    expect(devices()).toHaveLength(1)
    expect(devices()[0]).toMatchObject({ gainDb: 0 })
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })

  it("cancels previews on cleanup and ignores stale movement after unmount", () => {
    const hook = renderHook(() =>
      useProjectEditGesture((value: number) => {
        editDevices(trackId, current =>
          current.map(device => withDeviceParameter(device, "gainDb", value))
        )
      })
    )
    const gesture = hook.result.current
    act(() => {
      gesture.onGestureStart()
      gesture.onChange(9)
    })
    expect(devices()[0]).toMatchObject({ gainDb: 9 })
    hook.unmount()
    expect(devices()[0]).toMatchObject({ gainDb: 0 })
    act(() => gesture.onChange(12))
    expect(devices()[0]).toMatchObject({ gainDb: 0 })
    expect(devices(otherTrackId)).toEqual([])
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })

  it("does not create edits for a no-op, a missing device or a removed track", () => {
    editDevices(trackId, current => reorderDevice(current, "utility-test", 0))
    editDevices(trackId, current => reorderDevice(current, "missing", 0))
    editDevices("removed-track", current => [...current, createDevice("reverb")])
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
})
