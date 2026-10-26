// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { StrictMode } from "react"
import {
  hydrateProject,
  projectActions,
  useProjectState,
  configureProjectBackend,
  startProjectRuntime,
  whenProjectBackendIdle,
  serializeProject,
} from "@/pages/project/adapters"
import { nativePlugins } from "@/shared/native/plugins"
import type { PluginParameter, PluginEditorResponse } from "@/shared/native/plugins"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"
import { commitPluginEditors } from "@/pages/project/adapters/plugin-editor"
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

it("applies native editor changes and its complete state as one undoable edit", async () => {
  const parameters = await nativePlugins.parameters("fixture", device.id)
  const stateRef = { sha256: "b".repeat(64), path: "C:/fixture/editor-state.zdps" }
  let edited = false
  vi.spyOn(nativePlugins, "editor").mockImplementation(async (_session, _device, request) => {
    switch (request.kind) {
      case "open":
        return { kind: "opened", instance: "7", parameters }
      case "poll":
        if (!edited) {
          edited = true
          return {
            kind: "events",
            instance: "7",
            open: true,
            parameters: null,
            resyncRequired: false,
            events: [
              { kind: "begin", id: "18446744073709551615" },
              { kind: "value", id: "18446744073709551615", normalized: 0.3 },
              { kind: "end", id: "18446744073709551615" },
            ],
          }
        }
        return {
          kind: "events",
          instance: "7",
          open: true,
          parameters: null,
          resyncRequired: false,
          events: [],
        }
      case "commit":
        return {
          kind: "committed",
          instance: "7",
          stateRef,
          parameters: parameters.map(parameter =>
            parameter.id === "18446744073709551615" ? { ...parameter, normalized: 0.3 } : parameter
          ),
        }
      case "cancel":
        return { kind: "cancelled", instance: "7" }
      case "release":
        return { kind: "released", instance: "7" }
    }
  })
  const view = render(
    <StrictMode>
      <View />
    </StrictMode>
  )
  fireEvent.click(await view.findByRole("button", { name: "detailDevices.openPluginEditor" }))
  await waitFor(() =>
    expect(currentDevice().parameters).toEqual([{ id: "18446744073709551615", normalized: 0.3 }])
  )
  expect(view.getByRole("button", { name: "Gain" }).hasAttribute("disabled")).toBe(true)
  fireEvent.click(view.getByRole("button", { name: "detailDevices.closePluginEditor" }))
  await waitFor(() => expect(currentDevice().stateRef).toEqual(stateRef))
  await whenProjectBackendIdle()
  act(() => projectActions.undo())
  expect(currentDevice().parameters).toEqual(device.parameters)
  expect(currentDevice().stateRef).toBeNull()
  act(() => projectActions.redo())
  expect(currentDevice().stateRef).toEqual(stateRef)
  expect(currentDevice().parameters).toEqual([{ id: "18446744073709551615", normalized: 0.3 }])
})

it("cancels an editor that opens after its project view is gone without writing the new project", async () => {
  const pending = Promise.withResolvers<PluginEditorResponse>()
  const editor = vi
    .spyOn(nativePlugins, "editor")
    .mockImplementation(async (_session, _device, request) =>
      request.kind === "open" ? pending.promise : { kind: "cancelled", instance: "9" }
    )
  const view = render(<View />)
  fireEvent.click(await view.findByRole("button", { name: "detailDevices.openPluginEditor" }))
  await waitFor(() => expect(editor).toHaveBeenCalled())
  view.unmount()
  const replacement = createMockDocument(DEFAULT_TRACK_HEIGHT)
  act(() =>
    hydrateProject(
      JSON.stringify({ version: 4, document: replacement, workspace: createMockWorkspace() })
    )
  )
  await act(async () => pending.resolve({ kind: "opened", instance: "9", parameters: [] }))
  await waitFor(() =>
    expect(editor).toHaveBeenCalledWith(expect.any(String), device.id, {
      kind: "cancel",
      instance: "9",
    })
  )
  expect(useProjectState.getState().document).toEqual(replacement)
})

it("marks opaque plugin edits dirty and resynchronizes values after notification overflow", async () => {
  const parameters = await nativePlugins.parameters("fixture", device.id)
  let open = true
  const stateRef = { sha256: "c".repeat(64), path: "C:/fixture/opaque.zdps" }
  vi.spyOn(nativePlugins, "editor").mockImplementation(async (_session, _device, request) => {
    if (request.kind === "open") return { kind: "opened", instance: "11", parameters }
    if (request.kind === "poll")
      return {
        kind: "events",
        instance: "11",
        open,
        resyncRequired: true,
        parameters: parameters.map(parameter => ({ ...parameter, normalized: 0.6 })),
        events: [
          { kind: "dirty", dirty: true },
          { kind: "value", id: "18446744073709551615", normalized: 0.2 },
        ],
      }
    if (request.kind === "commit")
      return {
        kind: "committed",
        instance: "11",
        stateRef,
        parameters: parameters.map(parameter => ({ ...parameter, normalized: 0.6 })),
      }
    return { kind: "cancelled", instance: "11" }
  })
  const view = render(<View />)
  fireEvent.click(await view.findByRole("button", { name: "detailDevices.openPluginEditor" }))
  await waitFor(() =>
    expect(currentDevice().parameters).toEqual([{ id: "18446744073709551615", normalized: 0.6 }])
  )
  expect(useProjectState.getState().session.dirty).toBe(true)
  open = false
  await waitFor(() => expect(currentDevice().stateRef).toEqual(stateRef))
  await whenProjectBackendIdle()
  act(() => projectActions.undo())
  expect(currentDevice().parameters).toEqual(device.parameters)
  expect(currentDevice().stateRef).toBeNull()
})

it("commits opaque editor changes before capturing a saved project", async () => {
  const parameters = await nativePlugins.parameters("fixture", device.id)
  const stateRef = { sha256: "d".repeat(64), path: "C:/fixture/saved-editor.zdps" }
  vi.spyOn(nativePlugins, "editor").mockImplementation(async (_session, _device, request) => {
    if (request.kind === "open") return { kind: "opened", instance: "12", parameters }
    if (request.kind === "poll")
      return {
        kind: "events",
        instance: "12",
        open: true,
        parameters: null,
        resyncRequired: false,
        events: [{ kind: "dirty", dirty: true }],
      }
    if (request.kind === "commit")
      return { kind: "committed", instance: "12", stateRef, parameters }
    return { kind: "cancelled", instance: "12" }
  })
  const view = render(<View />)
  fireEvent.click(await view.findByRole("button", { name: "detailDevices.openPluginEditor" }))
  await waitFor(() => expect(useProjectState.getState().session.dirty).toBe(true))
  await act(async () => commitPluginEditors())
  const saved = serializeProject()
  act(() => hydrateProject(saved))
  expect(currentDevice().stateRef).toEqual(stateRef)
  expect(currentDevice().parameters).toEqual(device.parameters)
})

it("preserves the authored checkpoint when saving native editor state fails", async () => {
  act(() => projectActions.updateTrack(trackId, { devices: [{ ...device, parameters: [] }] }))
  await whenProjectBackendIdle()
  const before = currentDevice()
  const dirtyBefore = useProjectState.getState().session.dirty
  const parameters = await nativePlugins.parameters("fixture", device.id)
  vi.spyOn(nativePlugins, "editor").mockImplementation(async (_session, _device, request) => {
    if (request.kind === "open") return { kind: "opened", instance: "13", parameters }
    if (request.kind === "poll")
      return {
        kind: "events",
        instance: "13",
        open: true,
        parameters: null,
        resyncRequired: false,
        events: [{ kind: "value", id: "18446744073709551615", normalized: 0.1 }],
      }
    if (request.kind === "commit") throw new Error("Disk checkpoint failed")
    return { kind: "cancelled", instance: "13" }
  })
  const view = render(<View />)
  fireEvent.click(await view.findByRole("button", { name: "detailDevices.openPluginEditor" }))
  await waitFor(() =>
    expect(currentDevice().parameters).toEqual([{ id: "18446744073709551615", normalized: 0.1 }])
  )
  await act(async () => {
    await expect(commitPluginEditors()).rejects.toThrow("Disk checkpoint failed")
  })
  expect(currentDevice()).toEqual(before)
  expect(useProjectState.getState().session.dirty).toBe(dirtyBefore)
  expect(view.getByRole("button", { name: "Gain" }).textContent).toContain("75.0%")
  expect(view.getByRole("alert").textContent).toContain("Disk checkpoint failed")
})
