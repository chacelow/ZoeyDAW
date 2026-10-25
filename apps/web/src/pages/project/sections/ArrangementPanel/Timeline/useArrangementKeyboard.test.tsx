import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Button } from "@zoeymind/ui"
import {
  hydrateProject,
  projectActions,
  projectFiles,
  useProjectState,
} from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { useArrangementKeyboard } from "./useArrangementKeyboard"
import { browserLibrary, useBrowserLibraryState } from "@/pages/project/adapters/browser"
import type { BrowserAuditionPort, PreparedAudition } from "@/pages/project/adapters/browser"
import type { BrowserTreeRow } from "@/shared/native/browser"

const auditionItem: BrowserTreeRow = {
  id: "keyboard-audition",
  rootId: "root",
  name: "Voice.wav",
  path: "/audio/Voice.wav",
  relativePath: "Voice.wav",
  byteLength: 1000,
  modifiedMillis: 0,
  kind: "audio",
  depth: 0,
  hasChildren: false,
}
const auditionDisposers: (() => void)[] = []
function startAudition(preparing: boolean) {
  const audio = {
    select: vi.fn(() =>
      preparing
        ? new Promise<PreparedAudition>(() => {})
        : Promise.resolve({ durationSeconds: 4, source: null })
    ),
    stop: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    readStatus: vi.fn(async () => ({ durationSeconds: 4, playing: true })),
  } satisfies BrowserAuditionPort
  auditionDisposers.push(browserLibrary.configureAudition(audio))
  browserLibrary.select(auditionItem)
  return audio
}

function Keys({
  role = "button",
  snapshots = true,
}: {
  readonly role?: "button" | "menuitem"
  readonly snapshots?: boolean
}) {
  useArrangementKeyboard({ snapshots })
  const automation = useProjectState(state => state.workspace.automationMode)
  return (
    <>
      <Button
        role={role}
        aria-label="Automation"
        aria-pressed={automation}
        onClick={() => projectActions.setMode("automationMode", !automation)}
      >
        Automation
      </Button>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Level"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={5}
      />
      <input aria-label="Search" />
      <textarea aria-label="Notes" />
      <div contentEditable role="textbox" aria-label="Rename" suppressContentEditableWarning />
    </>
  )
}

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: {
        ...createMockWorkspace(),
        automationMode: false,
      },
    })
  )
})
afterEach(() => {
  cleanup()
  for (const dispose of auditionDisposers.splice(0)) dispose()
})

it.each(["button", "menuitem"] as const)(
  "owns Space over a focused %s without activating it or repeating playback",
  role => {
    const view = render(<Keys role={role} />)
    const button = view.getByLabelText("Automation")
    button.focus()
    expect(fireEvent.keyDown(button, { key: " ", code: "Space" })).toBe(false)
    expect(document.activeElement).not.toBe(button)
    expect(useProjectState.getState().session.playing).toBe(true)
    fireEvent.keyDown(button, { key: " ", code: "Space", repeat: true })
    expect(useProjectState.getState().session.playing).toBe(true)
    expect(fireEvent.keyUp(button, { key: " ", code: "Space" })).toBe(false)
    expect(useProjectState.getState().workspace.automationMode).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(document.activeElement).not.toBe(button)
    fireEvent.keyDown(button, { key: " ", code: "Space" })
    expect(useProjectState.getState().session.playing).toBe(false)
  }
)

it("releases a focused slider without adjusting its value", () => {
  const slider = render(<Keys />).getByRole("slider")
  slider.focus()
  expect(fireEvent.keyDown(slider, { key: " ", code: "Space" })).toBe(false)
  expect(document.activeElement).not.toBe(slider)
  expect(slider.getAttribute("aria-valuenow")).toBe("5")
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(fireEvent.keyUp(slider, { key: " ", code: "Space" })).toBe(false)
  expect(slider.getAttribute("aria-valuenow")).toBe("5")
  expect(useProjectState.getState().session.playing).toBe(true)
})

it.each(["Search", "Notes", "Rename"])("leaves Space available to the %s editor", label => {
  const editor = render(<Keys />).getByLabelText(label)
  editor.focus()
  expect(fireEvent.keyDown(editor, { key: " ", code: "Space" })).toBe(true)
  expect(fireEvent.keyUp(editor, { key: " ", code: "Space" })).toBe(true)
  expect(useProjectState.getState().session.playing).toBe(false)
})

it("leaves Enter and modified Space to their existing owners", () => {
  const button = render(<Keys />).getByLabelText("Automation")
  button.focus()
  expect(fireEvent.keyDown(button, { key: "Enter", code: "Enter" })).toBe(true)
  expect(fireEvent.keyDown(button, { key: " ", code: "Space", ctrlKey: true })).toBe(true)
  expect(document.activeElement).toBe(button)
  expect(useProjectState.getState().session.playing).toBe(false)
})

it("keeps transport active while hidden Arrangement ignores editing shortcuts", () => {
  render(
    <div data-workspace-panel="arrangement" data-workspace-visible="false">
      <Keys />
    </div>
  )
  fireEvent.keyDown(window, { key: "a", code: "KeyA" })
  expect(useProjectState.getState().workspace.automationMode).toBe(false)
  fireEvent.keyDown(window, { key: " ", code: "Space" })
  expect(useProjectState.getState().session.playing).toBe(true)
  fireEvent.keyDown(window, { key: " ", code: "Space" })
  expect(useProjectState.getState().session.playing).toBe(false)
})

it("does not seek the project when navigating workspace tabs", () => {
  const view = render(
    <>
      <Keys />
      <div role="tablist" aria-label="Workspace">
        <button type="button" role="tab" aria-selected="true">
          Browser
        </button>
      </div>
    </>
  )
  const tab = view.getByRole("tab")
  const position = useProjectState.getState().session.position
  tab.focus()
  fireEvent.keyDown(tab, { key: "ArrowRight", code: "ArrowRight" })
  expect(useProjectState.getState().session.position).toEqual(position)
  const bpm = useProjectState.getState().document.transport.bpm
  projectActions.setBpm(bpm + 10)
  fireEvent.keyDown(tab, { key: "z", code: "KeyZ", metaKey: true })
  expect(useProjectState.getState().document.transport.bpm).toBe(bpm)
  fireEvent.keyDown(tab, { key: "z", code: "KeyZ", metaKey: true, shiftKey: true })
  expect(useProjectState.getState().document.transport.bpm).toBe(bpm + 10)
  fireEvent.keyDown(tab, { key: " ", code: "Space" })
  expect(useProjectState.getState().session.playing).toBe(true)
})

it("routes grid shortcuts only from Arrangement surfaces or unedited background", () => {
  const view = render(
    <>
      <Keys />
      <div data-workspace-panel="arrangement">
        <div data-arrangement-panel>
          <div role="application" data-arrangement-canvas-host tabIndex={0} aria-label="Canvas" />
          <div className="project-arrangement-toolbar">
            <button type="button">Grid</button>
          </div>
        </div>
      </div>
      <div data-transport-header>
        <button type="button">Transport</button>
      </div>
      <div data-clip-editor>
        <button type="button">Clip</button>
      </div>
      <div role="menu">
        <button type="button">Menu</button>
      </div>
      <div role="tablist">
        <button type="button" role="tab">
          Browser
        </button>
      </div>
    </>
  )
  const before = useProjectState.getState().document
  for (const element of [
    view.getByLabelText("Search"),
    view.getByText("Clip"),
    view.getByText("Menu"),
    view.getByRole("tab"),
  ]) {
    expect(fireEvent.keyDown(element, { code: "Digit3", key: "3", metaKey: true })).toBe(true)
  }
  expect(useProjectState.getState().workspace.grid.triplet).toBeUndefined()
  fireEvent.keyDown(view.getByLabelText("Canvas"), { code: "Digit3", key: "3", metaKey: true })
  expect(useProjectState.getState().workspace.grid.triplet).toBe(true)
  fireEvent.keyDown(view.getByText("Grid"), { code: "Digit4", key: "4", ctrlKey: true })
  expect(useProjectState.getState().workspace.snap).toBe(false)
  fireEvent.keyDown(view.getByText("Transport"), { code: "Digit5", key: "5", metaKey: true })
  expect(useProjectState.getState().workspace.grid.mode).toBe("fixed")
  expect(useProjectState.getState().document).toBe(before)
})
it("consumes save shortcuts without native file operations in isolated previews", () => {
  const save = vi.spyOn(projectFiles, "save")
  const saveAs = vi.spyOn(projectFiles, "saveAs")
  render(<Keys snapshots={false} />)
  expect(fireEvent.keyDown(window, { key: "s", ctrlKey: true })).toBe(false)
  expect(fireEvent.keyDown(window, { key: "s", metaKey: true, shiftKey: true })).toBe(false)
  expect(save).not.toHaveBeenCalled()
  expect(saveAs).not.toHaveBeenCalled()
  save.mockRestore()
  saveAs.mockRestore()
})

it("routes Cmd/Ctrl+S and Shift+S to disk actions, including text inputs", () => {
  const save = vi.spyOn(projectFiles, "save").mockResolvedValue(null)
  const saveAs = vi.spyOn(projectFiles, "saveAs").mockResolvedValue(null)
  const view = render(<Keys />)
  fireEvent.keyDown(view.getByLabelText("Search"), { key: "s", ctrlKey: true })
  fireEvent.keyDown(window, { key: "S", metaKey: true, shiftKey: true })
  expect(save).toHaveBeenCalledOnce()
  expect(saveAs).toHaveBeenCalledOnce()
  save.mockRestore()
  saveAs.mockRestore()
})

it.each([true, false])(
  "Space interrupts audition without toggling Arrangement (preparing=%s), then returns to transport",
  async preparing => {
    const button = render(<Keys />).getByLabelText("Automation")
    const audio = startAudition(preparing)
    await Promise.resolve()
    expect(useBrowserLibraryState.getState().audition.kind).toBe(preparing ? "preparing" : "ready")
    const stops = audio.stop.mock.calls.length
    button.focus()
    expect(fireEvent.keyDown(button, { key: " ", code: "Space" })).toBe(false)
    expect(document.activeElement).not.toBe(button)
    expect(useBrowserLibraryState.getState().audition).toEqual({ kind: "idle" })
    expect(audio.stop).toHaveBeenCalledTimes(stops + 1)
    expect(useProjectState.getState().session.playing).toBe(false)
    fireEvent.keyDown(button, { key: " ", code: "Space", repeat: true })
    fireEvent.keyUp(button, { key: " ", code: "Space" })
    expect(useProjectState.getState().session.playing).toBe(false)
    expect(useProjectState.getState().workspace.automationMode).toBe(false)
    fireEvent.keyDown(window, { key: " ", code: "Space" })
    expect(useProjectState.getState().session.playing).toBe(true)
  }
)

it("interrupting audition does not stop an already-playing Arrangement", async () => {
  render(<Keys />)
  projectActions.togglePlay()
  startAudition(false)
  await Promise.resolve()
  fireEvent.keyDown(window, { key: " ", code: "Space" })
  expect(useBrowserLibraryState.getState().audition).toEqual({ kind: "idle" })
  expect(useProjectState.getState().session.playing).toBe(true)
  fireEvent.keyUp(window, { key: " ", code: "Space" })
  fireEvent.keyDown(window, { key: " ", code: "Space" })
  expect(useProjectState.getState().session.playing).toBe(false)
})

it.each(["Search", "Notes", "Rename"])(
  "does not interrupt audition while entering Space in the %s editor",
  async label => {
    const editor = render(<Keys />).getByLabelText(label)
    const audio = startAudition(false)
    await Promise.resolve()
    const stops = audio.stop.mock.calls.length
    editor.focus()
    expect(fireEvent.keyDown(editor, { key: " ", code: "Space" })).toBe(true)
    expect(fireEvent.keyUp(editor, { key: " ", code: "Space" })).toBe(true)
    expect(audio.stop).toHaveBeenCalledTimes(stops)
    expect(useBrowserLibraryState.getState().audition).toMatchObject({
      kind: "ready",
      playing: true,
    })
    expect(useProjectState.getState().session.playing).toBe(false)
  }
)
