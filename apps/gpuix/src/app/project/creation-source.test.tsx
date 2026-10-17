import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import { i18next } from "@/platform/i18n/core"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { configurePreferences, createPreferenceOwner } from "@/platform/settings"
import {
  configureProjectBackend,
  createMemoryProjectFiles,
  projectActions,
  serializeProject,
  setProjectFiles,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createVerificationProjectBackend } from "@/project/adapters/verification/environment-backend"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { initAppI18n } from "../i18n"
import { AppInteractionProvider } from "../interaction"
import { getCreationNames } from "../i18n/creation-names"
import { AppNativeEnvironmentProvider } from "../native-environment"
import { createRouter, RouterProvider } from "../router/router"
import { ProjectPage } from "./ProjectPage"
import type { TrackKind } from "@/project/model/types"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import type { LayoutTokens } from "@/shared/theme/layout-tokens"

const inactiveFrames = { subscribe: () => () => {}, subscribeResume: () => () => {} }
const nativeEnvironment = { subscribeWindowActive: () => () => {} }

test("new projects sample controlled appearance without renaming or restarting an existing project", async () => {
  initAppI18n({ initialLanguage: "en-US" })
  await i18next.changeLanguage("en-US")
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-creation-source-"))
  const restorePreferences = configurePreferences(createPreferenceOwner({ configDir: directory }))
  const restoreBackend = configureProjectBackend(createVerificationProjectBackend)
  setProjectFiles(createMemoryProjectFiles())
  const keyboard = createWindowKeyboard()
  const firstId = `creation-source-${crypto.randomUUID()}`
  const router = createRouter(`/project/${firstId}`)
  const root = createTestRoot({ width: 1280, height: 900, ...keyboard.rootHandlers })
  const colors: Record<TrackKind, string> = {
    audio: "oklch(0.7 0.12 20)",
    midi: "oklch(0.7 0.12 80)",
    group: "oklch(0.7 0.12 140)",
    return: "oklch(0.7 0.12 200)",
    main: "oklch(0.7 0.12 260)",
  }
  const layout: LayoutTokens = {
    ...DEFAULT_LAYOUT_TOKENS,
    track: { ...DEFAULT_LAYOUT_TOKENS.track, mainHeight: 146, defaultHeight: 82 },
  }
  const design: DesignTokens = { ...DEFAULT_DESIGN_TOKENS, trackCreationColors: colors }
  function render(projectId: string, nextLayout = layout, nextDesign = design) {
    root.render(
      <AnimationFrameProvider source={inactiveFrames}>
        <AppNativeEnvironmentProvider value={nativeEnvironment}>
          <WindowKeyboardProvider value={keyboard}>
            <AppInteractionProvider>
              <RouterProvider value={router}>
                <ThemeProvider layout={nextLayout} design={nextDesign}>
                  <ProjectPage projectId={projectId} openMode="new" />
                </ThemeProvider>
              </RouterProvider>
            </AppInteractionProvider>
          </WindowKeyboardProvider>
        </AppNativeEnvironmentProvider>
      </AnimationFrameProvider>
    )
  }
  async function settle() {
    expect(await whenProjectBackendIdle()).toBe(true)
    for (let pass = 0; pass < 3; pass++) {
      await Promise.resolve()
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
  }
  function mainRowHeight() {
    const row = root.renderer.findByTestId("track-row-main")
    if (!row) throw new Error("Main row is not mounted")
    return root.renderer.getElementBounds(row.id)?.height
  }
  try {
    render(firstId)
    await settle()
    const main = useProjectState.getState().document.tracks.find(track => track.kind === "main")
    expect(main?.heightPx).toBe(layout.track.mainHeight)
    expect(main?.color).toBe(colors.main)
    expect(mainRowHeight()).toBe(layout.track.mainHeight)
    for (const kind of ["audio", "midi", "group", "return"] as const) {
      flushSync(() => projectActions.addTrack(kind, layout.track.defaultHeight))
      await settle()
      const created = useProjectState.getState().document.tracks.find(track => track.kind === kind)
      expect(created?.color).toBe(colors[kind])
      expect(created?.heightPx).toBe(layout.track.defaultHeight)
    }
    const before = serializeProject()
    const session = useProjectState.getState().session.backend.sessionId
    const nextLayout = { ...layout, track: { ...layout.track, mainHeight: 188, defaultHeight: 94 } }
    const nextColors = { ...colors, audio: "oklch(0.6 0.14 40)", main: "oklch(0.6 0.14 300)" }
    const nextDesign = { ...design, trackCreationColors: nextColors }
    await i18next.changeLanguage("zh-CN")
    render(firstId, nextLayout, nextDesign)
    await settle()
    expect(serializeProject()).toBe(before)
    expect(useProjectState.getState().session.backend.sessionId).toBe(session)
    expect(mainRowHeight()).toBe(layout.track.mainHeight)
    flushSync(() => projectActions.addTrack("audio", nextLayout.track.defaultHeight))
    await settle()
    const newest = useProjectState
      .getState()
      .document.tracks.filter(track => track.kind === "audio")
      .at(-1)
    expect(newest?.color).toBe(nextColors.audio)
    expect(newest?.heightPx).toBe(nextLayout.track.defaultHeight)
    const expectedName = getCreationNames("zh-CN").track("audio", 2)
    expect(newest?.name).toBe(expectedName)
    flushSync(() => projectActions.setViewport({ scrollY: useProjectState.getState().document.tracks.reduce((height, track) => height + track.heightPx, 0) }))
    await settle()
    expect(root.renderer.getAllText()).toContain(expectedName)
    render(`creation-next-${crypto.randomUUID()}`, nextLayout, nextDesign)
    await settle()
    expect(mainRowHeight()).toBe(nextLayout.track.mainHeight)
    expect(
      useProjectState.getState().document.tracks.find(track => track.kind === "main")?.color
    ).toBe(nextColors.main)
  } finally {
    root.unmount()
    restoreBackend()
    restorePreferences()
    setProjectFiles(null)
    await i18next.changeLanguage("en-US")
    rmSync(directory, { recursive: true, force: true })
  }
}, 15000)
