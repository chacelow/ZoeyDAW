// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { ControlInteractionsProvider } from "@/shared/control-interactions"
import { nativePlugins } from "@/shared/native/plugins"
import type {
  PluginFaultStatus,
  PluginHealth,
  PluginParameter,
  PluginEditorResponse,
} from "@/shared/native/plugins"
import { publishNativeAudioStatus, readNativePluginFaults } from "@/shared/native/audio"
import {
  configureProjectBackend,
  hydrateProject,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
  projectActions,
} from "@/pages/project/adapters"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { StatusStrip } from "@/pages/project/sections/StatusStrip"
import { ExternalParameters } from "@/pages/project/sections/FooterPanel/EffectChain/ExternalParameters"

const device: ExternalDevice = {
  id: "recover-device",
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
  stateRef: { sha256: "b".repeat(64), path: "C:/fixture/checkpoint.zdps" },
  parameters: [{ id: "0", normalized: 0.25 }],
}
const parameters: PluginParameter[] = [
  {
    id: "0",
    title: "Gain",
    units: "",
    normalized: 0.25,
    defaultValue: 0.25,
    stepCount: 0,
    readOnly: false,
    automatable: true,
    hidden: false,
  },
]
let trackId = ""
let stopRuntime: () => void
let stopBackend: () => void
function currentDevice() {
  const value = useProjectState.getState().document.tracks.find(track => track.id === trackId)
    ?.devices?.[0]
  return value?.kind === "external" ? value : undefined
}
function fault(instanceId = "1"): PluginFaultStatus {
  return {
    sessionId: useProjectState.getState().session.backend.sessionId,
    trackId,
    deviceId: device.id,
    instanceId,
    helperProcessId: 100,
    kind: "hang",
    code: "plugin-hang",
    message: "Helper stopped completing audio",
    recoverable: true,
  }
}
function View({ parameters: showParameters = false }: { readonly parameters?: boolean }) {
  const current = useProjectState(
    state => state.document.tracks.find(track => track.id === trackId)?.devices?.[0]
  )
  return (
    <ControlInteractionsProvider>
      <footer>
        <StatusStrip />
      </footer>
      {showParameters && current?.kind === "external" && (
        <ExternalParameters trackId={trackId} device={current} />
      )}
    </ControlInteractionsProvider>
  )
}
beforeEach(async () => {
  stopBackend = configureProjectBackend(createMockProjectBackend)
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(track => track.kind === "audio")
  if (!track) throw new Error("Missing audio track")
  trackId = track.id
  track.devices = [structuredClone(device)]
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  stopRuntime = startProjectRuntime()
  await whenProjectBackendIdle()
  publishNativeAudioStatus({ pluginFaults: [], issues: [], error: null })
  vi.spyOn(nativePlugins, "available").mockReturnValue(true)
  vi.spyOn(nativePlugins, "parameters").mockResolvedValue(parameters)
})
afterEach(() => {
  cleanup()
  stopRuntime()
  stopBackend()
  publishNativeAudioStatus({ pluginFaults: [], issues: [], error: null })
  vi.restoreAllMocks()
})

it("cancels the editor to its authored checkpoint and coalesces recovery from both views", async () => {
  let changed = false
  vi.spyOn(nativePlugins, "editor").mockImplementation(async (_session, _device, request) => {
    if (request.kind === "open") return { kind: "opened", instance: "1", parameters }
    if (request.kind === "poll") {
      const events: Extract<PluginEditorResponse, { kind: "events" }>["events"] = changed
        ? []
        : [{ kind: "value", id: "0", normalized: 0.75 }]
      changed = true
      return {
        kind: "events",
        instance: "1",
        open: true,
        parameters: null,
        resyncRequired: false,
        events,
      }
    }
    return { kind: "cancelled", instance: "1" }
  })
  const result = Promise.withResolvers<PluginHealth>()
  const recover = vi.spyOn(nativePlugins, "recover").mockImplementation(async () => {
    expect(currentDevice()).toEqual(device)
    return result.promise
  })
  const view = render(<View parameters />)
  fireEvent.click(await view.findByRole("button", { name: "detailDevices.openPluginEditor" }))
  await waitFor(() =>
    expect(currentDevice()).toMatchObject({ parameters: [{ id: "0", normalized: 0.75 }] })
  )
  act(() => publishNativeAudioStatus({ pluginFaults: [fault()] }))
  const [footerButton, deviceButton] = view.getAllByRole("button", {
    name: "detailDevices.recoverPlugin",
  })
  if (!footerButton || !deviceButton) throw new Error("Missing recovery controls")
  fireEvent.click(footerButton)
  fireEvent.click(deviceButton)
  await waitFor(() => expect(recover).toHaveBeenCalledTimes(1))
  await act(async () => result.resolve({ instanceId: "2", helperProcessId: 200, fault: null }))
  await waitFor(() => expect(readNativePluginFaults()).toEqual([]))
  expect(currentDevice()).toEqual(device)
  expect(useProjectState.getState().session.dirty).toBe(false)
})

it("preserves a newer fault reported while an older recovery completes", async () => {
  const result = Promise.withResolvers<PluginHealth>()
  vi.spyOn(nativePlugins, "recover").mockReturnValue(result.promise)
  act(() => publishNativeAudioStatus({ pluginFaults: [fault()] }))
  const view = render(<View />)
  fireEvent.click(view.getByRole("button", { name: "detailDevices.recoverPlugin" }))
  await waitFor(() => expect(nativePlugins.recover).toHaveBeenCalled())
  const next = { ...fault("2"), helperProcessId: 200 }
  act(() => publishNativeAudioStatus({ pluginFaults: [next] }))
  const waiting = view.getByRole("button", { name: "detailDevices.recoveringPlugin" })
  expect(waiting.hasAttribute("disabled")).toBe(true)
  fireEvent.click(waiting)
  expect(nativePlugins.recover).toHaveBeenCalledTimes(1)
  await act(async () => result.resolve({ instanceId: "2", helperProcessId: 200, fault: null }))
  expect(readNativePluginFaults()).toEqual([next])
  expect(
    view.getByRole("button", { name: "detailDevices.recoverPlugin" }).hasAttribute("disabled")
  ).toBe(false)
  expect(within(view.getByRole("contentinfo")).getByRole("alert").textContent).toContain(
    next.message
  )
})

it("leaves the fault visible and the document unchanged when checkpoint recovery fails", async () => {
  vi.spyOn(nativePlugins, "recover").mockRejectedValue(new Error("Checkpoint unavailable"))
  const current = fault()
  act(() => publishNativeAudioStatus({ pluginFaults: [current] }))
  const view = render(<View />)
  fireEvent.click(view.getByRole("button", { name: "detailDevices.recoverPlugin" }))
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain("Checkpoint unavailable")
  )
  expect(readNativePluginFaults()).toEqual([current])
  expect(currentDevice()).toEqual(device)
  expect(
    view.getByRole("button", { name: "detailDevices.recoverPlugin" }).hasAttribute("disabled")
  ).toBe(false)
})

it("does not offer endpoint recovery for a native callback contract fault", () => {
  const recover = vi.spyOn(nativePlugins, "recover")
  act(() =>
    publishNativeAudioStatus({
      pluginFaults: [{ ...fault(), kind: "processing-failed", recoverable: false }],
    })
  )
  const view = render(<View />)
  const button = view.getByRole("button", { name: "detailDevices.recoverPlugin" })
  expect(button.hasAttribute("disabled")).toBe(true)
  fireEvent.click(button)
  expect(recover).not.toHaveBeenCalled()
})

it("does not clear another project's fault when a previous recovery finishes late", async () => {
  const result = Promise.withResolvers<PluginHealth>()
  vi.spyOn(nativePlugins, "recover").mockReturnValue(result.promise)
  act(() => publishNativeAudioStatus({ pluginFaults: [fault()] }))
  const old = render(<View />)
  fireEvent.click(old.getByRole("button", { name: "detailDevices.recoverPlugin" }))
  await waitFor(() => expect(nativePlugins.recover).toHaveBeenCalled())
  old.unmount()
  const replacement = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = replacement.tracks.find(track => track.kind === "audio")
  if (!track) throw new Error("Missing replacement track")
  trackId = track.id
  track.devices = [structuredClone(device)]
  act(() =>
    hydrateProject(
      JSON.stringify({ version: 4, document: replacement, workspace: createMockWorkspace() })
    )
  )
  await whenProjectBackendIdle()
  const current = { ...fault("2"), helperProcessId: 200 }
  act(() => publishNativeAudioStatus({ pluginFaults: [current] }))
  const view = render(<View />)
  await act(async () => result.resolve({ instanceId: "2", helperProcessId: 200, fault: null }))
  expect(readNativePluginFaults()).toEqual([current])
  expect(currentDevice()).toEqual(device)
  expect(view.getByRole("alert").textContent).toContain(current.message)
})

it("preserves the manual baseline through automated editor feedback, commit and undo", async () => {
  const track = useProjectState.getState().document.tracks.find(track => track.id === trackId)
  if (!track) throw new Error("Missing audio track")
  const automation = [
    {
      id: "native-envelope",
      target: { kind: "device", deviceId: device.id, parameter: "0" },
      points: [{ id: "point", bar: 1, value: 0.9 }],
    },
  ] satisfies typeof track.automation
  act(() => {
    const token = projectActions.beginEdit()
    projectActions.updateTrack(trackId, { automation })
    projectActions.endEdit(token)
  })
  await whenProjectBackendIdle()
  const reported = parameters.map(parameter => ({ ...parameter, normalized: 0.9 }))
  const stateRef = { sha256: "c".repeat(64), path: "C:/fixture/automated.zdps" }
  const editor = vi
    .spyOn(nativePlugins, "editor")
    .mockImplementation(async (_session, _device, request) => {
      if (request.kind === "open") return { kind: "opened", instance: "1", parameters }
      if (request.kind === "poll")
        return {
          kind: "events",
          instance: "1",
          open: true,
          parameters: reported,
          resyncRequired: false,
          events: [{ kind: "value", id: "0", normalized: 0.9 }],
        }
      if (request.kind === "commit")
        return { kind: "committed", instance: "1", parameters: reported, stateRef }
      return { kind: "cancelled", instance: "1" }
    })
  const view = render(<View parameters />)
  fireEvent.click(await view.findByRole("button", { name: "detailDevices.openPluginEditor" }))
  await waitFor(() =>
    expect(editor).toHaveBeenCalledWith(
      useProjectState.getState().session.backend.sessionId,
      device.id,
      { kind: "poll", instance: "1" }
    )
  )
  expect(currentDevice()?.parameters).toEqual(device.parameters)
  fireEvent.click(view.getByRole("button", { name: "detailDevices.closePluginEditor" }))
  await waitFor(() => expect(currentDevice()?.stateRef).toEqual(stateRef))
  await whenProjectBackendIdle()
  expect(currentDevice()?.parameters).toEqual(device.parameters)
  act(() => projectActions.undo())
  expect(currentDevice()?.stateRef).toEqual(device.stateRef)
  expect(currentDevice()?.parameters).toEqual(device.parameters)
  act(() => projectActions.redo())
  expect(currentDevice()?.stateRef).toEqual(stateRef)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === trackId)?.automation
  ).toEqual(automation)
})
