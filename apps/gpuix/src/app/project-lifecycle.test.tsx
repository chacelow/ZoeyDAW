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
  createMemorySnapshotStorage,
  configureProjectBackend,
  projectActions,
  serializeProject,
  setSnapshotStorage,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
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

const roots: TestRoot[] = []
const cleanups: (() => void)[] = []
beforeAll(() => initAppI18n({ initialLanguage: "zh-CN" }))
beforeEach(async () => {
  await i18next.changeLanguage("en-US")
})
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  for (const cleanup of cleanups.splice(0)) cleanup()
  setSnapshotStorage(null)
})

function mount(initial = "/", storage = createMemorySnapshotStorage()) {
  cleanups.push(configureProjectBackend(createNativeBackend))
  const router = createRouter(initial)
  setSnapshotStorage(storage)
  const keyboard = createWindowKeyboard()
  const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
  roots.push(root)
  root.render(
    <AnimationFrameProvider source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}>
      <AppNativeEnvironmentProvider value={{ subscribeWindowActive: () => () => {} }}>
        <WindowKeyboardProvider value={keyboard}>
          <AppShell
            router={router}
            storage={storage}
            closeRenderer={null}
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
  return { root, router, storage }
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
const key = (id: string) => `zoeydaw:project:snapshot:v1:${encodeURIComponent(id)}`

test("saved project reopens from recent with identical authored content", async () => {
  const { root, router, storage } = mount()
  click(root, "home-create")
  const route = router.getRoute()
  if (route.kind !== "project") throw new Error("Create did not open a project")
  await settle(root)
  act(root, () => projectActions.setBpm(151))
  projectActions.saveSnapshot()
  await settle(root)
  const saved = storage.get(key(route.projectId))
  if (saved === null) throw new Error("Snapshot was not saved")
  act(root, () => router.navigate("/"))
  act(root, () => router.navigate("/project/other"))
  await settle(root)
  act(root, () => router.navigate("/"))
  click(root, `recent-${route.projectId}`)
  await settle(root)
  expect(serializeProject()).toBe(saved)
  expect(useProjectState.getState().document.transport.bpm).toBe(151)
  root.unmount()
  roots.splice(roots.indexOf(root), 1)
  const restarted = mount(`/project/${route.projectId}`, storage)
  await settle(restarted.root)
  expect(serializeProject()).toBe(saved)
})

test("corrupt saved project reports an error and save preserves the original bytes", async () => {
  const { root, router, storage } = mount()
  const damaged = '{"version":2,"document":"damaged"}'
  storage.set(key("corrupt"), damaged)
  act(root, () => router.navigate("/project/corrupt"))
  await settle(root)
  expect(useProjectState.getState().session.snapshotError).toBe("invalid")
  expect(root.renderer.getAllText()).toContain(englishLabels.snapshotErrors.invalid)
  const unchanged = serializeProject()
  await i18next.changeLanguage("zh-CN")
  await settle(root)
  expect(root.renderer.getAllText()).toContain(chineseLabels.snapshotErrors.invalid)
  expect(useProjectState.getState().session.snapshotError).toBe("invalid")
  expect(serializeProject()).toBe(unchanged)
  projectActions.saveSnapshot()
  await settle(root)
  expect(storage.get(key("corrupt"))).toBe(damaged)
})

test("missing saved project opens empty without a snapshot error", async () => {
  const { root } = mount("/project/no-snapshot")
  await settle(root)
  expect(useProjectState.getState().session.snapshotError).toBeNull()
  expect(useProjectState.getState().document.tracks.map(track => track.kind)).toEqual(["main"])
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

test("dirty replace saves before opening another project", async () => {
  const { root, router, storage } = mount("/project/save-before-replace")
  await settle(root)
  act(root, () => projectActions.setBpm(143))
  await settle(root)
  act(root, () => router.navigate("/project/replaced", { replace: true }))
  expect(router.getRoute()).toEqual({ kind: "project", projectId: "save-before-replace" })
  click(root, "unsaved-save")
  await settle(root)
  expect(router.getRoute()).toEqual({ kind: "project", projectId: "replaced" })
  const saved = storage.get(key("save-before-replace"))
  if (saved === null) throw new Error("Snapshot was not saved before leaving")
  expect(JSON.parse(saved).document.transport.bpm).toBe(143)
})

test("dirty navigation save failure stays in the original project; discard may leave", async () => {
  const { root, router } = mount("/project/save-failure")
  await settle(root)
  act(root, () => projectActions.setBpm(144))
  await settle(root)
  setSnapshotStorage({
    get: () => null,
    set: () => {
      throw new Error("storage unavailable")
    },
  })
  act(root, () => router.navigate("/project/next"))
  expect(router.getRoute()).toEqual({ kind: "project", projectId: "save-failure" })
  click(root, "unsaved-save")
  await settle(root)
  expect(router.getRoute()).toEqual({ kind: "project", projectId: "save-failure" })
  expect(useProjectState.getState().document.transport.bpm).toBe(144)
  expect(useProjectState.getState().session.dirty).toBe(true)
  act(root, () => router.navigate("/project/next"))
  click(root, "unsaved-discard")
  await settle(root)
  expect(router.getRoute()).toEqual({ kind: "project", projectId: "next" })
})

test("new project never reads snapshot storage", async () => {
  const { root } = mount()
  setSnapshotStorage({
    get: () => {
      throw new Error("new projects must not read storage")
    },
    set: () => {},
  })
  click(root, "home-create")
  await settle(root)
  expect(useProjectState.getState().session.snapshotError).toBeNull()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

test("discard then reopening the same unsaved id starts empty", async () => {
  const { root, router } = mount("/project/discard-same-id")
  await settle(root)
  act(root, () => projectActions.setBpm(177))
  await settle(root)
  act(root, () => router.navigate("/"))
  click(root, "unsaved-discard")
  await settle(root)
  act(root, () => router.navigate("/project/discard-same-id"))
  await settle(root)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.dirty).toBe(false)
})

test("successful Restore after a failed open permits saving the repaired project", async () => {
  const { root, router, storage } = mount("/project/restore-seed")
  await settle(root)
  const valid = serializeProject()
  storage.set(key("repair-and-restore"), "corrupt")
  act(root, () => router.navigate("/project/repair-and-restore"))
  await settle(root)
  expect(useProjectState.getState().session.snapshotError).toBe("invalid")
  storage.set(key("repair-and-restore"), valid)
  act(root, () => {
    expect(projectActions.restoreSnapshot()).toBe(true)
  })
  await settle(root)
  act(root, () => projectActions.setBpm(163))
  await settle(root)
  projectActions.saveSnapshot()
  await settle(root)
  const saved = storage.get(key("repair-and-restore"))
  if (saved === null) throw new Error("Repaired snapshot was not saved")
  expect(JSON.parse(saved).document.transport.bpm).toBe(163)
  expect(useProjectState.getState().session.dirty).toBe(false)
}, 30000)

test("notification preferences update limits without clearing retained notices or restarting expiry", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-notification-preferences-"))
  const owner = createPreferenceOwner({ configDir: directory })
  owner.setPreference("notifications", { defaultDuration: 100, queueLimit: 5, visibleLimit: 3 })
  cleanups.push(configurePreferences(owner), () =>
    rmSync(directory, { recursive: true, force: true })
  )
  dismissToast()
  // Home has no native backend clock; fake timers control only notification expiry here.
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
