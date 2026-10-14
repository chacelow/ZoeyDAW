import { beforeEach, describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useLayoutEffect } from "react"
import {
  hydrateProject,
  projectActions,
  useProjectEditGesture,
  useProjectState,
} from "../../../adapters"
import { createMockDocument, createMockWorkspace } from "../../../adapters/fixtures"
import { createDevice, withDeviceParameter } from "../../../model/devices"
import { editDevices, reorderDevice } from "./edit-devices"

const trackId = "device-test-a"
const otherTrackId = "device-test-b"
function devices(id = trackId) {
  return useProjectState.getState().document.tracks.find(track => track.id === id)?.devices ?? []
}
beforeEach(() => {
  const document_ = createMockDocument()
  const template = document_.tracks.find(track => track.kind === "audio")
  if (!template) throw new Error("Missing audio fixture")
  document_.tracks.push(
    {
      ...structuredClone(template),
      id: trackId,
      clips: [],
      devices: [{ ...createDevice("utility"), id: "utility-test" }],
    },
    { ...structuredClone(template), id: otherTrackId, clips: [], devices: [] }
  )
  hydrateProject(
    JSON.stringify({ version: 2, document: document_, workspace: createMockWorkspace() })
  )
})

function ParameterProbe({
  retain,
}: {
  readonly retain?: (change: (value: number) => void) => void
}) {
  const gesture = useProjectEditGesture((value: number) =>
    editDevices(trackId, current =>
      current.map(device =>
        device.id === "utility-test" ? withDeviceParameter(device, "gainDb", value) : device
      )
    )
  )
  useLayoutEffect(() => {
    retain?.(gesture.onChange)
  }, [retain, gesture])
  return (
    <div
      testId="parameter"
      style={{ width: 160, height: 60 }}
      onMouseDown={gesture.onGestureStart}
      onMouseMove={event => gesture.onChange(event.x ?? 0)}
      onMouseUp={gesture.onGestureEnd}
    />
  )
}

describe("device chain document edits", () => {
  test("adds, reorders, bypasses, folds and removes independently per track", () => {
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
  test("keeps continuous parameter updates in one undo and reads the latest chain", () => {
    const root = createTestRoot({ width: 200, height: 100 })
    try {
      root.render(<ParameterProbe />)
      root.renderer.nativeSimulateMouseDown(1, 1)
      root.renderer.nativeSimulateMouseMove(3, 1, 0)
      editDevices(trackId, current => [
        ...current,
        { ...createDevice("filter"), id: "filter-test" },
      ])
      root.renderer.nativeSimulateMouseMove(6, 1, 0)
      root.renderer.nativeSimulateMouseUp(6, 1)
      expect(devices()[0]).toMatchObject({ gainDb: 6 })
      expect(devices().map(device => device.id)).toEqual(["utility-test", "filter-test"])
      expect(useProjectState.getState().session.canUndo).toBe(true)
      projectActions.undo()
      expect(devices()).toHaveLength(1)
      expect(devices()[0]).toMatchObject({ gainDb: 0 })
      expect(useProjectState.getState().session.canUndo).toBe(false)
    } finally {
      root.unmount()
    }
  })
  test("cancels on cleanup and ignores stale movement after unmount", () => {
    const root = createTestRoot({ width: 200, height: 100 })
    let staleChange: ((value: number) => void) | null = null
    root.render(
      <ParameterProbe
        retain={change => {
          staleChange = change
        }}
      />
    )
    root.renderer.nativeSimulateMouseDown(1, 1)
    root.renderer.nativeSimulateMouseMove(9, 1, 0)
    expect(devices()[0]).toMatchObject({ gainDb: 9 })
    root.unmount()
    expect(devices()[0]).toMatchObject({ gainDb: 0 })
    if (!staleChange) throw new Error("Missing gesture")
    const invoke: (value: number) => void = staleChange
    invoke(12)
    expect(devices()[0]).toMatchObject({ gainDb: 0 })
    expect(devices(otherTrackId)).toEqual([])
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
  test("does not create edits for a no-op, missing device or removed track", () => {
    editDevices(trackId, current => reorderDevice(current, "utility-test", 0))
    editDevices(trackId, current => reorderDevice(current, "missing", 0))
    editDevices("removed-track", current => [...current, createDevice("reverb")])
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
})

test("property: reordering conserves devices and sibling order across clamped destinations", () => {
  let seed = 17
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  for (let trial = 0; trial < 600; trial++) {
    const chain = Array.from({ length: 1 + Math.floor(random() * 20) }, (_, index) => ({
      ...createDevice("utility"),
      id: `device-${index}`,
    }))
    const from = Math.floor(random() * chain.length)
    const selected = chain[from]
    if (!selected) throw new Error("Missing generated device")
    const destination = Math.floor(random() * chain.length * 3) - chain.length
    const target = Math.max(0, Math.min(chain.length - 1, destination))
    const reordered = reorderDevice(chain, selected.id, destination)
    expect(reordered[target]).toBe(selected)
    expect(reordered.filter(device => device !== selected)).toEqual(
      chain.filter(device => device !== selected)
    )
    expect(new Set(reordered.map(device => device.id))).toEqual(
      new Set(chain.map(device => device.id))
    )
  }
})
