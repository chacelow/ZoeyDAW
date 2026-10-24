import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { I18nProvider, initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { nativeProjectStorage } from "@/shared/native/project-storage"
import { setCloseBehavior } from "@/shared/native/close-behavior"
import {
  hydrateProject,
  projectActions,
  projectFiles,
  startProjectRuntime,
  useProjectFilesState,
  useProjectState,
} from "../adapters"
import { initialDocument, initialWorkspace } from "@zoeydaw/project-runtime/state"
import { parseManifest } from "../adapters/project-files/format"
import { ApplicationLifecycle } from "./ApplicationLifecycle"
import { ProjectFileFeedback } from "."
import { configureProjectBackend } from "../adapters/context"
import { createMockProjectBackend } from "@zoeydaw/project-runtime/testing"
import type {
  ApplicationClosePort,
  ApplicationCloseRequest,
  ApplicationCloseResolution,
} from "@/shared/native/application-lifecycle"

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
  projectFiles.resetBinding("close-test")
  release = startProjectRuntime()
  projectActions.setBpm(151)
})
afterEach(() => {
  cleanup()
  projectFiles.resolveDiscard("cancel")
  release()
})

async function renderLifecycle(isPreview = false, pending: ApplicationCloseRequest | null = null) {
  let listener!: (request: ApplicationCloseRequest) => void
  const native = {
    available: () => true,
    requestClose: vi.fn(async () => {}),
    pending: vi.fn(async (): Promise<ApplicationCloseRequest | null> => pending),
    subscribe: vi.fn(
      (receive: (request: ApplicationCloseRequest) => void, _onError: (error: unknown) => void) => {
        listener = receive
        let active = true
        queueMicrotask(() => {
          if (active && pending) receive(pending)
        })
        return () => {
          active = false
        }
      }
    ),
    resolve: vi.fn(async (_requestId: string, _action: ApplicationCloseResolution) => true),
  } satisfies ApplicationClosePort
  const view = render(
    <I18nProvider resources={appLocales}>
      <ApplicationLifecycle native={native} isIsolatedPreview={() => isPreview} />
      <ProjectFileFeedback />
    </I18nProvider>
  )
  await waitFor(() => expect(native.subscribe).toHaveBeenCalledOnce())
  return {
    native,
    unmount: view.unmount,
    receive: (request: ApplicationCloseRequest) => {
      act(() => listener(request))
    },
  }
}

it("cancels an explicit quit through the real unsaved-project dialog and keeps dirty edits", async () => {
  const { native, receive } = await renderLifecycle()
  receive({ requestId: "quit-cancel", intent: "explicit-exit" })
  expect(await screen.findByRole("heading", { name: "Save changes to this project?" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(native.resolve).toHaveBeenCalledWith("quit-cancel", "cancel"))
  expect(useProjectState.getState().document.transport.bpm).toBe(151)
  expect(useProjectState.getState().session.dirty).toBe(true)
  expect(nativeProjectStorage.saveProject).not.toHaveBeenCalled()
})

it("does not exit when Save in the quit dialog fails", async () => {
  vi.mocked(nativeProjectStorage.pickSavePath).mockResolvedValue("/songs/Guard.zdaw")
  vi.mocked(nativeProjectStorage.saveProject).mockRejectedValue({
    code: "io",
    message: "Disk full",
  })
  const { native, receive } = await renderLifecycle()
  receive({ requestId: "quit-save-failed", intent: "explicit-exit" })
  fireEvent.click(await screen.findByRole("button", { name: "Save" }))
  await waitFor(() => expect(native.resolve).toHaveBeenCalledWith("quit-save-failed", "cancel"))
  expect(screen.getByRole("alert").textContent).toContain("Disk full")
  expect(useProjectState.getState().session.dirty).toBe(true)
  expect(native.resolve).not.toHaveBeenCalledWith("quit-save-failed", "exit")
})

it("waits for a real facade save receipt before authorizing native process exit", async () => {
  vi.mocked(nativeProjectStorage.pickSavePath).mockResolvedValue("/songs/Guard.zdaw")
  let publish!: (receipt: unknown) => void
  vi.mocked(nativeProjectStorage.saveProject).mockReturnValue(
    new Promise(resolve => {
      publish = resolve
    })
  )
  const { native, receive } = await renderLifecycle()
  receive({ requestId: "quit-save", intent: "explicit-exit" })
  fireEvent.click(await screen.findByRole("button", { name: "Save" }))
  await waitFor(() => expect(nativeProjectStorage.saveProject).toHaveBeenCalledOnce())
  expect(native.resolve).not.toHaveBeenCalled()
  const request = vi.mocked(nativeProjectStorage.saveProject).mock.calls[0][0]
  publish({ path: request.path, manifest: parseManifest(request.manifest), durability: "synced" })
  await waitFor(() => expect(native.resolve).toHaveBeenCalledWith("quit-save", "exit"))
  expect(useProjectState.getState().session.dirty).toBe(false)
})

it("hides a dirty project to tray without saving, clearing it, or releasing its owner", async () => {
  setCloseBehavior("tray")
  const before = useProjectState.getState().document
  const { native, receive } = await renderLifecycle()
  receive({ requestId: "hide", intent: "close-button" })
  await waitFor(() => expect(native.resolve).toHaveBeenCalledWith("hide", "hide"))
  expect(useProjectState.getState().document).toBe(before)
  expect(useProjectState.getState().session.dirty).toBe(true)
  expect(useProjectState.getState().session.backend.phase).not.toBe("idle")
  expect(screen.queryByRole("heading", { name: "Save changes to this project?" })).toBeNull()
  expect(nativeProjectStorage.saveProject).not.toHaveBeenCalled()
})

it("blocks Quit visibly while a disk save is running instead of cancelling or losing it", async () => {
  vi.mocked(nativeProjectStorage.pickSavePath).mockResolvedValue("/songs/Guard.zdaw")
  let publish!: (receipt: unknown) => void
  vi.mocked(nativeProjectStorage.saveProject).mockReturnValue(
    new Promise(resolve => {
      publish = resolve
    })
  )
  const { native, receive } = await renderLifecycle()
  let saving!: Promise<string | null>
  act(() => {
    saving = projectFiles.save()
  })
  await waitFor(() => expect(nativeProjectStorage.saveProject).toHaveBeenCalledOnce())
  receive({ requestId: "busy-quit", intent: "explicit-exit" })
  expect(await screen.findByRole("heading", { name: "The application remains open" })).toBeTruthy()
  expect(screen.getByText(/A project file operation is still running/)).toBeTruthy()
  await waitFor(() => expect(native.resolve).toHaveBeenCalledWith("busy-quit", "cancel"))
  expect(nativeProjectStorage.cancel).not.toHaveBeenCalled()
  const request = vi.mocked(nativeProjectStorage.saveProject).mock.calls[0][0]
  await act(async () => {
    publish({ path: request.path, manifest: parseManifest(request.manifest), durability: "synced" })
    await saving
  })
  expect(useProjectState.getState().session.dirty).toBe(false)
  expect(native.resolve).not.toHaveBeenCalledWith("busy-quit", "exit")
})

it("never bypasses dirty confirmation in Gallery and does not expose native Save there", async () => {
  const { native, receive } = await renderLifecycle(true)
  receive({ requestId: "preview-quit", intent: "explicit-exit" })
  expect(
    await screen.findByRole("heading", { name: "Discard unsaved preview changes?" })
  ).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  expect(native.resolve).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(native.resolve).toHaveBeenCalledWith("preview-quit", "cancel"))
  expect(useProjectState.getState().session.dirty).toBe(true)
  expect(nativeProjectStorage.saveProject).not.toHaveBeenCalled()
})

it("recovers a native quit ticket created before the frontend listener was ready", async () => {
  const { native } = await renderLifecycle(false, {
    requestId: "early-quit",
    intent: "explicit-exit",
  })
  expect(await screen.findByRole("heading", { name: "Save changes to this project?" })).toBeTruthy()
  expect(native.resolve).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(native.resolve).toHaveBeenCalledWith("early-quit", "cancel"))
})

it("releases its own discard promise on unmount without authorizing a stale native exit", async () => {
  const { native, receive, unmount } = await renderLifecycle()
  receive({ requestId: "unmount-quit", intent: "explicit-exit" })
  expect(await screen.findByRole("heading", { name: "Save changes to this project?" })).toBeTruthy()
  unmount()
  expect(useProjectFilesState.getState().confirmDiscard).toBe(false)
  expect(native.resolve).not.toHaveBeenCalled()
  expect(useProjectState.getState().session.dirty).toBe(true)
})
