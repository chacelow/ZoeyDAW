import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { i18next } from "@/platform/i18n/core"
import * as engine from "@/platform/engine"
import {
  createWindowKeyboard,
  WindowKeyboardProvider,
  type WindowKeyboard,
} from "@/platform/keyboard"
import { createSettingStorage, DEFAULT_THEME_MODE } from "@/platform/settings"
import {
  configureProjectBackend,
  createMemoryProjectFiles,
  projectActions,
  useProjectState,
  setProjectFiles,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createMockProjectBackend } from "@/project/adapters/backend/mock"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { dismissToast, toastLoading } from "@/ui/controls/Toaster"
import { AppShell } from "./AppShell"
import { changeLocale, initAppI18n } from "./i18n"
import { AnimationFrameProvider } from "@/platform/frame"
import { AppNativeEnvironmentProvider } from "./native-environment"
import { createMemoryFileEnvironment } from "./project-file/memory.test-helper"
import { createRouter } from "./router/router"
import { createPreferenceStore } from "./settings/preference-store"
import { isThemeMode } from "./settings/theme-mode"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import type { TestRoot } from "@gpuix/react/testing"
import type { ReactNode } from "react"
import type { AppShellProps } from "./AppShell"
import type { Router } from "./router/router"
import type { ThemeMode } from "@/platform/settings"
import type { ThemePresetId } from "@/shared/theme/presets"
import type { WindowRenderer } from "@/platform/window"
import type { BackendRequest } from "@/project/model/backend"

const languageStorage = {
  value: "zh-CN",
  get() {
    return this.value
  },
  set(locale: string) {
    this.value = locale
  },
}
beforeAll(async () => {
  initAppI18n({ initialLanguage: "zh-CN", storage: languageStorage })
  await i18next.changeLanguage("zh-CN")
})
beforeEach(() => {
  setProjectFiles(createMemoryProjectFiles())
})

const roots: TestRoot[] = []
const cleanups: (() => void)[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) root.unmount()
  initAppI18n({ storage: languageStorage })
  for (const cleanup of cleanups.splice(0)) cleanup()
  setProjectFiles(null)
  await i18next.changeLanguage("zh-CN")
})

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
  readonly keyboard: WindowKeyboard
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
  const frames = { subscribe: () => () => {}, subscribeResume: () => () => {} }
  const native = { subscribeWindowActive: () => () => {} }
  const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
  roots.push(root)
  const node = () =>
    wrap(
      <AnimationFrameProvider source={frames}>
        <AppNativeEnvironmentProvider value={native}>
          <WindowKeyboardProvider value={keyboard}>
            <AppShell
              router={router}
              appearance={appearance}
              systemAppearance={null}
              files={createMemoryFileEnvironment()}
              windowRenderer={null}
              showErrorDetails
              {...overrides}
            />
          </WindowKeyboardProvider>
        </AppNativeEnvironmentProvider>
      </AnimationFrameProvider>
    )
  root.render(node())
  return { root, router, saved, keyboard, rerender: () => root.render(node()) }
}

function act(root: TestRoot, change: () => void) {
  flushSync(change)
  root.renderer.flush()
}

async function layout(root: TestRoot) {
  for (let pass = 0; pass < 4; pass++) {
    root.renderer.flush()
    flushSync(() => root.renderer.dispatchNativeEvents())
    await Promise.resolve()
  }
}

async function settle(root: TestRoot) {
  for (let tick = 0; tick < 5; tick++) await Promise.resolve()
  act(root, () => undefined)
}

function element(root: TestRoot, testId: string) {
  const found = root.renderer.findByTestId(testId)
  if (!found) throw new Error(`Missing ${testId}`)
  return found
}

function button(root: TestRoot, label: string) {
  const node = root.renderer
    .findByType("div")
    .find(item => item.customProps?.["aria-label"] === label && item.customProps?.role === "button")
  if (!node) throw new Error(`Missing button ${label}`)
  return node
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
    expect(root.renderer.findByTestId("recent-0")).toBeUndefined()
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

  test("Transport onBack releases the real native session; reopening creates a fresh lease", async () => {
    const handles: number[] = []
    const originalOpen = engine.openSession
    const originalDispose = engine.dispose
    const opening = spyOn(engine, "openSession").mockImplementation(() => {
      const handle = originalOpen()
      handles.push(handle)
      return handle
    })
    cleanups.push(() => {
      opening.mockRestore()
      for (const handle of handles) originalDispose(handle)
    })
    const requests: BackendRequest[] = []
    cleanups.push(
      configureProjectBackend(() => {
        const backend = createNativeBackend()
        return {
          ...backend,
          apply(request) {
            requests.push(request)
            return backend.apply(request)
          },
        }
      })
    )
    const { root, router } = mount()
    expect(handles).toEqual([])
    for (const projectId of ["native-device-first", "native-device-second"]) {
      act(root, () => router.navigate(`/project/${projectId}`))
      expect(await whenProjectBackendIdle()).toBe(true)
      expect(useProjectState.getState().session.backend.error).toBeNull()
      const handle = handles.at(-1)
      const request = requests.at(-1)
      if (handle === undefined || !request) throw new Error("No real native session was opened")
      root.renderer.nativeSimulateKeystrokes(button(root, "返回").id, "enter")
      expect(router.getRoute().kind).toBe("home")
      const result: unknown = JSON.parse(engine.apply(handle, JSON.stringify(request)))
      expect(result).toMatchObject({ kind: "rejected", code: "disposed" })
    }
    expect(handles.length).toBe(2)
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

  test("system appearance updates the same project without reopening its backend", () => {
    const sessions = countSessions()
    const props: { router: Router; systemAppearance: AppShellProps["systemAppearance"] } = {
      router: createRouter("/project/system-appearance"),
      systemAppearance: "dark",
    }
    const { root, rerender } = mount(props)
    const background = () =>
      root.renderer.getElement(element(root, "app-frame").id)?.style.backgroundColor
    const dark = background()
    props.systemAppearance = "light"
    rerender()
    expect(background()).not.toBe(dark)
    expect(sessions).toEqual({ opened: 1, disposed: 0 })
    click(root, "titlebar-settings")
    click(root, "theme-mode-dark")
    props.systemAppearance = "dark"
    rerender()
    expect(background()).toBe(dark)
    expect(sessions).toEqual({ opened: 1, disposed: 0 })
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

  test("settings navigation and toast controls expose the selected locale in AX", async () => {
    const { root } = mount()
    click(root, "titlebar-settings")
    act(root, () => toastLoading("工程载入", "locale-probe"))
    const labels = () =>
      Object.values(root.renderer.getA11yTree().nodes ?? {}).map(node => node.aria?.label)
    expect(labels()).toContain("设置分类")
    expect(labels()).toContain("通知")
    expect(labels()).toContain("关闭通知 工程载入")
    expect(labels()).toContain("加载中")
    await changeLocale("en-US")
    await settle(root)
    expect(labels()).toContain("Settings sections")
    expect(labels()).toContain("Notifications")
    expect(labels()).toContain("Dismiss 工程载入")
    expect(labels()).toContain("Loading")
    act(root, () => dismissToast())
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
    const renderer: WindowRenderer = {
      setWindowShouldClose: next => {
        callback = next
      },
      closeWindow: () => {
        closed++
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
    }
  }

  test("clean project closes; dirty project vetoes, asks, and cancel keeps it open", async () => {
    countSessions()
    const native = nativeClose()
    const { root } = mount({ windowRenderer: native.renderer, router: createRouter("/project/p") })
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

  test("discard closes the window directly after the choice", async () => {
    countSessions()
    const native = nativeClose()
    const { root } = mount({ windowRenderer: native.renderer, router: createRouter("/project/q") })
    projectActions.setBpm(133)
    expect(native.request()).toBe(false)
    await settle(root)
    click(root, "unsaved-discard")
    await settle(root)
    expect(native.closed).toBe(1)
  })

  test("save closes programmatically once the snapshot is accepted", async () => {
    countSessions()
    const native = nativeClose()
    const { root } = mount({ windowRenderer: native.renderer, router: createRouter("/project/r") })
    projectActions.setBpm(137)
    expect(native.request()).toBe(false)
    await settle(root)
    click(root, "unsaved-save")
    await settle(root)
    click(root, "save-as-confirm")
    await whenProjectBackendIdle()
    await settle(root)
    const name = useProjectState.getState().document.name
    expect(useProjectState.getState().session).toMatchObject({
      dirty: false,
      filePath: `/projects/${name} Project/${name}.zdaw`,
    })
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

  test("global Cmd+F focuses Browser only when unconsumed, nonmodal and expanded", async () => {
    countSessions()
    const { root, keyboard } = mount({ router: createRouter("/project/search") })
    await layout(root)
    const timeline = element(root, "timeline-viewport")
    const search = element(root, "browser-search")
    root.renderer.nativeSimulateKeystrokes(timeline.id, "cmd-f")
    expect(root.renderer.getFocusedElementId()).toBe(search.id)
    root.renderer.simulateKeystrokes("D r i f t")
    root.renderer.nativeSimulateKeystrokes(timeline.id, "cmd-f")
    root.renderer.simulateKeystrokes("a")
    expect(root.renderer.getElement(search.id)?.customProps?.value).toBe("a")
    root.renderer.nativeSimulateKeystrokes(element(root, "titlebar-settings").id, "enter")
    const dialogFocus = root.renderer.getFocusedElementId()
    root.renderer.simulateKeystrokes("cmd-f")
    expect(root.renderer.getFocusedElementId()).toBe(dialogFocus)
    keyboard.rootHandlers.onKeyDown({
      key: "f",
      modifiers: { cmd: true, ctrl: false, alt: false, shift: false },
      defaultPrevented: false,
      preventDefault() {},
      stopPropagation() {},
    })
    expect(root.renderer.getFocusedElementId()).toBe(dialogFocus)
    root.renderer.simulateKeystrokes("escape")
    expect(root.renderer.findByTestId("settings-dialog")).toBeUndefined()
    root.renderer.nativeSimulateKeystrokes(button(root, "切换浏览器").id, "enter")
    await layout(root)
    root.renderer.nativeSimulateKeystrokes(timeline.id, "cmd-f")
    expect(root.renderer.getFocusedElementId()).not.toBe(search.id)
    root.renderer.nativeSimulateKeystrokes(button(root, "切换浏览器").id, "enter")
    await layout(root)
    root.renderer.focusElement(timeline.id)
    keyboard.rootHandlers.onKeyDown({
      key: "f",
      modifiers: { cmd: true, ctrl: false, alt: false, shift: false },
      defaultPrevented: true,
      preventDefault() {
        throw new Error("Already consumed")
      },
      stopPropagation() {},
    })
    expect(root.renderer.getFocusedElementId()).toBe(timeline.id)
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
    expect(root.renderer.findByTestId("clip-editor")).toBeDefined()
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
      windowRenderer: {
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
