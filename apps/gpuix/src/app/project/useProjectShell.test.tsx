import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { getGroups } from "@/ui/panels"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { hydrateProject, serializeProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { logger } from "@/platform/log/logger"
import { ProjectLayout } from "./ProjectLayout"
import { useProjectShell } from "./useProjectShell"
import { createProjectWorkspace, restoreProjectWorkspace } from "./project-workspace"
import type { ProjectShellApi } from "./useProjectShell"
import { createTimelineKeyboard } from "@/project/sections/arrangement/timeline/keyboard/controller"

let root: TestRoot
const observed: { shell: ProjectShellApi | null } = { shell: null }
beforeEach(() => {
  root = createTestRoot({ width: 1280, height: 800 })
  hydrateProject(JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() }))
})
afterEach(() => { root.unmount(); observed.shell = null })
function Shell() {
  const shell = useProjectShell()
  observed.shell = shell
  return <ProjectLayout projectId="shell-regression" shell={shell} focusRef={() => {}} labels={{ browserPanel: "Browser", arrangementPanel: "Arrangement" }} transport={<text>Transport</text>} browser={<text>Browser content</text>} arrangement={<text>Arrangement content</text>} clipEditor={<text>Clip editor content</text>} devices={<text>Devices content</text>} status={<text>Status</text>} />
}
async function settle() {
  for (let round = 0; round < 4; round++) { await Bun.sleep(35); root.renderer.flush(); root.renderer.dispatchNativeEvents() }
}
async function mount() {
  root.render(<ThemeProvider><ControlEnvironmentProvider value={{ inputPolicy: { dragThresholdPixels: 3, dragPixelsPerStep: 4, wheelPixelsPerStep: 16, wheelLinePixels: 16 } }}><Shell /></ControlEnvironmentProvider></ThemeProvider>)
  await settle()
}
function box(testId: string) {
  const element = root.renderer.findByTestId(testId)
  const bounds = element && root.renderer.getElementBounds(element.id)
  if (!bounds) throw new Error(`Missing ${testId}`)
  return bounds
}
test("workspace dock tabs switch footer contents and persist their active layout through project serialization", async () => {
  await mount()
  for (const id of ["browser", "arrangement", "clipEditor", "devices"]) expect(root.renderer.findByTestId(`project-workspace-tab-${id}`)).toBeDefined()
  expect(box("project-workspace-content-devices").height).toBeGreaterThan(0)
  const clipContent = root.renderer.findByTestId("project-workspace-content-clipEditor")
  expect(clipContent?.style?.display).toBe("none")
  const tab = root.renderer.findByTestId("project-workspace-tab-clipEditor")
  if (!tab) throw new Error("Missing clip tab")
  root.renderer.nativeSimulateKeystrokes(tab.id, "enter")
  await settle()
  expect(box("project-workspace-content-clipEditor").height).toBeGreaterThan(0)
  expect(root.renderer.findByTestId("project-workspace-content-clipEditor")?.id).toBe(clipContent?.id)
  expect(root.renderer.findByTestId("project-workspace-content-devices")?.style?.display).toBe("none")
  const saved = serializeProject()
  const persisted = useProjectState.getState().workspace.dockLayout
  flushSync(() => projectActions.setDockLayout(JSON.stringify(createProjectWorkspace(DEFAULT_LAYOUT_TOKENS.project.panels))))
  flushSync(() => hydrateProject(saved))
  await settle()
  expect(useProjectState.getState().workspace.dockLayout).toBe(persisted)
  expect(getGroups(observed.shell?.layout.root ?? null).find(group => group.id === "editors-group")?.active).toBe("clipEditor")
})
test("native application tab edge drag splits the workspace and saves its geometry", async () => {
  await mount()
  const from = box("project-workspace-tab-clipEditor")
  const to = box("project-workspace-group-arrangement-group")
  root.renderer.nativeSimulateMouseDown(from.x + from.width / 2, from.y + from.height / 2)
  root.renderer.nativeSimulateMouseMove(to.x + to.width - 5, to.y + to.height / 2, 0)
  root.renderer.nativeSimulateMouseUp(to.x + to.width - 5, to.y + to.height / 2)
  await settle()
  const layout = observed.shell?.layout
  expect(getGroups(layout?.root ?? null)).toHaveLength(4)
  expect(JSON.parse(useProjectState.getState().workspace.dockLayout ?? "null")).toEqual(layout)
})
test("invalid persisted workspace JSON restores the default and warns instead of losing the project", () => {
  const warn = spyOn(logger, "warn").mockImplementation(() => {})
  try {
    for (const json of ["{", JSON.stringify({ version: 99 }), JSON.stringify({ ...createProjectWorkspace(DEFAULT_LAYOUT_TOKENS.project.panels), hidden: ["unknown"] })]) {
      expect(restoreProjectWorkspace(json, DEFAULT_LAYOUT_TOKENS.project.panels)).toEqual(createProjectWorkspace(DEFAULT_LAYOUT_TOKENS.project.panels))
    }
    expect(warn).toHaveBeenCalledTimes(3)
  } finally { warn.mockRestore() }
})
test("application dock keyboard context maximizes and restores the focused group without repeat toggles", async () => {
  await mount()
  const keyboard = createTimelineKeyboard({
    focus: () => observed.shell?.dockFocused.current ? "dock" : "timeline",
    blurControl: () => {},
    executeDockCommand: command => observed.shell?.dockRef.current?.executeCommand(command) ?? false,
  })
  try {
    const tab = root.renderer.findByTestId("project-workspace-tab-devices")
    if (!tab) throw new Error("Missing devices tab")
    root.renderer.focusElement(tab.id)
    await settle()
    const event = { key: "enter", modifiers: { ctrl: true, cmd: false, alt: false, shift: true }, defaultPrevented: false }
    expect(keyboard.down(event)).toBe(true)
    await settle()
    expect(observed.shell?.layout.maximizedGroup).toBe("editors-group")
    expect(keyboard.down({ ...event, isHeld: true })).toBe(true)
    await settle()
    expect(observed.shell?.layout.maximizedGroup).toBe("editors-group")
    expect(keyboard.down(event)).toBe(true)
    await settle()
    expect(observed.shell?.layout.maximizedGroup).toBeNull()
  } finally { keyboard.dispose() }
})
