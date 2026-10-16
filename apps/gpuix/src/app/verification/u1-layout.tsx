/* eslint-disable no-await-in-loop -- Observe each native layout round before dispatching the next. */
import "./native-fixture"
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { useLayoutEffect } from "react"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import {
  projectActions,
  setProjectStorageId,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { PanelEnvironmentProvider } from "@/ui/panels"
import { initAppI18n } from "../i18n"
import { AppInteractionProvider } from "../interaction"
import { AppNativeEnvironmentProvider } from "../native-environment"
import { ProjectSections } from "../project/ProjectSections"
import { useProjectComposition } from "../project/useProjectComposition"
import { useProjectShell } from "../project/useProjectShell"
import { createRouter, RouterProvider } from "../router/router"
import type { ProjectComposition } from "../project/composition"
import type { ProjectShellApi } from "../project/useProjectShell"

const output = process.argv[2]
assert.ok(output, "Pass an external evidence directory")
mkdirSync(output, { recursive: true })
initAppI18n({ initialLanguage: "en-US", storage: { get: () => "en-US", set: () => {} } })
const activity = { subscribeWindowActive: () => () => {} }
const keyboard = createWindowKeyboard()
const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
const owner: { composition: ProjectComposition | null; shell: ProjectShellApi | null } = {
  composition: null,
  shell: null,
}
function Project() {
  const shell = useProjectShell()
  useLayoutEffect(() => {
    setProjectStorageId("u1-probe")
    return startProjectRuntime()
  }, [])
  const { composition, browserRef, focusRef } = useProjectComposition(shell)
  owner.composition = composition
  owner.shell = shell
  return composition ? (
    <ProjectSections
      composition={composition}
      browserRef={browserRef}
      focusRef={focusRef}
      projectId="u1-probe"
      shell={shell}
      labels={{
        resizeBrowser: "Resize browser",
        resizeClipEdit: "Resize Clip Edit",
        browserPanel: "Browser",
        arrangementPanel: "Arrangement",
        footerPanel: "Footer",
        activeDescription: "Active panel",
      }}
    />
  ) : null
}
function bounds(testId: string) {
  const element = root.renderer.findByTestId(testId)
  return element
    ? { id: element.id, bounds: root.renderer.getElementBounds(element.id), style: element.style }
    : null
}
const rows: object[] = []
const mismatches: string[] = []
const observations: { stableIds: { panel: number; grid: number } | null } = { stableIds: null }
async function rounds(stage: string) {
  for (let round = 0; round < 8; round++) {
    await Bun.sleep(20)
    root.renderer.flush()
    const row = {
      stage,
      round,
      panel: bounds("arrangement-panel"),
      layout: bounds("timeline-layout"),
      grid: bounds("timeline-grid"),
      footer: bounds("footer-content"),
      clip: bounds("clip-panel"),
      viewport: owner.composition?.timeline.sceneStore.get().viewport,
      scrollY: useProjectState.getState().workspace.scrollY,
      collapsed: owner.shell?.footerCollapsed,
    }
    rows.push(row)
    assert.ok(
      row.panel && row.grid && row.viewport && row.layout?.bounds,
      "Missing timeline geometry"
    )
    observations.stableIds ??= { panel: row.panel.id, grid: row.grid.id }
    assert.equal(row.panel.id, observations.stableIds.panel, "Arrangement remounted")
    assert.equal(row.grid.id, observations.stableIds.grid, "Grid remounted")
    if (stage !== "initial")
      assert.equal(row.scrollY, 0, "Height-only change revealed the editing track")
    if (row.viewport.height !== row.layout.bounds.height) mismatches.push(`${stage}:${round}`)
    root.renderer.captureScreenshot(path.join(output, `${stage}-${round}.png`))
    root.renderer.dispatchNativeEvents()
  }
}
function command(testId: string) {
  const element = root.renderer.findByTestId(testId)
  assert.ok(element, `Missing ${testId}`)
  root.renderer.nativeSimulateKeystrokes(element.id, "enter")
}
try {
  root.render(
    <ThemeProvider>
      <AnimationFrameProvider
        source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}
      >
        <AppNativeEnvironmentProvider value={activity}>
          <WindowKeyboardProvider value={keyboard}>
            <PanelEnvironmentProvider environment={activity}>
              <AppInteractionProvider>
                <RouterProvider value={createRouter("/")}>
                  <Project />
                </RouterProvider>
              </AppInteractionProvider>
            </PanelEnvironmentProvider>
          </WindowKeyboardProvider>
        </AppNativeEnvironmentProvider>
      </AnimationFrameProvider>
    </ThemeProvider>
  )
  assert.ok(await whenProjectBackendIdle(), "Real backend not ready")
  await rounds("initial")
  projectActions.setEditingClip("native-midi-clip")
  await rounds("editing")
  command("status-clip")
  await rounds("clip-collapse")
  assert.equal(root.renderer.findByTestId("footer-content"), undefined)
  command("status-clip")
  await rounds("clip-expand")
  command("status-toggle-footer")
  await rounds("footer-toggle")
  assert.equal(owner.shell?.footerCollapsed, true)
  assert.equal(root.renderer.findByTestId("footer-content"), undefined)
} finally {
  writeFileSync(path.join(output, "layout-rounds.json"), JSON.stringify(rows, null, 2))
  root.unmount()
}
console.log(
  JSON.stringify({
    output,
    rounds: rows.length,
    stableIds: observations.stableIds,
    atomicLayout: mismatches.length === 0,
    mismatches,
  })
)
