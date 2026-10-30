import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { StrictMode } from "react"
import { MemoryRouter } from "react-router-dom"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { ProjectWorkspace } from "./ProjectWorkspace"
import { WorkspaceController } from "./WorkspaceController"
import { moveGroupOrPanel, moveToBorder, selectBorderTab, setBorderType } from "./dock/model"

const geometry = new Map<string, DOMRect>()
const rect = (x: number, y: number, width: number, height: number): DOMRect => ({
  x,
  y,
  width,
  height,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
  toJSON: () => ({}),
})
function Workspace({ controller }: { controller: WorkspaceController }) {
  return (
    <MemoryRouter>
      <div id="app-titlebar-workspace-actions" />
      <ProjectWorkspace controller={controller} />
    </MemoryRouter>
  )
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    return geometry.get(this.dataset.testid ?? "") ?? rect(0, 0, 900, 700)
  })
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value() {} },
    hasPointerCapture: {
      configurable: true,
      value() {
        return false
      },
    },
    releasePointerCapture: { configurable: true, value() {} },
  })
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
})
afterEach(() => {
  cleanup()
  geometry.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("mounts the controlled DOM Dock and keeps the titlebar portal under StrictMode", () => {
  const controller = new WorkspaceController()
  const view = render(
    <StrictMode>
      <Workspace controller={controller} />
    </StrictMode>
  )
  expect(
    view.container.querySelectorAll("[data-testid^='dock-border-'][role='toolbar']")
  ).toHaveLength(3)
  expect(view.container.querySelector("[data-testid='dock-content-browser']")).not.toBeNull()
  expect(view.container.querySelector("[data-testid='dock-content-arrangement']")).not.toBeNull()
  const toggle = view.container.querySelector<HTMLButtonElement>(
    "[data-workspace-region='bottom']"
  )!
  expect(toggle.getAttribute("aria-pressed")).toBe("true")
  const clip = view.container.querySelector("#project-clip-view")
  fireEvent.click(toggle)
  expect(toggle.getAttribute("aria-pressed")).toBe("false")
  expect(clip?.getAttribute("data-workspace-visible")).toBe("false")
  fireEvent.click(toggle)
  expect(view.container.querySelector("#project-clip-view")).toBe(clip)
  expect(clip?.getAttribute("data-workspace-visible")).toBe("true")
})

it("retains Browser and Footer subtree identity through moves, tab switches, maximize and hide, but close unmounts", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  const browser = view.container.querySelector("[data-workspace-panel='browser']")
  const clip = view.container.querySelector("#project-clip-view")
  act(() =>
    controller.setLayout(
      moveGroupOrPanel(
        controller.layout,
        { groupId: "border:left", tabId: "browser" },
        "workspace-center",
        "right"
      )
    )
  )
  expect(view.container.querySelector("[data-workspace-panel='browser']")).toBe(browser)
  const group = controller.layout.activeGroup!
  act(() =>
    controller.setLayout(
      moveToBorder(controller.layout, { groupId: group, tabId: "browser" }, "right", 260)
    )
  )
  expect(view.container.querySelector("[data-workspace-panel='browser']")).toBe(browser)
  expect(
    view.container.querySelector("[data-workspace-panel='browser']")?.getAttribute("aria-hidden")
  ).toBe("true")
  act(() => controller.show("browser"))
  expect(view.container.querySelector("[data-workspace-panel='browser']")).toBe(browser)
  act(() => controller.show("devices"))
  expect(view.container.querySelector("#project-clip-view")).toBe(clip)
  act(() => controller.show("clip"))
  expect(view.container.querySelector("#project-clip-view")).toBe(clip)
  act(() => controller.hide("browser"))
  expect(view.container.querySelector("[data-workspace-panel='browser']")).toBe(browser)
  act(() => controller.show("browser"))
  expect(view.container.querySelector("[data-workspace-panel='browser']")).toBe(browser)
  act(() => controller.close("browser"))
  expect(view.container.querySelector("[data-workspace-panel='browser']")).toBeNull()
})

it("makes all three rail tabs square icon controls and offers overlay and hover toggles at the endpoint", async () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  for (const side of ["left", "right", "bottom"]) {
    const rail = view.container.querySelector(`[data-testid='dock-border-${side}']`)
    expect(rail).not.toBeNull()
    expect(rail?.querySelector(`[data-testid='dock-border-options-${side}']`)).not.toBeNull()
  }
  const browser = view.container.querySelector<HTMLButtonElement>(
    "[data-testid='dock-tab-browser']"
  )!
  expect(browser.querySelector("svg")).not.toBeNull()
  expect(browser.textContent).toBe("")
  fireEvent.click(browser)
  expect(controller.layout.borders.left?.selected).toBeNull()
  fireEvent.click(browser)
  expect(controller.layout.borders.left?.selected).toBe("browser")
  fireEvent.click(view.container.querySelector("[data-testid='dock-border-options-left']")!)
  const overlay = await waitFor(() =>
    document.querySelector<HTMLElement>("[data-testid='dock-border-options-mode-left']")
  )
  expect(overlay).not.toBeNull()
  fireEvent.click(overlay!)
  expect(controller.layout.borders.left?.type).toBe("overlay")
})

it("keeps split open on outside and Escape while overlay dismisses; menus hold overlay open", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  const outside = view.container.querySelector("[data-testid='dock-content-arrangement']")!
  fireEvent.pointerDown(outside)
  fireEvent.keyDown(window, { key: "Escape" })
  expect(controller.layout.borders.left?.selected).toBe("browser")
  act(() => controller.setLayout(setBorderType(controller.layout, "left", "overlay")))
  const browser = view.container.querySelector("[data-testid='dock-content-browser']")!
  fireEvent.pointerDown(browser.querySelector("input")!)
  expect(controller.layout.borders.left?.selected).toBe("browser")
  fireEvent.pointerDown(outside)
  expect(controller.layout.borders.left?.selected).toBeNull()
  act(() => controller.setLayout(selectBorderTab(controller.layout, "left", "browser")))
  fireEvent.keyDown(window, { key: "Escape" })
  expect(controller.layout.borders.left?.selected).toBeNull()
})

it("roves focus with arrow keys and activates only on Enter, not Space", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  act(() => {
    controller.move("browser", "center")
    controller.show("arrangement")
  })
  const first = view.container.querySelector<HTMLElement>("[data-testid='dock-tab-arrangement']")!
  const second = view.container.querySelector<HTMLElement>("[data-testid='dock-tab-browser']")!
  first.focus()
  fireEvent.keyDown(first, { key: "ArrowRight" })
  expect(document.activeElement).toBe(second)
  expect(controller.layout.root?.kind === "group" && controller.layout.root.active).toBe(
    "arrangement"
  )
  fireEvent.keyDown(second, { key: " " })
  expect(controller.layout.root?.kind === "group" && controller.layout.root.active).toBe(
    "arrangement"
  )
  fireEvent.keyDown(second, { key: "Enter" })
  expect(controller.layout.root?.kind === "group" && controller.layout.root.active).toBe("browser")
})

it("cancels owned edit on hide while preserving mounted panel", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  const clip = view.container.querySelector("#project-clip-view")!
  const original = useProjectState.getState().document.transport.bpm
  fireEvent.pointerDown(clip)
  act(() => {
    projectActions.beginEdit()
    projectActions.setBpm(original + 10)
  })
  expect(useProjectState.getState().document.transport.bpm).toBe(original + 10)
  fireEvent.click(view.container.querySelector("[data-workspace-region='bottom']")!)
  expect(useProjectState.getState().document.transport.bpm).toBe(original)
  expect(view.container.querySelector("#project-clip-view")).toBe(clip)
})

it("waits for drag threshold, then previews rail insertion and cancels Escape without committing", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  geometry.set("dock", rect(0, 0, 900, 700))
  geometry.set("dock-border-left", rect(0, 0, 26, 700))
  geometry.set("dock-border-bottom", rect(26, 674, 848, 26))
  geometry.set("dock-border-right", rect(874, 0, 26, 700))
  const tab = view.container.querySelector<HTMLElement>("[data-testid='dock-tab-browser']")!
  fireEvent.pointerDown(tab, { pointerId: 7, button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(tab, { pointerId: 7, clientX: 11, clientY: 11 })
  expect(view.container.querySelector("[data-testid='dock-drop-preview']")).toBeNull()
  fireEvent.pointerMove(tab, { pointerId: 7, clientX: 887, clientY: 600 })
  expect(view.container.querySelector("[data-testid='dock-rail-insert-right']")).not.toBeNull()
  fireEvent.keyDown(window, { key: "Escape" })
  fireEvent.pointerUp(tab, { pointerId: 7, clientX: 887, clientY: 600 })
  expect(controller.regionPanels("right")).toEqual([])
  expect(controller.regionPanels("left")).toEqual(["browser"])
})

it("keeps an active tab reachable after closing the previously focused tab", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  act(() => controller.move("browser", "center"))
  const outgoing = view.container.querySelector<HTMLElement>(
    "[data-testid='dock-tab-arrangement']"
  )!
  act(() => outgoing.focus())
  act(() => controller.close("arrangement"))
  const remaining = view.container.querySelector<HTMLElement>("[data-testid='dock-tab-browser']")!
  expect(remaining.getAttribute("aria-selected")).toBe("true")
  expect(remaining.tabIndex).toBe(0)
})

it("keeps close independently focusable beside its tab and reserves Space for playback", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  act(() => {
    controller.move("browser", "center")
    controller.show("arrangement")
  })
  const arrangement = view.container.querySelector("[data-testid='dock-content-arrangement']")
  const tab = view.container.querySelector<HTMLElement>("[data-testid='dock-tab-browser']")!
  const close = view.container.querySelector<HTMLButtonElement>(
    "[data-testid='dock-close-browser']"
  )!
  expect(close.closest("[role='tab']")).toBeNull()
  expect(tab.parentElement).toBe(close.parentElement)
  act(() => close.focus())
  fireEvent.keyDown(close, { key: "ArrowLeft" })
  expect(document.activeElement).toBe(close)
  expect(fireEvent.keyDown(close, { key: " " })).toBe(false)
  expect(controller.layout.root?.kind === "group" && controller.layout.root.tabs).toContain(
    "browser"
  )
  fireEvent.click(close)
  expect(controller.layout.root?.kind === "group" && controller.layout.root.tabs).not.toContain(
    "browser"
  )
  expect(view.container.querySelector("[data-testid='dock-content-arrangement']")).toBe(arrangement)
  expect(controller.layout.root?.kind === "group" && controller.layout.root.active).toBe(
    "arrangement"
  )
})

it.each(["Escape", "blur", "pointercancel"])(
  "discards a border resize preview on %s without replacing panel hosts",
  reason => {
    const controller = new WorkspaceController()
    const view = render(<Workspace controller={controller} />)
    const before = controller.layout
    const host = view.container.querySelector("[data-testid='dock-content-browser']")
    const flyout = view.container.querySelector<HTMLElement>("[data-testid='dock-flyout-left']")!
    const width = flyout.style.width
    const divider = view.container.querySelector("[data-testid='dock-border-divider-left']")!
    fireEvent.pointerDown(divider, { pointerId: 31, button: 0, clientX: 100, clientY: 20 })
    fireEvent.pointerMove(divider, { pointerId: 31, clientX: 140, clientY: 20 })
    expect(flyout.style.width).not.toBe(width)
    expect(controller.layout).toBe(before)
    if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" })
    else if (reason === "blur") fireEvent.blur(window)
    else fireEvent.pointerCancel(divider, { pointerId: 31 })
    fireEvent.pointerUp(divider, { pointerId: 31, clientX: 140, clientY: 20 })
    expect(controller.layout).toBe(before)
    expect(flyout.style.width).toBe(width)
    expect(view.container.querySelector("[data-testid='dock-content-browser']")).toBe(host)
  }
)

it("commits border resize only on release and retains the content host", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  const before = controller.layout
  const host = view.container.querySelector("[data-testid='dock-content-browser']")
  const divider = view.container.querySelector("[data-testid='dock-border-divider-left']")!
  fireEvent.pointerDown(divider, { pointerId: 32, button: 0, clientX: 100, clientY: 20 })
  fireEvent.pointerMove(divider, { pointerId: 32, clientX: 140, clientY: 20 })
  expect(controller.layout).toBe(before)
  fireEvent.pointerUp(divider, { pointerId: 32, clientX: 140, clientY: 20 })
  expect(controller.layout.borders.left?.size).toBe(before.borders.left!.size + 40)
  expect(view.container.querySelector("[data-testid='dock-content-browser']")).toBe(host)
})

it("collapses and reopens the fixed Device panel from its bottom divider", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  act(() => controller.show("devices"))
  const divider = view.container.querySelector<HTMLElement>(
    "[data-testid='dock-border-divider-bottom']"
  )!
  expect(divider.className).toContain("dock-border-divider-fixed")
  fireEvent.pointerDown(divider, { pointerId: 34, button: 0, clientX: 400, clientY: 500 })
  fireEvent.pointerMove(divider, { pointerId: 34, clientX: 400, clientY: 540 })
  fireEvent.pointerUp(divider, { pointerId: 34, clientX: 400, clientY: 540 })
  expect(controller.layout.borders.bottom?.selected).toBeNull()
  act(() => controller.show("devices"))
  expect(controller.layout.borders.bottom?.selected).toBe("devices")
})

it("resizes the selected Clip panel vertically from its bottom divider", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  const before = controller.layout.borders.bottom!.size
  const divider = view.container.querySelector<HTMLElement>(
    "[data-testid='dock-border-divider-bottom']"
  )!
  expect(divider.className).not.toContain("dock-border-divider-fixed")
  fireEvent.pointerDown(divider, { pointerId: 35, button: 0, clientX: 400, clientY: 500 })
  fireEvent.pointerMove(divider, { pointerId: 35, clientX: 400, clientY: 460 })
  fireEvent.pointerUp(divider, { pointerId: 35, clientX: 400, clientY: 460 })
  expect(controller.layout.borders.bottom?.size).toBe(before + 40)
})

it("commits split resize without remounting the panels moved out of a border", () => {
  const controller = new WorkspaceController()
  const view = render(<Workspace controller={controller} />)
  const browser = view.container.querySelector("[data-testid='dock-content-browser']")
  const arrangement = view.container.querySelector("[data-testid='dock-content-arrangement']")
  act(() =>
    controller.setLayout(
      moveGroupOrPanel(
        controller.layout,
        { groupId: "border:left", tabId: "browser" },
        "workspace-center",
        "right"
      )
    )
  )
  const before = controller.layout
  if (before.root?.kind !== "split") throw new Error("Expected a split after moving Browser right")
  const divider = view.container.querySelector(`[data-testid='dock-divider-${before.root.id}-1']`)!
  fireEvent.pointerDown(divider, { pointerId: 33, button: 0, clientX: 400, clientY: 100 })
  fireEvent.pointerMove(divider, { pointerId: 33, clientX: 440, clientY: 100 })
  expect(controller.layout).toBe(before)
  fireEvent.pointerUp(divider, { pointerId: 33, clientX: 440, clientY: 100 })
  expect(controller.layout.root?.kind === "split" && controller.layout.root.sizes).not.toEqual(
    before.root.sizes
  )
  expect(view.container.querySelector("[data-testid='dock-content-browser']")).toBe(browser)
  expect(view.container.querySelector("[data-testid='dock-content-arrangement']")).toBe(arrangement)
})
