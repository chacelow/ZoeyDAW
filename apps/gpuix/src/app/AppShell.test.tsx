import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { i18next } from "@zoeymind/i18n/core"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { createSettingStorage } from "@/platform/settings"
import {
  configureProjectBackend,
  createMemorySnapshotStorage,
  projectActions,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createMockProjectBackend } from "@/project/adapters/backend/mock"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { AppShell } from "./AppShell"
import { initAppI18n } from "./i18n"
import { emptyProjectSlots } from "./project/empty-slots"
import { createRouter } from "./router/router"
import { createPreferenceStore } from "./settings/preference-store"
import { DEFAULT_THEME_MODE, isThemeMode } from "./settings/theme-mode"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import type { TestRoot } from "@gpuix/react/testing"
import type { ReactNode } from "react"
import type { AppShellProps } from "./AppShell"
import type { Router } from "./router/router"
import type { ThemeMode } from "./settings/theme-mode"
import type { ThemePresetId } from "@/shared/theme/presets"
import type { CloseGuardRenderer } from "./window/close-guard-port"
import type { BackendRequest, ProjectBackend } from "@/project/model/backend"

beforeAll(async () => {
  initAppI18n({ initialLanguage: "zh-CN" })
  await i18next.changeLanguage("zh-CN")
})

const roots: TestRoot[] = []
const cleanups: (() => void)[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) root.unmount()
  for (const cleanup of cleanups.splice(0)) cleanup()
  await i18next.changeLanguage("zh-CN")
})

/** Counts the sessions a real runtime lease opens and disposes through the backend port. */
function countSessions() {
  const sessions = { opened: 0, disposed: 0 }
  cleanups.push(
    configureProjectBackend(
      () => {
        sessions.opened++
        const backend = createMockProjectBackend()
        return {
          ...backend,
          dispose: () => {
            sessions.disposed++
            backend.dispose()
          },
        }
      },
      {
        createProject: () => ({ document: createMockDocument(), workspace: createMockWorkspace() }),
      }
    )
  )
  return sessions
}

interface Harness {
  readonly root: TestRoot
  readonly router: Router
  readonly saved: { mode: ThemeMode | null; preset: ThemePresetId | null }
  readonly rerender: () => void
}

function mount(overrides: Partial<AppShellProps> = {}, wrap = (node: ReactNode) => node): Harness {
  const router = overrides.router ?? createRouter()
  const saved: { mode: ThemeMode | null; preset: ThemePresetId | null } = {
    mode: null,
    preset: null,
  }
  const appearance = overrides.appearance ?? {
    themeMode: createPreferenceStore<ThemeMode>(
      {
        get: () => saved.mode,
        set: mode => {
          saved.mode = mode
        },
      },
      isThemeMode,
      DEFAULT_THEME_MODE
    ),
    themePreset: createPreferenceStore<ThemePresetId>(
      {
        get: () => saved.preset,
        set: preset => {
          saved.preset = preset
        },
      },
      isThemePresetId,
      DEFAULT_THEME_PRESET
    ),
  }
  const keyboard = createWindowKeyboard()
  const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
  roots.push(root)
  const node = () =>
    wrap(
      <WindowKeyboardProvider value={keyboard}>
        <AppShell
          router={router}
          appearance={appearance}
          systemAppearance={null}
          storage={createMemorySnapshotStorage()}
          closeRenderer={null}
          renderProjectSlots={emptyProjectSlots}
          showErrorDetails
          {...overrides}
        />
      </WindowKeyboardProvider>
    )
  root.render(node())
  return { root, router, saved, rerender: () => root.render(node()) }
}

/** Applies an external store change (router, project actions) and paints it. */
function act(root: TestRoot, change: () => void) {
  flushSync(change)
  root.renderer.flush()
}

/** Panel geometry follows onLayout, which arrives after paint (same settle as ui/panels tests). */
async function layout(root: TestRoot) {
  for (let pass = 0; pass < 4; pass++) {
    await Bun.sleep(40)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}

/** Lets queued microtasks (dialog open after the native veto, async choices) commit. */
async function settle(root: TestRoot) {
  for (let tick = 0; tick < 5; tick++) await Promise.resolve()
  act(root, () => undefined)
}

function element(root: TestRoot, testId: string) {
  const found = root.renderer.findByTestId(testId)
  if (!found) throw new Error(`Missing ${testId}`)
  return found
}

function click(root: TestRoot, testId: string) {
  const bounds = root.renderer.getElementBounds(element(root, testId).id)
  if (!bounds) throw new Error(`No bounds for ${testId}`)
  root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  root.renderer.flush()
}

function text(root: TestRoot) {
  return root.renderer.getAllText().join("\n")
}

describe("routes", () => {
  test("home → new project → back home → unknown path → 404 → home", () => {
    countSessions()
    const { root, router } = mount()
    expect(root.renderer.findByTestId("home-page")).toBeDefined()
    click(root, "home-create")
    const route = router.getRoute()
    expect(route.kind).toBe("project")
    expect(root.renderer.findByTestId("project-layout")).toBeDefined()
    expect(text(root)).toContain(useProjectState.getState().document.name)
    act(root, () => router.back())
    expect(root.renderer.findByTestId("home-page")).toBeDefined()
    expect(
      root.renderer.findByTestId(`recent-${route.kind === "project" ? route.projectId : ""}`)
    ).toBeDefined()
    act(root, () => router.navigate("/library"))
    expect(root.renderer.findByTestId("not-found-page")).toBeDefined()
    expect(text(root)).toContain("404")
  })
})

describe("project runtime lease", () => {
  test("showing a project opens one session; leaving releases it; remounts do not leak", () => {
    const sessions = countSessions()
    const { root, router } = mount()
    expect(sessions).toEqual({ opened: 0, disposed: 0 })
    for (const id of ["a", "b", "a"]) {
      act(root, () => router.navigate({ kind: "project", projectId: id }))
    }
    expect(sessions.opened).toBe(3)
    expect(sessions.disposed).toBe(2)
    act(root, () => router.navigate("/"))
    expect(sessions).toEqual({ opened: 3, disposed: 3 })
    act(root, () => router.navigate("/project/c"))
    root.unmount()
    roots.splice(0)
    expect(sessions).toEqual({ opened: 4, disposed: 4 })
  })

  test("real native backend opens only for the project and is disposed on leaving (requires audio device)", async () => {
    const opened: { backend: ProjectBackend; request: BackendRequest | null }[] = []
    cleanups.push(
      configureProjectBackend(() => {
        const backend = createNativeBackend()
        const entry: { backend: ProjectBackend; request: BackendRequest | null } = {
          backend,
          request: null,
        }
        opened.push(entry)
        return {
          ...backend,
          apply(request) {
            entry.request = request
            return backend.apply(request)
          },
        }
      })
    )
    const { root, router } = mount()
    expect(opened).toEqual([])
    act(root, () => router.navigate("/project/native-device"))
    expect(await whenProjectBackendIdle()).toBe(true)
    expect(useProjectState.getState().session.backend.error).toBeNull()
    expect(opened.length).toBe(1)
    const entry = opened[0]
    if (!entry?.request) throw new Error("The native backend did not receive the project open")
    act(root, () => router.navigate("/"))
    expect(await entry.backend.apply(entry.request)).toMatchObject({
      kind: "rejected",
      code: "disposed",
    })
    expect(useProjectState.getState().session.playing).toBe(false)
  })
})

describe("route error fallback", () => {
  test("a throwing route shows the shell error screen with details, and home recovers", () => {
    countSessions()
    const router = createRouter("/project/broken")
    const { root } = mount({
      router,
      renderProjectSlots: () => {
        throw new Error("route-render-failure")
      },
    })
    expect(root.renderer.findByTestId("route-error")).toBeDefined()
    const screen = text(root)
    expect(screen).toContain("页面遇到问题")
    expect(screen).toContain("重新加载")
    expect(screen).toContain("返回首页")
    expect(screen).toContain("route-render-failure")
    expect(root.renderer.findByTestId("titlebar")).toBeDefined()
    click(root, "route-error-secondary")
    expect(router.getRoute()).toEqual({ kind: "home" })
    expect(root.renderer.findByTestId("route-error")).toBeUndefined()
    expect(root.renderer.findByTestId("home-page")).toBeDefined()
  })

  test("production hides the raw error message", () => {
    countSessions()
    const { root } = mount({
      router: createRouter("/project/broken"),
      showErrorDetails: false,
      renderProjectSlots: () => {
        throw new Error("route-render-failure")
      },
    })
    expect(text(root)).not.toContain("route-render-failure")
  })
})

describe("settings dialog", () => {
  test("theme mode switches live, persists, and the app survives closing the dialog", () => {
    const { root, saved } = mount()
    const background = () =>
      root.renderer.getElement(element(root, "app-frame").id)?.style.backgroundColor
    const dark = background()
    click(root, "titlebar-settings")
    expect(root.renderer.findByTestId("settings-dialog")).toBeDefined()
    click(root, "theme-mode-light")
    expect(saved.mode).toBe("light")
    root.renderer.nativeSimulateKeystrokes(element(root, "theme-mode-light").id, "escape")
    root.renderer.flush()
    expect(root.renderer.findByTestId("settings-dialog")).toBeUndefined()
    expect(background()).not.toBe(dark)
    click(root, "titlebar-settings")
    click(root, "theme-mode-dark")
    expect(saved.mode).toBe("dark")
    root.renderer.nativeSimulateKeystrokes(element(root, "theme-mode-dark").id, "escape")
    root.renderer.flush()
    expect(background()).toBe(dark)
    expect(root.renderer.findByTestId("home-page")).toBeDefined()
  })

  test("choosing a preset by click or arrow keys recolors the app and persists", () => {
    const { root, saved } = mount()
    const background = () =>
      root.renderer.getElement(element(root, "app-frame").id)?.style.backgroundColor
    const before = background()
    click(root, "titlebar-settings")
    click(root, "theme-preset-modern-minimal")
    expect(saved.preset).toBe("modern-minimal")
    root.renderer.nativeSimulateKeystrokes(element(root, "theme-preset-modern-minimal").id, "down")
    root.renderer.nativeSimulateKeystrokes(root.renderer.getFocusedElementId() ?? 0, "enter")
    root.renderer.flush()
    expect(saved.preset).not.toBe("modern-minimal")
    expect(saved.preset).not.toBeNull()
    root.renderer.nativeSimulateKeystrokes(root.renderer.getFocusedElementId() ?? 0, "escape")
    root.renderer.flush()
    expect(background()).not.toBe(before)
  })

  test("language switches live and persists through the native settings file", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "zoeydaw-app-language-"))
    cleanups.push(() => rmSync(configDir, { recursive: true, force: true }))
    const storage = createSettingStorage("language", { configDir })
    initAppI18n({ storage })
    const { root } = mount()
    click(root, "titlebar-settings")
    click(root, "settings-nav-language")
    click(root, "language-en-US")
    await settle(root)
    expect(text(root)).toContain("Settings")
    expect(storage.get()).toBe("en-US")
    click(root, "language-zh-CN")
    await settle(root)
    expect(text(root)).toContain("设置")
    expect(createSettingStorage("language", { configDir }).get()).toBe("zh-CN")
  })

  test("follow-system stays disabled while no native appearance exists", () => {
    const { root, saved } = mount()
    click(root, "titlebar-settings")
    click(root, "theme-mode-system")
    expect(saved.mode).toBeNull()
  })
})

describe("unsaved close guard", () => {
  function nativeClose() {
    let callback: (() => boolean) | null = null
    let closed = 0
    const renderer: CloseGuardRenderer = {
      setWindowShouldClose: next => {
        callback = next
      },
    }
    return {
      renderer,
      request: () => {
        if (!callback) throw new Error("close guard was not registered")
        return callback()
      },
      get closed() {
        return closed
      },
      withProgrammaticClose: () => {
        renderer.closeWindow = () => {
          closed++
        }
      },
    }
  }

  test("clean project closes; dirty project vetoes, asks, and cancel keeps it open", async () => {
    countSessions()
    const native = nativeClose()
    const { root } = mount({ closeRenderer: native.renderer, router: createRouter("/project/p") })
    expect(native.request()).toBe(true)
    projectActions.setBpm(131)
    expect(useProjectState.getState().session.dirty).toBe(true)
    expect(native.request()).toBe(false)
    await settle(root)
    expect(root.renderer.findByTestId("unsaved-close")).toBeDefined()
    click(root, "unsaved-cancel")
    await settle(root)
    expect(root.renderer.findByTestId("unsaved-close")).toBeUndefined()
    expect(native.request()).toBe(false)
  })

  test("discard without programmatic close allows exactly the next close request", async () => {
    countSessions()
    const native = nativeClose()
    const { root } = mount({ closeRenderer: native.renderer, router: createRouter("/project/q") })
    projectActions.setBpm(133)
    expect(native.request()).toBe(false)
    await settle(root)
    click(root, "unsaved-discard")
    await settle(root)
    expect(native.request()).toBe(true)
    expect(native.request()).toBe(false)
  })

  test("save closes programmatically once the snapshot is accepted", async () => {
    countSessions()
    const native = nativeClose()
    native.withProgrammaticClose()
    const { root } = mount({ closeRenderer: native.renderer, router: createRouter("/project/r") })
    projectActions.setBpm(137)
    expect(native.request()).toBe(false)
    await settle(root)
    click(root, "unsaved-save")
    for (let tick = 0; tick < 10 && native.closed === 0; tick++) await Promise.resolve()
    expect(useProjectState.getState().session.dirty).toBe(false)
    expect(native.closed).toBe(1)
  })
})

describe("keyboard", () => {
  test("Space on the project route toggles playback and leaves the settings button untouched", () => {
    countSessions()
    const { root, saved } = mount({ router: createRouter("/project/k") })
    const playing = () => useProjectState.getState().session.playing
    const before = playing()
    root.renderer.nativeSimulateKeystrokes(element(root, "titlebar-settings").id, "space")
    expect(playing()).toBe(!before)
    expect(root.renderer.findByTestId("settings-dialog")).toBeUndefined()
    root.renderer.nativeSimulateKeystrokes(element(root, "titlebar-settings").id, "enter")
    expect(root.renderer.findByTestId("settings-dialog")).toBeDefined()
    root.renderer.nativeSimulateKeystrokes(element(root, "theme-mode-light").id, "space")
    expect(saved.mode).toBe("light")
    expect(playing()).toBe(!before)
    click(root, "settings-nav-language")
    root.renderer.nativeSimulateKeystrokes(element(root, "language-en-US").id, "space")
    expect(playing()).toBe(!before)
    projectActions.stop()
  })
})

describe("project layout state", () => {
  function clipId() {
    const clip = useProjectState.getState().document.tracks.flatMap(track => track.clips)[0]
    if (!clip) throw new Error("fixture project has no clip")
    return clip.id
  }

  test("a resized Browser keeps its width when the footer switches to Clip Edit and back", async () => {
    countSessions()
    const { root } = mount({ router: createRouter("/project/layout") })
    const browserWidth = () =>
      root.renderer.getElementBounds(element(root, "browser-panel").id)?.width ?? 0
    await layout(root)
    const initial = browserWidth()
    root.renderer.nativeSimulateKeystrokes(element(root, "browser-divider").id, "shift-right")
    await layout(root)
    const resized = browserWidth()
    expect(resized).toBeGreaterThan(initial)
    act(root, () => projectActions.setEditingClip(clipId()))
    await layout(root)
    expect(root.renderer.findByTestId("clip-panel")).toBeDefined()
    expect(browserWidth()).toBe(resized)
    act(root, () => projectActions.setEditingClip(null))
    await layout(root)
    expect(browserWidth()).toBe(resized)
  })

  test("a Clip View request from the previous project does not open Clip Edit in the next", () => {
    countSessions()
    const { root, router } = mount({ router: createRouter("/project/first") })
    act(root, () => projectActions.setEditingClip(clipId()))
    expect(root.renderer.findByTestId("clip-panel")).toBeDefined()
    act(root, () => router.navigate("/project/second"))
    expect(root.renderer.findByTestId("project-layout")).toBeDefined()
    expect(root.renderer.findByTestId("clip-panel")).toBeUndefined()
  })
})

describe("close guard lifecycle", () => {
  test("after the shell unmounts the native predicate allows closing a dirty project", () => {
    countSessions()
    const native: { request?: () => boolean } = {}
    const { root } = mount({
      router: createRouter("/project/gone"),
      closeRenderer: {
        setWindowShouldClose: next => {
          native.request = next
        },
      },
    })
    projectActions.setBpm(141)
    root.unmount()
    roots.splice(0)
    expect(useProjectState.getState().session.dirty).toBe(true)
    expect(native.request?.()).toBe(true)
  })
})
