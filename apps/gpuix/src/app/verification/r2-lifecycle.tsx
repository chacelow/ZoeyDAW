/* eslint-disable no-await-in-loop -- Evidence serializes layout and locale changes on one native root. */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import { i18next } from "@/platform/i18n/core"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import {
  canSaveSnapshot,
  createMemorySnapshotStorage,
  projectActions,
  serializeProject,
  setSnapshotStorage,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { AppShell } from "../AppShell"
import { initAppI18n } from "../i18n"
import { AppNativeEnvironmentProvider } from "../native-environment"
import { createRouter } from "../router/router"
import { createPreferenceStore } from "../settings/preference-store"
import { isThemeMode } from "../settings/theme-mode"
import type { ThemeMode } from "@/platform/settings"

const output = process.argv[2]
if (!output) throw new Error("Pass an external evidence directory")
mkdirSync(output, { recursive: true })
initAppI18n({ initialLanguage: "en-US", storage: { get: () => "en-US", set: () => {} } })
const storage = createMemorySnapshotStorage()
setSnapshotStorage(storage)
const appearance = {
  themeMode: createPreferenceStore<ThemeMode>(
    { get: () => "dark", set: () => {} },
    isThemeMode,
    "dark"
  ),
  themePreset: createPreferenceStore(
    { get: () => DEFAULT_THEME_PRESET, set: () => {} },
    isThemePresetId,
    DEFAULT_THEME_PRESET
  ),
}
const keyboard = createWindowKeyboard()
const router = createRouter("/")
const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
function activate(id: string) {
  const element = root.renderer.findByTestId(id)
  if (!element) throw new Error(`Missing ${id}`)
  root.renderer.nativeSimulateKeystrokes(element.id, "enter")
}
async function settle() {
  if (!(await whenProjectBackendIdle()))
    throw new Error("Native backend did not accept the project")
  for (let frame = 0; frame < 6; frame++) {
    await Bun.sleep(20)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}
function capture(name: string) {
  root.renderer.captureScreenshot(path.join(output, `${name}.png`))
  writeFileSync(
    path.join(output, `${name}.ax.json`),
    JSON.stringify(root.renderer.getA11yTree(), null, 2)
  )
}
try {
  root.render(
    <AnimationFrameProvider source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}>
      <AppNativeEnvironmentProvider value={{ subscribeWindowActive: () => () => {} }}>
        <WindowKeyboardProvider value={keyboard}>
          <AppShell
            router={router}
            appearance={appearance}
            systemAppearance="dark"
            storage={storage}
            closeRenderer={null}
            showErrorDetails
          />
        </WindowKeyboardProvider>
      </AppNativeEnvironmentProvider>
    </AnimationFrameProvider>
  )
  activate("home-create")
  await settle()
  const route = router.getRoute()
  if (route.kind !== "project") throw new Error("Create route missing")
  flushSync(() => projectActions.setBpm(151))
  await settle()
  flushSync(() => router.navigate("/"))
  for (const [locale, mode] of [
    ["en-US", "dark"],
    ["zh-CN", "light"],
  ] as const) {
    await i18next.changeLanguage(locale)
    appearance.themeMode.set(mode)
    await settle()
    if (!root.renderer.findByTestId("unsaved-save"))
      throw new Error("Dirty navigation bypassed decision")
    capture(`leave-${locale}-${mode}`)
  }
  activate("unsaved-save")
  await settle()
  if (router.getRoute().kind !== "home") throw new Error("Successful save did not leave")
  const key = `zoeydaw:project:snapshot:v1:${encodeURIComponent(route.projectId)}`
  const saved = storage.get(key)
  if (!saved) throw new Error("Save produced no snapshot")
  activate(`recent-${route.projectId}`)
  await settle()
  if (serializeProject() !== saved) throw new Error("Recent did not hydrate saved content")
  capture("restored-zh-CN-light")
  const corruptKey = "zoeydaw:project:snapshot:v1:corrupt-smoke"
  const corrupt = '{"version":2,"document":"damaged"}'
  storage.set(corruptKey, corrupt)
  flushSync(() => router.navigate("/project/corrupt-smoke", { replace: true }))
  await settle()
  if (canSaveSnapshot() || !useProjectState.getState().session.snapshotError)
    throw new Error("Corrupt open was not fenced")
  projectActions.saveSnapshot()
  await settle()
  if (storage.get(corruptKey) !== corrupt) throw new Error("Save overwrote the corrupt bytes")
  capture("corrupt-zh-CN-light")
  console.log(
    JSON.stringify({
      output,
      restoredBpm: 151,
      corruptBytesPreserved: true,
      nativeBackend: useProjectState.getState().session.backend.phase,
    })
  )
} finally {
  root.unmount()
  setSnapshotStorage(null)
}
