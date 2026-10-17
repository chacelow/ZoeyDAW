/* eslint-disable no-await-in-loop -- Bounded waits observe actual WASAPI telemetry, never simulated time. */
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { windowDiagnostics } from "@zoeydaw/native"
import { AppShell } from "@/app/AppShell"
import { initAppI18n } from "@/app/i18n"
import { AppNativeEnvironmentProvider } from "@/app/native-environment"
import { createRouter } from "@/app/router/router"
import { createPreferenceStore } from "@/app/settings/preference-store"
import { isThemeMode } from "@/app/settings/theme-mode"
import { createThemeLibraryStore } from "@/app/theme-editor"
import { AnimationFrameProvider } from "@/platform/frame"
import type { AnimationFrameCallback } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { createSettingStorage } from "@/platform/settings"
import { createThemePresetSetting } from "@/platform/settings/theme-preset"
import {
  createProjectFileStorage,
  createProjectLocations,
  createRecentProjectStorage,
} from "@/platform/storage"
import { getReducedMotion } from "@/platform/window"
import { readVerificationAudioCapability } from "@/platform/verification/audio-capability"
import {
  projectActions,
  readProjectTelemetry,
  setProjectFiles,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import "@/app/verification/native-fixture"

const requested = process.env.B2_EVIDENCE_DIR
if (!requested)
  throw new Error("B2_EVIDENCE_DIR must point to an external smoke evidence directory")
const output = path.resolve(requested)
mkdirSync(output, { recursive: true })
const audioCapability = readVerificationAudioCapability(process.env)
if (audioCapability.kind === "unavailable") {
  const result = {
    platform: process.platform,
    status: "unverified",
    reason: audioCapability.reason,
    sessionOpened: false,
  }
  writeFileSync(path.join(output, "smoke.json"), JSON.stringify(result, null, 2))
  console.log(`[UNVERIFIED] Real backend offscreen smoke: ${audioCapability.reason}`)
  console.log(JSON.stringify(result))
  process.exit(0)
}

const options = { configDir: output }
initAppI18n({ initialLanguage: "en-US", storage: createSettingStorage("language", options) })
setProjectFiles(createProjectFileStorage())
const files = {
  recents: createRecentProjectStorage({ configDir: output }),
  locations: createProjectLocations(),
}
const themePreset = createPreferenceStore(
  createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET, options),
  isThemePresetId,
  DEFAULT_THEME_PRESET
)
const appearance = {
  themeMode: createPreferenceStore(createSettingStorage("themeMode", options), isThemeMode, "dark"),
  themePreset,
  themeLibrary: createThemeLibraryStore(
    createSettingStorage("themeLibrary", options),
    themePreset.get()
  ),
}
const frames = new Set<AnimationFrameCallback>()
const resumeFrames = new Set<AnimationFrameCallback>()
const source = {
  subscribe(callback: AnimationFrameCallback) {
    frames.add(callback)
    return () => {
      frames.delete(callback)
    }
  },
  subscribeResume(callback: AnimationFrameCallback) {
    resumeFrames.add(callback)
    return () => {
      resumeFrames.delete(callback)
    }
  },
}
const keyboard = createWindowKeyboard()
const router = createRouter("/")
const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })

async function present(name: string) {
  await Bun.sleep(30)
  for (const callback of frames) callback(performance.now())
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
  root.renderer.captureScreenshot(path.join(output, `${name}.png`))
  writeFileSync(
    path.join(output, `${name}.ax.json`),
    JSON.stringify(root.renderer.getA11yTree(), null, 2)
  )
}

const result: {
  platform: string
  status: "verified" | "failed"
  reducedMotion?: boolean
  playingBar?: number
  released?: boolean
  error?: string
} = {
  platform: process.platform,
  status: "failed",
}
try {
  if (process.platform === "win32") {
    assert.throws(
      () => windowDiagnostics("Windows unsupported diagnostic probe"),
      /only supported on macOS/
    )
  }
  result.reducedMotion = getReducedMotion()
  root.render(
    <AnimationFrameProvider source={source}>
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
  await present("home")
  const create = root.renderer.findByTestId("home-create")
  assert.ok(create, "Home create command is missing")
  root.renderer.nativeSimulateKeystrokes(create.id, "enter")
  assert.equal(router.getRoute().kind, "project", "Home did not enter the project route")
  await present("arrangement-opening")
  assert.equal(
    await whenProjectBackendIdle(),
    true,
    "The real WASAPI backend did not become ready; no audio fallback is permitted"
  )
  assert.ok(root.renderer.findByTestId("project-layout"), "Arrangement layout is missing")
  flushSync(() => {
    projectActions.seekBar(2)
    projectActions.togglePlay()
  })
  assert.equal(await whenProjectBackendIdle(), true, "The real backend rejected playback")
  const clockDeadline = performance.now() + 20_000
  let telemetry = readProjectTelemetry()
  while ((!telemetry?.playing || telemetry.clock.bar <= 2) && performance.now() < clockDeadline) {
    await Bun.sleep(20)
    telemetry = readProjectTelemetry()
  }
  assert.ok(telemetry?.playing, "The real backend did not report playing")
  assert.ok(telemetry.clock.bar > 2, "The real audio clock did not advance")
  result.playingBar = telemetry.clock.bar
  for (const callback of resumeFrames) callback(performance.now())
  await present("arrangement-playing")
  flushSync(projectActions.stop)
  assert.equal(await whenProjectBackendIdle(), true, "The real backend rejected stop")
  const stopDeadline = performance.now() + 20_000
  while (readProjectTelemetry()?.playing !== false && performance.now() < stopDeadline)
    await Bun.sleep(20)
  assert.equal(readProjectTelemetry()?.playing, false, "The real backend did not stop playback")
  await present("arrangement-stopped")
  result.status = "verified"
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  await present("failure")
  throw error
} finally {
  root.unmount()
  setProjectFiles(null)
  result.released = useProjectState.getState().session.backend.phase === "idle"
  if (!result.released) result.status = "failed"
  writeFileSync(path.join(output, "smoke.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  assert.equal(result.released, true, "Unmount did not release the native project lease")
}
