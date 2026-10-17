import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import type { AnimationFrameCallback } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { createSettingStorage } from "@/platform/settings"
import { createThemePresetSetting } from "@/platform/settings/theme-preset"
import {
  createProjectFileStorage,
  createProjectLocations,
  createRecentProjectStorage,
} from "@/platform/storage"
import { createLogPlatform } from "@/platform/log"
import {
  projectActions,
  setProjectFiles,
  useProjectState,
  whenProjectBackendIdle,
  readProjectTelemetry,
} from "@/project/adapters"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { AppShell } from "@/app/AppShell"
import { initAppI18n } from "@/app/i18n"
import { AppNativeEnvironmentProvider } from "@/app/native-environment"
import { createRouter } from "@/app/router/router"
import { createPreferenceStore } from "@/app/settings/preference-store"
import { isThemeMode } from "@/app/settings/theme-mode"
import { userDirectories } from "@zoeydaw/native"
import type { BackendTelemetry } from "@/project/model/backend"

const directory = process.argv[2]
if (!directory) throw new Error("Pass an evidence directory")
mkdirSync(directory, { recursive: true })
const options = { configDir: directory }
initAppI18n({ initialLanguage: "en-US", storage: createSettingStorage("language", options) })
setProjectFiles(createProjectFileStorage())
const files = {
  recents: createRecentProjectStorage({ configDir: directory }),
  locations: createProjectLocations(),
}
const appearance = {
  themeMode: createPreferenceStore(createSettingStorage("themeMode", options), isThemeMode, "dark"),
  themePreset: createPreferenceStore(
    createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET, options),
    isThemePresetId,
    DEFAULT_THEME_PRESET
  ),
}
const keyboard = createWindowKeyboard()
const router = createRouter("/")
const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
const driver: {
  frame: AnimationFrameCallback | null
  resume: AnimationFrameCallback | null
  active: boolean
} = {
  frame: null,
  resume: null,
  active: false,
}
const frames = createAnimationFrameSource({
  setAnimationFrameCallback(callback) {
    driver.frame = callback
  },
  setResumeFrameCallback(callback) {
    driver.resume = callback
  },
  setAnimationFrameActive(active) {
    driver.active = active
  },
})
async function present() {
  await Bun.sleep(30)
  if (driver.active) driver.frame?.(performance.now())
  await Promise.resolve()
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
}
async function telemetryWhere(accept: (frame: BackendTelemetry) => boolean) {
  const deadline = performance.now() + 20_000
  let frame = readProjectTelemetry()
  while (!(frame && accept(frame))) {
    if (performance.now() > deadline)
      throw new Error(`Native telemetry did not arrive: ${JSON.stringify(frame)}`)
    // eslint-disable-next-line no-await-in-loop -- Polls one engine until its telemetry matches.
    await Bun.sleep(20)
    frame = readProjectTelemetry()
  }
  return frame
}
try {
  root.render(
    <AnimationFrameProvider source={frames}>
      <AppNativeEnvironmentProvider value={{ subscribeWindowActive: () => () => {} }}>
        <WindowKeyboardProvider value={keyboard}>
          <AppShell
            router={router}
            appearance={appearance}
            systemAppearance="dark"
            files={files}
            windowRenderer={null}
            showErrorDetails
          />
        </WindowKeyboardProvider>
      </AppNativeEnvironmentProvider>
    </AnimationFrameProvider>
  )
  await present()
  root.renderer.captureScreenshot(path.join(directory, "home.png"))
  const create = root.renderer.findByTestId("home-create")
  if (!create) throw new Error("Home create command is missing")
  root.renderer.nativeSimulateKeystrokes(create.id, "enter")
  if (router.getRoute().kind !== "project" || !(await whenProjectBackendIdle())) {
    throw new Error("New project did not acquire the real native backend")
  }
  await present()
  if (!root.renderer.findByTestId("timeline-horizontal-scroll"))
    throw new Error("Arrangement did not mount")
  flushSync(projectActions.togglePlay)
  if (!(await whenProjectBackendIdle())) throw new Error("Native engine rejected play")
  const first = await telemetryWhere(frame => frame.playing)
  const second = await telemetryWhere(frame => frame.playing && frame.clock.bar > first.clock.bar)
  await present()
  root.renderer.captureScreenshot(path.join(directory, "arrangement-playing.png"))
  flushSync(projectActions.stop)
  if (!(await whenProjectBackendIdle())) throw new Error("Native engine rejected stop")
  const stopped = await telemetryWhere(frame => !frame.playing)
  createSettingStorage("language", options).set("en-US")
  createLogPlatform({ configDir: directory, defaultDir: path.join(directory, "logs") }).initialize()
  const result = { cwd: process.cwd(), first, second, stopped, userDirectories: userDirectories() }
  writeFileSync(path.join(directory, "smoke.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  root.unmount()
  setProjectFiles(null)
}
if (useProjectState.getState().session.backend.phase !== "idle")
  throw new Error("Native session leaked")
