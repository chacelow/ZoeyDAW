import { afterEach, beforeAll, beforeEach, expect, jest, test } from "bun:test"
import { flushSync } from "@gpuix/react"
import { createTestRoot, type TestRoot } from "@gpuix/react/testing"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { dismissToast, toast } from "@/ui/controls"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { i18next } from "@/platform/i18n/core"
import {
  createMemoryProjectFiles,
  configureProjectBackend,
  projectActions,
  serializeProject,
  setProjectFiles,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { NATIVE_MULTI_SESSION_TEST_TIMEOUT } from "@/app/verification/native-session-budget"
import {
  configurePreferences,
  createPreferenceOwner,
  DEFAULT_THEME_MODE,
} from "@/platform/settings"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { AppShell } from "./AppShell"
import { initAppI18n } from "./i18n"
import { AppNativeEnvironmentProvider } from "./native-environment"
import { createRouter } from "./router/router"
import { createPreferenceStore } from "./settings/preference-store"
import { isThemeMode } from "./settings/theme-mode"
import { englishLabels, chineseLabels } from "./locales/sections/timeline"
import { createMemoryFileEnvironment } from "./project-file/memory.test-helper"

const roots: TestRoot[] = []
const cleanups: (() => void)[] = []
beforeAll(() => initAppI18n({ initialLanguage: "zh-CN" }))
beforeEach(async () => {
  await i18next.changeLanguage("en-US")
})
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  for (const cleanup of cleanups.splice(0)) cleanup()
  setProjectFiles(null)
})

function mount(
  initial = "/",
  storage = createMemoryProjectFiles(),
  files = createMemoryFileEnvironment()
) {
  cleanups.push(configureProjectBackend(createNativeBackend))
  const router = createRouter(initial)
  setProjectFiles(storage)
  const keyboard = createWindowKeyboard()
  const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
  roots.push(root)
  root.render(
    <AnimationFrameProvider source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}>
      <AppNativeEnvironmentProvider value={{ subscribeWindowActive: () => () => {} }}>
        <WindowKeyboardProvider value={keyboard}>
          <AppShell
            router={router}
            files={files}
            windowRenderer={null}
            systemAppearance="dark"
            appearance={{
              themeMode: createPreferenceStore(
                { get: () => null, set: () => {} },
                isThemeMode,
                DEFAULT_THEME_MODE
              ),
              themePreset: createPreferenceStore(
                { get: () => null, set: () => {} },
                isThemePresetId,
                DEFAULT_THEME_PRESET
              ),
            }}
            showErrorDetails
          />
        </WindowKeyboardProvider>
      </AppNativeEnvironmentProvider>
    </AnimationFrameProvider>
  )
  return { root, router, storage, files }
}

function act(root: TestRoot, action: () => void) {
  flushSync(action)
  root.renderer.flush()
}
function click(root: TestRoot, id: string) {
  const node = root.renderer.findByTestId(id)
  if (!node) throw new Error(`Missing ${id}`)
  root.renderer.nativeSimulateKeystrokes(node.id, "enter")
  root.renderer.flush()
}
async function settle(root: TestRoot) {
  await whenProjectBackendIdle()
  for (let i = 0; i < 5; i++) await Promise.resolve()
  act(root, () => {})
}
function type(root: TestRoot, id: string, value: string) {
  const node = root.renderer.findByTestId(id)
  if (!node) throw new Error(`Missing ${id}`)
  const keys = [...value].map(char =>
    char === char.toLowerCase() ? char : `shift-${char.toLowerCase()}`
  )
  root.renderer.nativeSimulateKeystrokes(node.id, ["cmd-a", "backspace", ...keys].join(" "))
  root.renderer.flush()
}
const SONG = "/projects/Song Project/Song.zdaw"

test(
  "Save As writes the project folder file, lists it in recents and reopens identically",
  async () => {
    const { root, router, storage, files } = mount()
    click(root, "home-create")
    await settle(root)
    act(root, () => projectActions.setBpm(151))
    await settle(root)
    act(root, () => projectActions.save())
    expect(root.renderer.findByTestId("save-as")).toBeDefined()
    type(root, "save-as-name", "Song")
    click(root, "save-as-confirm")
    await settle(root)
    const saved = storage.entries.get(SONG)
    if (saved === undefined) throw new Error("Project file was not written")
    expect(useProjectState.getState().session).toMatchObject({ filePath: SONG, dirty: false })
    expect(files.recentPaths()).toEqual([SONG])
    act(root, () => router.navigate("/"))
    act(root, () => router.navigate("/project/other"))
    await settle(root)
    act(root, () => router.navigate("/"))
    click(root, "recent-0")
    await settle(root)
    expect(serializeProject()).toBe(saved)
    root.unmount()
    roots.splice(roots.indexOf(root), 1)
    const restarted = mount(`/project/${encodeURIComponent(SONG)}`, storage, files)
    await settle(restarted.root)
    expect(serializeProject()).toBe(saved)
  },
  NATIVE_MULTI_SESSION_TEST_TIMEOUT
)

test("Save As refuses a name that already exists in the folder", async () => {
  const { root } = mount(
    "/",
    createMemoryProjectFiles(),
    createMemoryFileEnvironment(path => path === SONG)
  )
  click(root, "home-create")
  await settle(root)
  act(root, () => projectActions.requestSaveAs())
  type(root, "save-as-name", "Song")
  expect(root.renderer.getAllText()).toContain(
    "A project with this name already exists in this folder."
  )
  click(root, "save-as-confirm")
  expect(root.renderer.findByTestId("save-as")).toBeDefined()
  click(root, "save-as-cancel")
  expect(root.renderer.findByTestId("save-as")).toBeUndefined()
})

test("corrupt project file reports an error and save preserves the original bytes", async () => {
  const { root, router, storage } = mount()
  const damaged = '{"version":2,"document":"damaged"}'
  storage.entries.set(SONG, damaged)
  act(root, () => router.navigate({ kind: "project", projectId: SONG }))
  await settle(root)
  expect(useProjectState.getState().session.fileError).toBe("invalid")
  expect(root.renderer.getAllText()).toContain(englishLabels.fileErrors.invalid)
  await i18next.changeLanguage("zh-CN")
  await settle(root)
  expect(root.renderer.getAllText()).toContain(chineseLabels.fileErrors.invalid)
  projectActions.save()
  await settle(root)
  expect(storage.entries.get(SONG)).toBe(damaged)
})

test("dirty Back can cancel without releasing project content or undo", async () => {
  const { root, router } = mount()
  act(root, () => router.navigate("/project/dirty-back"))
  await settle(root)
  act(root, () => projectActions.setBpm(142))
  await settle(root)
  act(root, () => {
    router.back()
  })
  expect(router.getRoute()).toEqual({ kind: "project", projectId: "dirty-back" })
  click(root, "unsaved-cancel")
  await settle(root)
  expect(useProjectState.getState().document.transport.bpm).toBe(142)
  projectActions.undo()
  await settle(root)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

test(
  "dirty replace saves the opened file before opening another project",
  async () => {
    const { root, router, storage } = mount()
    storage.entries.set(
      SONG,
      JSON.stringify({
        version: 2,
        document: useProjectState.getState().document,
        workspace: useProjectState.getState().workspace,
      })
    )
    act(root, () => router.navigate({ kind: "project", projectId: SONG }))
    await settle(root)
    act(root, () => projectActions.setBpm(143))
    await settle(root)
    act(root, () => router.navigate("/project/replaced", { replace: true }))
    click(root, "unsaved-save")
    await settle(root)
    expect(router.getRoute()).toEqual({ kind: "project", projectId: "replaced" })
    expect(JSON.parse(storage.entries.get(SONG) ?? "{}").document.transport.bpm).toBe(143)
  },
  NATIVE_MULTI_SESSION_TEST_TIMEOUT
)

test(
  "leaving an untitled project with Save asks for a location; cancelling stays",
  async () => {
    const { root, router } = mount("/project/untitled")
    await settle(root)
    act(root, () => projectActions.setBpm(144))
    await settle(root)
    act(root, () => router.navigate("/project/next"))
    click(root, "unsaved-save")
    await settle(root)
    click(root, "save-as-cancel")
    await settle(root)
    expect(router.getRoute()).toEqual({ kind: "project", projectId: "untitled" })
    expect(useProjectState.getState().session.dirty).toBe(true)
    act(root, () => router.navigate("/project/next"))
    click(root, "unsaved-discard")
    await settle(root)
    expect(router.getRoute()).toEqual({ kind: "project", projectId: "next" })
  },
  NATIVE_MULTI_SESSION_TEST_TIMEOUT
)

test(
  "dirty navigation save failure stays in the original project",
  async () => {
    const { root, router, storage } = mount()
    storage.entries.set(
      SONG,
      JSON.stringify({
        version: 2,
        document: useProjectState.getState().document,
        workspace: useProjectState.getState().workspace,
      })
    )
    act(root, () => router.navigate({ kind: "project", projectId: SONG }))
    await settle(root)
    act(root, () => projectActions.setBpm(144))
    await settle(root)
    setProjectFiles({
      read: () => null,
      write: () => {
        throw new Error("storage unavailable")
      },
    })
    act(root, () => router.navigate("/project/next"))
    click(root, "unsaved-save")
    await settle(root)
    expect(router.getRoute()).toEqual({ kind: "project", projectId: SONG })
    expect(useProjectState.getState().session.dirty).toBe(true)
  },
  NATIVE_MULTI_SESSION_TEST_TIMEOUT
)

test("notification preferences update limits without clearing retained notices or restarting expiry", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-notification-preferences-"))
  const owner = createPreferenceOwner({ configDir: directory })
  owner.setPreference("notifications", { defaultDuration: 100, queueLimit: 5, visibleLimit: 3 })
  cleanups.push(configurePreferences(owner), () =>
    rmSync(directory, { recursive: true, force: true })
  )
  dismissToast()
  jest.useFakeTimers()
  try {
    const { root } = mount()
    const notice = (id: string) => root.renderer.findByTestId(`toaster-${id}`)
    act(root, () => {
      toast("first", { id: "first" })
      for (const id of ["second", "third", "fourth"]) toast(id, { id, duration: 0 })
    })
    expect(notice("first")).toBeUndefined()
    expect(notice("second")).toBeDefined()
    act(root, () => jest.advanceTimersByTime(20))
    act(root, () =>
      owner.setPreference("notifications", { defaultDuration: 200, queueLimit: 5, visibleLimit: 4 })
    )
    expect(notice("first")).toBeDefined()
    expect(notice("fourth")).toBeDefined()
    act(root, () => jest.advanceTimersByTime(80))
    expect(notice("first")).toBeUndefined()
    expect(notice("second")).toBeDefined()
    act(root, () => toast("new", { id: "new" }))
    act(root, () => jest.advanceTimersByTime(100))
    expect(notice("new")).toBeDefined()
    act(root, () => jest.advanceTimersByTime(100))
    expect(notice("new")).toBeUndefined()
    act(root, () =>
      owner.setPreference("notifications", {
        ...owner.getPreference("notifications"),
        queueLimit: 2,
        visibleLimit: 2,
      })
    )
    expect(notice("second")).toBeUndefined()
    expect(notice("third")).toBeDefined()
    expect(notice("fourth")).toBeDefined()
    act(root, () =>
      owner.setPreference("notifications", {
        ...owner.getPreference("notifications"),
        queueLimit: 4,
        visibleLimit: 4,
      })
    )
    expect(notice("second")).toBeUndefined()
    expect(notice("third")).toBeDefined()
  } finally {
    dismissToast()
    jest.useRealTimers()
  }
})
