// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import {
  configureProjectBackend,
  hydrateProject,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/pages/project/adapters"
import { BROWSER_PLUGIN_MIME, browserPluginDrag } from "@/pages/project/adapters/browser"
import { nativePlugins } from "@/shared/native/plugins"
import { EffectChain } from "."
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
  id: "synth",
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
let releaseRuntime: (() => void) | undefined
let releaseBackend: (() => void) | undefined
afterEach(() => {
  cleanup()
  releaseRuntime?.()
  releaseBackend?.()
  browserPluginDrag.clear()
  vi.restoreAllMocks()
})

it("drops a browser instrument onto the selected MIDI device chain", async () => {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(item => item.kind === "midi")!
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  releaseBackend = configureProjectBackend(createMockProjectBackend)
  releaseRuntime = startProjectRuntime()
  await whenProjectBackendIdle()
  vi.spyOn(nativePlugins, "discardSeed").mockResolvedValue(undefined)
  vi.spyOn(nativePlugins, "prepareDevice").mockResolvedValue(device)
  const view = render(<EffectChain track={track} />)
  const target = view.container.querySelector("section > div")!
  const token = browserPluginDrag.start(entry)
  const dataTransfer = { types: [BROWSER_PLUGIN_MIME], getData: () => token, dropEffect: "" }
  fireEvent.dragOver(target, { dataTransfer })
  expect(dataTransfer.dropEffect).toBe("copy")
  fireEvent.drop(target, { dataTransfer })
  await waitFor(() =>
    expect(
      useProjectState
        .getState()
        .document.tracks.find(item => item.id === track.id)
        ?.devices?.some(item => item.id === device.id)
    ).toBe(true)
  )
})
