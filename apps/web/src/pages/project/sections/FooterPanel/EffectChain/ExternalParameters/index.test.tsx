// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  hydrateProject,
  projectActions,
  useProjectState,
  configureProjectBackend,
  startProjectRuntime,
  whenProjectBackendIdle,
} from "@/pages/project/adapters"
import { nativePlugins } from "@/shared/native/plugins"
import type { PluginParameter } from "@/shared/native/plugins"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"
import { ExternalParameters } from "./index"

const device: ExternalDevice = {
  id: "external-test",
  kind: "external",
  enabled: true,
  collapsed: false,
  plugin: {
    catalogId: "a".repeat(64),
    format: "clap",
    classId: "fixture",
    name: "Fixture",
    vendor: "",
    version: "1",
    role: "effect",
  },
  stateRef: null,
  parameters: [{ id: "18446744073709551615", normalized: 0.75 }],
}
let trackId = ""
let releaseRuntime: () => void
let releaseBackend: () => void
function currentDevice(): ExternalDevice {
  const current = useProjectState.getState().document.tracks.find(track => track.id === trackId)
    ?.devices?.[0]
  if (current?.kind !== "external") throw new Error("Missing external device")
  return current
}
function View() {
  const current = useProjectState(
    state => state.document.tracks.find(track => track.id === trackId)?.devices?.[0]
  )
  return current?.kind === "external" ? (
    <ExternalParameters trackId={trackId} device={current} />
  ) : null
}
beforeEach(async () => {
  releaseBackend = configureProjectBackend(createMockProjectBackend)
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(track => track.kind === "audio")
  if (!track) throw new Error("Missing audio fixture")
  trackId = track.id
  track.devices = [structuredClone(device)]
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  releaseRuntime = startProjectRuntime()
  await whenProjectBackendIdle()
  vi.spyOn(nativePlugins, "available").mockReturnValue(true)
  vi.spyOn(nativePlugins, "parameters").mockResolvedValue([
    {
      id: "18446744073709551615",
      title: "Gain",
      units: "",
      normalized: 0.75,
      defaultValue: 0.25,
      stepCount: 0,
      readOnly: false,
      automatable: true,
      hidden: false,
    },
    {
      id: "2",
      title: "Read only",
      units: "",
      normalized: 0.5,
      defaultValue: null,
      stepCount: 0,
      readOnly: true,
      automatable: false,
      hidden: false,
    },
  ])
})
afterEach(() => {
  cleanup()
  releaseRuntime()
  releaseBackend()
  vi.restoreAllMocks()
})
it("resets the exact native parameter through one undoable document edit", async () => {
  const view = render(<View />)
  const gain = await view.findByRole("button", { name: "Gain" })
  fireEvent.doubleClick(gain)
  await waitFor(() =>
    expect(currentDevice().parameters).toEqual([{ id: "18446744073709551615", normalized: 0.25 }])
  )
  expect(view.getByRole("button", { name: "Read only" }).hasAttribute("disabled")).toBe(true)
  act(() => projectActions.undo())
  expect(currentDevice().parameters).toEqual(device.parameters)
  expect(currentDevice().plugin).toEqual(device.plugin)
})
it("ignores metadata arriving after the owning view is removed", async () => {
  let finish!: (value: PluginParameter[]) => void
  vi.mocked(nativePlugins.parameters).mockReturnValue(
    new Promise(resolve => {
      finish = resolve
    })
  )
  const view = render(<View />)
  await waitFor(() => expect(nativePlugins.parameters).toHaveBeenCalled())
  view.unmount()
  await act(async () => finish([]))
  expect(currentDevice()).toEqual(device)
})
