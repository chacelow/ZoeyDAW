import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom"
import { I18nProvider, initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { nativeProjectStorage } from "@/shared/native/project-storage"
import { HomePage } from "@/pages/home"
import {
  hydrateProject,
  projectActions,
  projectFiles,
  startProjectRuntime,
  useProjectFilesState,
  useProjectState,
} from "../adapters"
import { initialDocument, initialWorkspace } from "@zoeydaw/project-runtime/state"
import { createManifest, parseManifest } from "../adapters/project-files/format"
import { ProjectFileControls, ProjectFileFeedback } from "."
import type { MediaSource } from "@zoeydaw/project-core/media"
import { configureProjectBackend } from "../adapters/context"
import { createMockProjectBackend } from "@zoeydaw/project-runtime/testing"

vi.mock("@/shared/native/project-storage", () => ({
  nativeProjectStorage: {
    available: vi.fn(() => true),
    pickProject: vi.fn(),
    pickSavePath: vi.fn(),
    pickAudio: vi.fn(),
    inspectMedia: vi.fn(),
    openProject: vi.fn(),
    saveProject: vi.fn(),
    cancel: vi.fn(),
    relinkMedia: vi.fn(),
  },
}))
let release = () => {}
beforeEach(async () => {
  configureProjectBackend(createMockProjectBackend)
  localStorage.clear()
  vi.clearAllMocks()
  await initI18n(appLocales).changeLanguage("en-US")
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: initialDocument(DEFAULT_TRACK_HEIGHT),
      workspace: initialWorkspace(),
    })
  )
  projectFiles.resetBinding("ui-new-project")
  useProjectFilesState.setState({ recent: [] })
  release = startProjectRuntime()
})
afterEach(() => {
  cleanup()
  release()
})

function OpenedPage() {
  const { id } = useParams()
  const name = useProjectState(state => state.document.name)
  return (
    <>
      <h1>
        {id} · {name}
      </h1>
      <ProjectFileControls />
      <ProjectFileFeedback />
    </>
  )
}
function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <I18nProvider resources={appLocales}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:id" element={<OpenedPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  )
}

it("opens from Home using the picked disk locator, replaces only after validation, and saves from the visible button", async () => {
  const manifest = createManifest(
    "disk-project",
    { ...initialDocument(DEFAULT_TRACK_HEIGHT), name: "Disk Song" },
    initialWorkspace()
  )
  vi.mocked(nativeProjectStorage.pickProject).mockResolvedValue("/songs/Disk.zdaw")
  vi.mocked(nativeProjectStorage.openProject).mockResolvedValue({
    path: "/songs/Disk.zdaw",
    manifest,
    issues: [],
  })
  let resolveReceipt!: (value: unknown) => void
  const receipt = new Promise<unknown>(resolve => {
    resolveReceipt = resolve
  })
  vi.mocked(nativeProjectStorage.saveProject).mockReturnValue(receipt)
  renderHome()
  fireEvent.click(screen.getByRole("button", { name: "Open" }))
  expect(await screen.findByRole("heading", { name: "disk-project · Disk Song" })).toBeTruthy()
  expect(useProjectFilesState.getState().recent[0]?.path).toBe("/songs/Disk.zdaw")
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(nativeProjectStorage.saveProject).toHaveBeenCalledOnce())
  const request = vi.mocked(nativeProjectStorage.saveProject).mock.calls[0][0]
  expect(request.path).toBe("/songs/Disk.zdaw")
  expect(request.expectedCommitId).toBe(manifest.commitId)
  expect(request.collect).toBe(false)
  expect(screen.getByText(/Writing files/)).toBeTruthy()
  resolveReceipt({
    path: request.path,
    manifest: parseManifest(request.manifest),
    durability: "synced",
  })
  expect(await screen.findByText("Project saved")).toBeTruthy()
})

it("does not navigate or add a recent item when Home Open receives a corrupt file", async () => {
  const before = useProjectState.getState().document
  vi.mocked(nativeProjectStorage.pickProject).mockResolvedValue("/songs/Broken.zdaw")
  vi.mocked(nativeProjectStorage.openProject).mockResolvedValue({
    path: "/songs/Broken.zdaw",
    manifest: { format: "other" },
    issues: [],
  })
  renderHome()
  fireEvent.click(screen.getByRole("button", { name: "Open" }))
  expect(await screen.findByRole("alert")).toBeTruthy()
  expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy()
  expect(useProjectFilesState.getState().recent).toEqual([])
  expect(useProjectState.getState().document).toBe(before)
})

it("restores the visible missing-media action when a successful relink is undone", async () => {
  const source = {
    id: "d6d42dc2-d1d2-46bc-b516-a19b113fddad",
    name: "Voice.wav",
    sha256: "a".repeat(64),
    byteLength: 960044,
    sampleRate: 48000,
    frames: 240000,
    channels: 2,
    location: { kind: "external", path: "/missing/Voice.wav" },
  } satisfies MediaSource
  const manifest = createManifest(
    "missing-ui",
    { ...initialDocument(DEFAULT_TRACK_HEIGHT), media: [source] },
    initialWorkspace()
  )
  vi.mocked(nativeProjectStorage.pickProject).mockResolvedValue("/songs/Missing.zdaw")
  vi.mocked(nativeProjectStorage.openProject).mockResolvedValue({
    path: "/songs/Missing.zdaw",
    manifest,
    issues: [{ sourceId: source.id, kind: "missing", path: "/missing/Voice.wav" }],
  })
  vi.mocked(nativeProjectStorage.pickAudio).mockResolvedValue("/restored/Voice.wav")
  vi.mocked(nativeProjectStorage.relinkMedia).mockResolvedValue({
    ...source,
    location: { kind: "external", path: "/restored/Voice.wav" },
  })
  renderHome()
  fireEvent.click(screen.getByRole("button", { name: "Open" }))
  expect(await screen.findByRole("list", { name: "Resolve missing media" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Locate matching file…" }))
  await waitFor(() =>
    expect(screen.queryByRole("list", { name: "Resolve missing media" })).toBeNull()
  )
  act(() => projectActions.undo())
  expect(screen.getByRole("list", { name: "Resolve missing media" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "Locate matching file…" })).toBeTruthy()
  act(() => projectActions.redo())
  expect(screen.queryByRole("list", { name: "Resolve missing media" })).toBeNull()
  expect(nativeProjectStorage.relinkMedia).toHaveBeenCalledOnce()
})
