import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useLayoutEffect } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { configurePreferences, createPreferenceOwner } from "@/platform/settings"
import {
  configureProjectBackend,
  hydrateProject,
  projectActions,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { useProjectState as projectStore } from "@/project/stores/useProjectState"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { AppInteractionProvider } from "../interaction"
import { AppNativeEnvironmentProvider } from "../native-environment"
import { initAppI18n, useAppTranslation } from "../i18n"
import { RouterProvider, createRouter } from "../router/router"
import { clipEditorLabels } from "../locales/sections/clip-edit"
import { ProjectSections } from "./ProjectSections"
import { useProjectComposition } from "./useProjectComposition"
import { useProjectShell } from "./useProjectShell"
import type { ProjectComposition } from "./composition"
import type { ProjectShellApi } from "./useProjectShell"

function mount() {
  const cleanups: (() => void)[] = []
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-r3-layout-"))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  cleanups.push(configurePreferences(createPreferenceOwner({ configDir: directory })))
  initAppI18n({ initialLanguage: "en-US", storage: { get: () => "en-US", set: () => {} } })
  const saved = useProjectState.getState()
  const document = createMockDocument()
  const track = document.tracks.find(item => item.kind === "midi")
  const main = document.tracks.find(item => item.kind === "main")
  if (!track || !main) throw new Error("Missing native MIDI/Main fixtures")
  track.id = "r3-track"
  track.output = main.id
  track.clips = [{ id: "r3-clip", kind: "midi", startBar: 2, lengthBars: 2, notes: [] }]
  document.tracks = [
    track,
    ...Array.from({ length: 11 }, (_, index) => ({
      ...structuredClone(track),
      id: `r3-filler-${index}`,
      name: `Native track ${index}`,
      clips: [],
    })),
    main,
  ]
  const snapshot = JSON.stringify({ version: 2, document, workspace: createMockWorkspace() })
  cleanups.push(() => {
    try {
      hydrateProject(snapshot)
    } finally {
      projectStore.setState(saved, true)
    }
  })
  cleanups.push(configureProjectBackend(createNativeBackend))
  hydrateProject(snapshot)
  cleanups.push(startProjectRuntime())
  const keyboard = createWindowKeyboard()
  // Fixed full-project viewport is a regression fixture, not a product window default.
  const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
  cleanups.push(() => root.unmount())
  let latest: { composition: ProjectComposition; shell: ProjectShellApi } | null = null
  const nativeEnvironment = { subscribeWindowActive: () => () => {} }
  function Project() {
    const shell = useProjectShell()
    const { composition, browserRef, focusRef } = useProjectComposition(shell)
    const { t } = useAppTranslation()
    useLayoutEffect(() => {
      if (composition) latest = { composition, shell }
    })
    return composition ? (
      <ProjectSections
        composition={composition}
        shell={shell}
        browserRef={browserRef}
        focusRef={focusRef}
        projectId="r3-native-project"
        labels={{
          resizeBrowser: t("project.resizeBrowser"),
          resizeClipEdit: t("project.resizeClipEdit"),
          browserPanel: t("panel.browser"),
          arrangementPanel: t("panel.arrangement"),
          footerPanel: t("panel.footer"),
          activeDescription: t("panel.activeDescription"),
        }}
      />
    ) : null
  }
  root.render(
    <AnimationFrameProvider source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}>
      <ThemeProvider>
        <AppNativeEnvironmentProvider value={nativeEnvironment}>
          <AppInteractionProvider>
            <ControlEnvironmentProvider value={{}}>
              <WindowKeyboardProvider value={keyboard}>
                <RouterProvider value={createRouter("/")}>
                  <Project />
                </RouterProvider>
              </WindowKeyboardProvider>
            </ControlEnvironmentProvider>
          </AppInteractionProvider>
        </AppNativeEnvironmentProvider>
      </ThemeProvider>
    </AnimationFrameProvider>
  )
  function owner() {
    if (!latest) throw new Error("Actual project composition did not mount")
    return latest
  }
  function frameGeometry() {
    function required(testId: string) {
      const node = root.renderer.findByTestId(testId)
      const box = node ? root.renderer.getElementBounds(node.id) : null
      if (!node || !box) throw new Error(`Missing ${testId} bounds`)
      return { ...box, id: node.id }
    }
    return {
      panel: required("arrangement-panel"),
      layout: required("timeline-layout"),
      grid: required("timeline-grid"),
    }
  }
  function closeControl() {
    const node = root.renderer
      .findByType("div")
      .find(item => item.customProps?.["aria-label"] === clipEditorLabels.en.close)
    if (!node) throw new Error("Missing actual Clip Edit close button")
    return node
  }
  function settle() {
    for (let round = 0; round < 8; round++) {
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
  }
  return {
    root,
    owner,
    frameGeometry,
    closeControl,
    settle,
    close() {
      const errors: unknown[] = []
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup()
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length) throw new AggregateError(errors, "R3 fixture cleanup failed")
    },
  }
}

test("Clip Edit toggles resize the arrangement panel and timeline box in the same draw", async () => {
  const fixture = mount()
  try {
    expect(await whenProjectBackendIdle()).toBe(true)
    fixture.settle()
    flushSync(() => projectActions.setEditingClip("r3-clip"))
    fixture.settle()
    if (!fixture.owner().shell.footerCollapsed) {
      fixture.root.renderer.nativeSimulateKeystrokes(fixture.closeControl().id, "enter")
      fixture.settle()
    }
    expect(fixture.owner().shell.footerCollapsed).toBe(true)
    flushSync(() => projectActions.setViewport({ scrollY: 100 }))
    fixture.settle()
    const scrollY = fixture.owner().composition.timeline.sceneStore.get().viewport.scrollY
    expect(scrollY).toBe(100)
    const initial = fixture.owner().composition
    const before = fixture.frameGeometry()
    const ids = {
      panel: before.panel.id,
      layout: before.layout.id,
      grid: before.grid.id,
    }
    const fixedChrome = before.panel.height - before.layout.height
    const assertFrame = () => {
      fixture.root.renderer.flush()
      const { panel, layout, grid } = fixture.frameGeometry()
      expect({ panel: panel.id, layout: layout.id, grid: grid.id }).toEqual(ids)
      expect(fixture.owner().composition).toBe(initial)
      expect(layout.height).toBeCloseTo(panel.height - fixedChrome, 4)
      fixture.root.renderer.dispatchNativeEvents()
      fixture.root.renderer.flush()
      const viewport = fixture.owner().composition.timeline.sceneStore.get().viewport
      expect(viewport.height).toBe(fixture.frameGeometry().layout.height)
      expect(viewport.scrollY).toBe(scrollY)
    }
    const button = fixture.root.renderer.findByTestId("status-clip")
    if (!button) throw new Error("Missing actual status-clip button")
    fixture.root.renderer.nativeSimulateKeystrokes(button.id, "enter")
    expect(fixture.owner().shell.footerCollapsed).toBe(false)
    assertFrame()
    fixture.root.renderer.dispatchNativeEvents()
    fixture.root.renderer.nativeSimulateKeystrokes(fixture.closeControl().id, "enter")
    expect(fixture.owner().shell.footerCollapsed).toBe(true)
    assertFrame()
  } finally {
    fixture.close()
  }
}, 30000)
