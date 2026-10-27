// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { nativePlugins } from "@/shared/native/plugins"
import {
  configureProjectBackend,
  hydrateProject,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "./index"
import { insertBrowserPlugin, insertPluginNewTrack } from "./plugin-import"
import type { PluginCatalogEntry } from "@/shared/native/plugins"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"

const entry: PluginCatalogEntry = {
  catalogId: "a".repeat(64),
  plugin: {
    format: "Clap",
    class_id: "synth",
    name: "Synth",
    vendor: "Test",
    version: "1",
    sdk_version: "1",
    kind: "Instrument",
    categories: [],
  },
}
const device: ExternalDevice = {
  id: "synth-1",
  kind: "external",
  enabled: true,
  collapsed: false,
  plugin: {
    catalogId: entry.catalogId,
    format: "clap",
    classId: "synth",
    name: "Synth",
    vendor: "Test",
    version: "1",
    role: "instrument",
  },
  stateRef: null,
  parameters: [],
}
let midi = ""
let releaseRuntime: () => void
let releaseBackend: () => void
beforeEach(async () => {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  midi = document.tracks.find(track => track.kind === "midi")!.id
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  releaseBackend = configureProjectBackend(createMockProjectBackend)
  releaseRuntime = startProjectRuntime()
  await whenProjectBackendIdle()
  vi.spyOn(nativePlugins, "discardSeed").mockResolvedValue(undefined)
  vi.spyOn(nativePlugins, "prepareDevice").mockResolvedValue(device)
})
afterEach(() => {
  releaseRuntime()
  releaseBackend()
  vi.restoreAllMocks()
})

it("inserts one instrument before existing effects and replaces it when another is inserted", async () => {
  const before = useProjectState.getState().document.tracks.find(track => track.id === midi)!
  await insertBrowserPlugin(midi, entry)
  let track = useProjectState.getState().document.tracks.find(item => item.id === midi)!
  expect(track.devices?.[0]).toEqual(device)
  expect(track.devices?.slice(1)).toEqual(before.devices ?? [])
  expect(track.armed).toBe(true)

  const secondDevice: ExternalDevice = {
    ...device,
    id: "synth-2",
    plugin: { ...device.plugin, name: "Second" },
  }
  vi.mocked(nativePlugins.prepareDevice).mockResolvedValueOnce(secondDevice)
  await insertBrowserPlugin(midi, entry)
  track = useProjectState.getState().document.tracks.find(item => item.id === midi)!
  expect(track.devices?.[0]).toEqual(secondDevice)
  expect(track.devices?.slice(1)).toEqual(before.devices ?? [])
})

it("ensures only one instrument remains when two preparations finish concurrently", async () => {
  let finish!: (value: ExternalDevice) => void
  vi.mocked(nativePlugins.prepareDevice).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  const pending = insertBrowserPlugin(midi, entry)
  await insertBrowserPlugin(midi, entry)
  finish({ ...device, id: "synth-2" })
  await pending
  expect(
    useProjectState
      .getState()
      .document.tracks.find(track => track.id === midi)!
      .devices?.filter(item => item.kind === "external" && item.plugin.role === "instrument")
  ).toHaveLength(1)
})

it("creates a new MIDI track when inserting a plugin with new track helper", async () => {
  const initialTrackCount = useProjectState.getState().document.tracks.length
  const trackId = await insertPluginNewTrack(entry)
  const tracks = useProjectState.getState().document.tracks
  expect(tracks.length).toBe(initialTrackCount + 1)
  const created = tracks.find(track => track.id === trackId)!
  expect(created.kind).toBe("midi")
  expect(created.name).toBe("Synth")
  expect(created.armed).toBe(true)
  expect(created.devices?.[0]).toEqual(device)
})

it("keeps the document intact after preparation fails and permits retry", async () => {
  const before = useProjectState.getState().document
  vi.mocked(nativePlugins.prepareDevice).mockRejectedValueOnce(new Error("Preparation failed"))
  await expect(insertBrowserPlugin(midi, entry)).rejects.toThrow("Preparation failed")
  expect(useProjectState.getState().document).toBe(before)
  await insertBrowserPlugin(midi, entry)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === midi)?.devices?.[0]
  ).toEqual(device)
})

it("rejects a preparation that returns after project replacement", async () => {
  let finish!: (value: ExternalDevice) => void
  vi.mocked(nativePlugins.prepareDevice).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  const pending = insertBrowserPlugin(midi, entry)
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  finish(device)
  await expect(pending).rejects.toThrow()
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === midi)?.devices ?? []
  ).toEqual([])
})
