// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  hydrateProject,
  useProjectState,
  configureProjectBackend,
  startProjectRuntime,
  whenProjectBackendIdle,
} from "@/pages/project/adapters"
import { nativePlugins } from "@/shared/native/plugins"
import type { PluginCatalogEntry } from "@/shared/native/plugins"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { PluginInsert } from "./index"

let trackId = ""
let releaseRuntime: () => void
let releaseBackend: () => void

const catalogEntry: PluginCatalogEntry = {
  catalogId: "a".repeat(64),
  plugin: {
    format: "Clap",
    class_id: "com.fixture.delay",
    name: "Fixture Delay",
    vendor: "Vendor",
    version: "1.0",
    sdk_version: "1.0",
    kind: "Effect",
    categories: ["Delay"],
  },
}

const preparedDevice: ExternalDevice = {
  id: "ext-1",
  kind: "external",
  enabled: true,
  collapsed: false,
  plugin: {
    catalogId: "a".repeat(64),
    format: "clap",
    classId: "com.fixture.delay",
    name: "Fixture Delay",
    vendor: "Vendor",
    version: "1.0",
    role: "effect",
  },
  stateRef: null,
  parameters: [{ id: "0", normalized: 0.5 }],
}

beforeEach(async () => {
  releaseBackend = configureProjectBackend(createMockProjectBackend)
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(t => t.kind === "audio")
  if (!track) throw new Error("Missing audio fixture")
  trackId = track.id
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  releaseRuntime = startProjectRuntime()
  await whenProjectBackendIdle()
  vi.spyOn(nativePlugins, "available").mockReturnValue(true)
  vi.spyOn(nativePlugins, "entries").mockResolvedValue([catalogEntry])
  vi.spyOn(nativePlugins, "prepareDevice").mockResolvedValue(preparedDevice)
})

afterEach(() => {
  cleanup()
  releaseRuntime()
  releaseBackend()
  vi.restoreAllMocks()
})

it("loads entries and inserts external device into track", async () => {
  const view = render(<PluginInsert trackId={trackId} />)
  const button = view.getByRole("button")
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false))
  fireEvent.click(button)
  fireEvent.click(await view.findByRole("menuitem", { name: /Fixture Delay/ }))
  await waitFor(() =>
    expect(nativePlugins.prepareDevice).toHaveBeenCalledWith(catalogEntry.catalogId)
  )
  await waitFor(() => {
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === trackId)?.devices
    ).toHaveLength(1)
  })

  const devices = useProjectState.getState().document.tracks.find(t => t.id === trackId)?.devices
  expect(devices).toHaveLength(1)
  expect(devices?.[0].kind).toBe("external")
})

it("reports a preparation failure and clears busy so insertion can be retried", async () => {
  vi.mocked(nativePlugins.prepareDevice).mockRejectedValueOnce(
    new Error("Plugin preparation failed")
  )
  const documentBefore = useProjectState.getState().document
  const view = render(<PluginInsert trackId={trackId} />)
  const button = view.getByRole("button")
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false))
  fireEvent.click(button)
  fireEvent.click(await view.findByRole("menuitem", { name: /Fixture Delay/ }))
  expect((await view.findByRole("alert")).textContent).toContain("Plugin preparation failed")
  expect(button.hasAttribute("disabled")).toBe(false)
  expect(useProjectState.getState().document).toEqual(documentBefore)
  expect(useProjectState.getState().session.canUndo).toBe(false)

  fireEvent.click(button)
  fireEvent.click(await view.findByRole("menuitem", { name: /Fixture Delay/ }))
  await waitFor(() => {
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === trackId)?.devices
    ).toHaveLength(1)
  })
  expect(view.queryByRole("alert")).toBeNull()
  expect(button.hasAttribute("disabled")).toBe(false)
})

it("shows scan hint when catalog has no entries", async () => {
  vi.mocked(nativePlugins.entries).mockResolvedValue([])
  const view = render(<PluginInsert trackId={trackId} />)
  await waitFor(() => {
    expect(view.getByText("detailDevices.scanPlugins")).toBeTruthy()
  })
})
