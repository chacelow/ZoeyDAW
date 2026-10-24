import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions } from "../adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { useProjectShell } from "../useProjectShell"
import { WorkspaceController } from "./WorkspaceController"
import {
  borderTabs,
  findBorder,
  findGroup,
  getGroups,
  moveToBorder,
  selectBorderTab,
  setBorderType,
  toggleMaximize,
} from "./dock/model"

beforeEach(() =>
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
)
afterEach(cleanup)

it("owns versioned reference Dock layout and three persistent rails", () => {
  const controller = new WorkspaceController()
  expect(controller.layout.version).toBe(2)
  expect(getGroups(controller.layout.root)).toHaveLength(1)
  expect(controller.regionPanels("left")).toEqual(["browser"])
  expect(controller.regionPanels("bottom")).toEqual(["clip", "devices"])
  expect(controller.regionPanels("right")).toEqual([])
  expect(controller.layout.borders.left?.selected).toBe("browser")
  expect(controller.layout.borders.bottom?.selected).toBe("clip")
  expect(controller.isRegionVisible("right")).toBe(true)
})

it("keeps Browser toggle at its moved location and rail visibility independent", () => {
  const controller = new WorkspaceController()
  controller.move("browser", "right")
  expect(findBorder(controller.layout, "browser")).toBe("right")
  expect(controller.layout.borders.right?.selected).toBeNull()
  controller.toggleBrowser()
  expect(controller.layout.borders.right?.selected).toBe("browser")
  controller.toggleBrowser()
  expect(controller.layout.borders.right?.selected).toBeNull()
  controller.toggleRegion("right")
  expect(controller.isRegionVisible("right")).toBe(false)
  controller.toggleBrowser()
  expect(controller.isRegionVisible("right")).toBe(true)
  expect(controller.layout.borders.right?.selected).toBeNull()
  controller.toggleBrowser()
  expect(controller.layout.borders.right?.selected).toBe("browser")
})

it("hides and restores panels without closing or duplicating their ownership", () => {
  const controller = new WorkspaceController()
  controller.hide("browser")
  expect(controller.layout.hidden).toContain("browser")
  expect(controller.regionPanels("left")).toEqual([])
  controller.show("browser")
  expect(controller.regionPanels("left")).toEqual(["browser"])
  expect(controller.layout.hidden).toEqual([])
  controller.close("browser")
  expect(controller.layout.hidden).toEqual([])
  controller.show("browser")
  expect(controller.regionPanels("left")).toEqual(["browser"])
  controller.reset()
  expect(controller.regionPanels("left")).toEqual(["browser"])
  expect(controller.layout.borders.left?.selected).toBe("browser")
})

it("keeps split border open on external changes while overlay selects exclusively", () => {
  const controller = new WorkspaceController()
  controller.move("browser", "right")
  controller.setLayout(selectBorderTab(controller.layout, "right", "browser"))
  controller.setLayout(setBorderType(controller.layout, "right", "overlay"))
  expect(controller.layout.borders.right?.selected).toBe("browser")
  controller.setLayout(setBorderType(controller.layout, "bottom", "overlay"))
  controller.setLayout(selectBorderTab(controller.layout, "bottom", "clip"))
  expect(controller.layout.borders.right?.selected).toBeNull()
  expect(controller.layout.borders.bottom?.selected).toBe("clip")
})

it("preserves controlled group operations and empty rails", () => {
  const controller = new WorkspaceController()
  const before = controller.layout
  controller.setLayout(
    moveToBorder(before, { groupId: "workspace-center", tabId: "arrangement" }, "right", 280)
  )
  expect(controller.layout.root).toBeNull()
  expect(controller.layout.borders.right?.selected).toBeNull()
  expect(borderTabs(controller.layout.borders.right)).toEqual(["arrangement"])
  controller.move("arrangement", "center")
  expect(getGroups(controller.layout.root)[0]?.tabs).toEqual(["arrangement"])
  const id = getGroups(controller.layout.root)[0].id
  controller.setLayout(toggleMaximize(controller.layout, id))
  expect(controller.layout.maximizedGroup).toBe(id)
  controller.setLayout(toggleMaximize(controller.layout, id))
  expect(controller.layout.maximizedGroup).toBeNull()
  expect(findGroup(controller.layout, id)).toBeDefined()
})

it("keeps the project shell's existing public contract and opens Clip only for editing", () => {
  const shell = renderHook(() => useProjectShell())
  const controller = shell.result.current.workspace
  expect(shell.result.current.toggleBrowser).toBe(controller.toggleBrowser)
  act(() => controller.setLayout(selectBorderTab(controller.layout, "bottom", null)))
  expect(controller.layout.borders.bottom?.selected).toBeNull()
  act(() => projectActions.setEditingClip("trager-1"))
  expect(controller.layout.borders.bottom?.selected).toBe("clip")
  shell.unmount()
})
