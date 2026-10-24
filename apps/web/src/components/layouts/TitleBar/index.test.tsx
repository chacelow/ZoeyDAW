// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react"
import { createPortal } from "react-dom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useSettingsDialog } from "@/shared/app-shared/settings-dialog-store"
import { nativeApplicationLifecycle } from "@/shared/native/application-lifecycle"
import { TitleBar } from "."

const nativeWindow = vi.hoisted(() => ({
  startDragging: vi.fn(),
  toggleMaximize: vi.fn(),
  minimize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => nativeWindow }))
vi.mock("@/shared/app-shared", async () => import("@/shared/app-shared/settings-dialog-store"))
vi.mock("@/shared/native/application-lifecycle", () => ({
  nativeApplicationLifecycle: { requestClose: vi.fn().mockResolvedValue(undefined) },
}))

beforeEach(() => {
  useSettingsDialog.getState().closeSettings()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it("exposes a shared-size workspace action slot that never initiates window dragging", () => {
  const view = render(<TitleBar title="Session" />)
  const slot = view.container.querySelector<HTMLElement>("#app-titlebar-workspace-actions")
  const titlebar = view.container.querySelector<HTMLElement>("[data-app-titlebar]")
  if (!slot || !titlebar) {
    throw new Error("Missing titlebar workspace action slot")
  }
  expect(slot.closest("[data-tab-interactive]")).not.toBeNull()
  expect(titlebar.style.getPropertyValue("--spacing-control-track")).toBe("28px")
  expect(titlebar.style.getPropertyValue("--spacing-control-icon")).toBe("16px")
  fireEvent.mouseDown(slot, { buttons: 1, detail: 1 })
  fireEvent.mouseDown(slot, { buttons: 1, detail: 2 })

  const portal = render(
    createPortal(
      <button type="button" aria-label="Toggle browser">
        <svg data-testid="browser-icon" aria-hidden="true" />
      </button>,
      slot
    )
  )
  fireEvent.mouseDown(portal.getByTestId("browser-icon"), { buttons: 1, detail: 1 })
  expect(nativeWindow.startDragging).not.toHaveBeenCalled()
  expect(nativeWindow.toggleMaximize).not.toHaveBeenCalled()
})

it("preserves native dragging and double-click maximize outside action controls", () => {
  const view = render(<TitleBar title="Session" />)
  fireEvent.mouseDown(view.getByText("Session"), { buttons: 1, detail: 1 })
  expect(nativeWindow.startDragging).toHaveBeenCalledOnce()
  fireEvent.mouseDown(view.getByText("Session"), { buttons: 1, detail: 2 })
  expect(nativeWindow.toggleMaximize).toHaveBeenCalledOnce()
})

it("opens the existing settings dialog without dragging the window", () => {
  const view = render(<TitleBar />)
  const settings = view.getAllByRole("button")[0]
  if (!settings) {
    throw new Error("Missing settings button")
  }
  fireEvent.mouseDown(settings, { buttons: 1, detail: 1 })
  fireEvent.click(settings)
  expect(useSettingsDialog.getState().open).toBe(true)
  expect(nativeWindow.startDragging).not.toHaveBeenCalled()
})

it("requests guarded application close instead of destroying the native window", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT 10")
  const view = render(<TitleBar />)
  const controls = await waitFor(() => view.getByRole("group"))
  const close = within(controls).getAllByRole("button")[2]
  if (!close) throw new Error("Missing native close control")
  fireEvent.click(close)
  expect(nativeApplicationLifecycle.requestClose).toHaveBeenCalledOnce()
  expect(nativeWindow.close).not.toHaveBeenCalled()
})
