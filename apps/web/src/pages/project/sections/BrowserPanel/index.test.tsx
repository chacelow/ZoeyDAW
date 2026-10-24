// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { I18nProvider, initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { nativeBrowserCatalog } from "@/shared/native/browser"
import { useBrowserLibraryState } from "@/pages/project/adapters/browser"
import { cancelNativeWaveformRanges, readNativeWaveformRange } from "@/shared/native/audio"
import {
  releaseWaveformRangeDemand,
  setWaveformRangeDemand,
  useWaveformRanges,
} from "@/pages/project/adapters/backend/waveform-ranges"
import { BrowserPanel } from "."
import type { BrowserTreeRow } from "@/shared/native/browser"
import type { WaveformRange, WaveformRangeRequest } from "@zoeydaw/project-core/waveform-range"
vi.mock("@/shared/native/audio", () => ({
  nativeAudio: { available: () => true },
  cancelNativeWaveformRanges: vi.fn(async () => {}),
  readNativeWaveformRange: vi.fn(async (request: WaveformRangeRequest) => {
    const frameCount = Math.min(request.frameCount, 192000 - request.startFrame)
    const metadata = {
      sampleRate: 48000,
      totalFrames: 192000,
      startFrame: request.startFrame,
      frameCount,
    }
    if (request.framesPerBin === 1)
      return {
        ...metadata,
        kind: "samples",
        channels: [
          Array.from({ length: frameCount }, () => -0.2),
          Array.from({ length: frameCount }, () => 0.4),
        ],
      }
    const bins = Math.ceil(frameCount / request.framesPerBin)
    return {
      ...metadata,
      kind: "envelope",
      framesPerBin: request.framesPerBin,
      channels: [
        {
          min: Array.from({ length: bins }, () => -0.8),
          max: Array.from({ length: bins }, () => 0.2),
        },
        {
          min: Array.from({ length: bins }, () => -0.3),
          max: Array.from({ length: bins }, () => 0.8),
        },
      ],
    }
  }),
}))
const folder: BrowserTreeRow = {
  id: "folder",
  rootId: "root",
  name: "Vocals",
  path: "/audio/Vocals",
  relativePath: "Vocals",
  byteLength: 0,
  modifiedMillis: 0,
  kind: "folder",
  depth: 0,
  hasChildren: true,
}
const audio: BrowserTreeRow = {
  ...folder,
  id: "audio",
  name: "Lead.wav",
  path: "/audio/Vocals/Lead.wav",
  relativePath: "Vocals/Lead.wav",
  kind: "audio",
  depth: 1,
  hasChildren: false,
  byteLength: 4096,
}
beforeEach(async () => {
  vi.mocked(readNativeWaveformRange).mockClear()
  vi.mocked(cancelNativeWaveformRanges).mockClear()
  useWaveformRanges.setState({ entries: new Map() })
  await initI18n(appLocales).changeLanguage("en-US")
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly callback: (entries: { contentRect: { width: number } }[]) => void
      constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
        this.callback = callback
      }
      observe() {
        this.callback([{ contentRect: { width: 320 } }])
      }
      disconnect() {}
    }
  )
  useBrowserLibraryState.setState({
    scope: "all",
    rootId: null,
    revision: 0,
    roots: [],
    items: [],
    offset: 0,
    total: 0,
    query: "",
    selection: {},
    favorites: new Map(),
    expanded: new Set(),
    auditionEnabled: false,
    audition: { kind: "idle" },
    error: null,
    queryState: "idle",
  })
  vi.spyOn(nativeBrowserCatalog, "available").mockReturnValue(true)
  vi.spyOn(nativeBrowserCatalog, "roots").mockResolvedValue({ revision: 1, roots: [] })
  vi.spyOn(nativeBrowserCatalog, "tree").mockImplementation(async request => ({
    requestId: request.requestId,
    revision: 1,
    total: request.expanded.includes(folder.id) ? 2 : 1,
    offset: 0,
    items: request.expanded.includes(folder.id) ? [folder, audio] : [folder],
  }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function mount() {
  return render(
    <I18nProvider resources={appLocales}>
      <BrowserPanel
        renderBody={({ navigation, results }) => (
          <>
            {navigation}
            {results}
          </>
        )}
      />
    </I18nProvider>
  )
}
it("expands folders inline and keeps Add Folder as the final left navigation control", async () => {
  const view = mount()
  const row = await view.findByRole("treeitem", { name: /Vocals/ })
  expect(row.getAttribute("aria-expanded")).toBe("false")
  fireEvent.click(row)
  const leaf = await view.findByRole("treeitem", { name: /Lead.wav/ })
  expect(leaf.getAttribute("aria-level")).toBe("2")
  const navigation = view.getByRole("navigation")
  expect(
    navigation.querySelectorAll("button").item(navigation.querySelectorAll("button").length - 1)
      ?.textContent
  ).toContain("Add folder")
  expect(view.queryByText(/Previous page|Next page|Source BPM|Raw/)).toBeNull()
  fireEvent.click(row)
  await waitFor(() => expect(view.queryByRole("treeitem", { name: /Lead.wav/ })).toBeNull())
})
it("loads the waveform without starting playback when autoplay is off", async () => {
  const view = mount()
  fireEvent.click(await view.findByRole("treeitem", { name: /Vocals/ }))
  const leaf = await view.findByRole("treeitem", { name: /Lead.wav/ })
  fireEvent.click(leaf)
  await waitFor(() => expect(view.getByRole("slider").getAttribute("aria-valuemax")).toBe("4"))
  expect(useBrowserLibraryState.getState().audition.kind).toBe("idle")
  const waveform = view.getByRole("slider").querySelector("svg")
  expect(waveform?.getAttribute("viewBox")).toBe("0 0 320 48")
  const channels = waveform?.querySelectorAll("path")
  expect(channels).toHaveLength(2)
  expect(channels?.[0].getAttribute("d")).not.toBe(channels?.[1].getAttribute("d"))
  for (const channel of channels ?? []) {
    expect(channel.getAttribute("d")).toMatch(/^M.*Z$/i)
    expect(channel.getAttribute("fill")).toBe("currentColor")
  }
})
it("serializes Browser metadata and ranges behind Arrangement without cancelling its active read", async () => {
  let completeArrangement: (range: WaveformRange) => void = (_range: WaveformRange) => {
    throw new Error("Arrangement read has not started")
  }
  const arrangement = new Promise<WaveformRange>(resolve => {
    completeArrangement = resolve
  })
  vi.mocked(readNativeWaveformRange).mockImplementationOnce(() => arrangement)
  const arrangementOwner = "browser-test/arrangement"
  setWaveformRangeDemand(arrangementOwner, [
    {
      sourceKey: "arrangement/take",
      request: {
        path: "/audio/Arrangement.wav",
        startFrame: 0,
        frameCount: 1,
        columns: 1,
        framesPerBin: 1,
      },
    },
  ])
  const view = mount()
  try {
    const folderRow = await view.findByRole("treeitem", { name: /Vocals/ })
    fireEvent.click(folderRow)
    const leaf = await view.findByRole("treeitem", { name: /Lead.wav/ })
    fireEvent.click(leaf)
    fireEvent.click(folderRow)
    await Promise.resolve()
    expect(readNativeWaveformRange).toHaveBeenCalledTimes(1)
    expect(cancelNativeWaveformRanges).not.toHaveBeenCalled()
    fireEvent.click(folderRow)
    fireEvent.click(await view.findByRole("treeitem", { name: /Lead.wav/ }))
    completeArrangement({
      kind: "samples",
      sampleRate: 48000,
      totalFrames: 1,
      startFrame: 0,
      frameCount: 1,
      channels: [[0]],
    })
    await waitFor(() =>
      expect(view.getByRole("slider").getAttribute("aria-disabled")).toBe("false")
    )
    expect(readNativeWaveformRange).toHaveBeenNthCalledWith(2, {
      path: audio.path,
      startFrame: 0,
      frameCount: 1,
      columns: 1,
      framesPerBin: 1,
    })
    expect(readNativeWaveformRange).toHaveBeenCalledTimes(3)
    expect(cancelNativeWaveformRanges).not.toHaveBeenCalled()
    expect(useBrowserLibraryState.getState().audition.kind).toBe("idle")
  } finally {
    releaseWaveformRangeDemand(arrangementOwner)
  }
})
it("ignores metadata completed after Browser selection changes", async () => {
  let completeMetadata: (range: WaveformRange) => void = (_range: WaveformRange) => {
    throw new Error("Metadata read has not started")
  }
  const metadata = new Promise<WaveformRange>(resolve => {
    completeMetadata = resolve
  })
  vi.mocked(readNativeWaveformRange).mockImplementationOnce(() => metadata)
  const view = mount()
  const folderRow = await view.findByRole("treeitem", { name: /Vocals/ })
  fireEvent.click(folderRow)
  fireEvent.click(await view.findByRole("treeitem", { name: /Lead.wav/ }))
  await waitFor(() => expect(readNativeWaveformRange).toHaveBeenCalledTimes(1))
  fireEvent.click(folderRow)
  completeMetadata({
    kind: "samples",
    sampleRate: 48000,
    totalFrames: 192000,
    startFrame: 0,
    frameCount: 1,
    channels: [[0]],
  })
  await waitFor(() => expect(useWaveformRanges.getState().entries.size).toBe(0))
  expect(view.getByRole("slider").getAttribute("aria-disabled")).toBe("true")
  expect(view.getByRole("slider").querySelector("svg")).toBeNull()
  expect(readNativeWaveformRange).toHaveBeenCalledTimes(1)
})
it("shows the shared source cache error in the Browser alert", async () => {
  vi.mocked(readNativeWaveformRange).mockRejectedValueOnce(new Error("Audio source cannot be read"))
  const view = mount()
  fireEvent.click(await view.findByRole("treeitem", { name: /Vocals/ }))
  fireEvent.click(await view.findByRole("treeitem", { name: /Lead.wav/ }))
  expect((await view.findByRole("alert")).textContent).toBe("Audio source cannot be read")
  expect(readNativeWaveformRange).toHaveBeenCalledTimes(1)
})
it("virtualizes a large visible directory without page controls", async () => {
  vi.mocked(nativeBrowserCatalog.tree).mockImplementation(async request => ({
    requestId: request.requestId,
    revision: 1,
    total: 100000,
    offset: request.offset,
    items: Array.from({ length: 160 }, (_, index) => ({
      ...audio,
      id: `audio-${index + request.offset}`,
      name: `Take ${index + request.offset}.wav`,
      depth: 0,
    })),
  }))
  const view = mount()
  await view.findByRole("treeitem", { name: /Take 0.wav/ })
  expect(view.getAllByRole("treeitem").length).toBeLessThan(50)
  const tree = view.getByRole("tree")
  fireEvent.scroll(tree, { target: { scrollTop: 10000 } })
  await waitFor(() =>
    expect(nativeBrowserCatalog.tree).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 488 })
    )
  )
})
