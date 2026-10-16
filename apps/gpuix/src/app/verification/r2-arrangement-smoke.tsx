import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { createSnapshotStorage } from "@/platform/storage"
import { i18next } from "@/platform/i18n/core"
import {
  projectActions,
  setSnapshotStorage,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { AppShell } from "@/app/AppShell"
import { initAppI18n } from "@/app/i18n"
import { AppNativeEnvironmentProvider } from "@/app/native-environment"
import { createRouter } from "@/app/router/router"
import { createPreferenceStore } from "@/app/settings/preference-store"
import { isThemeMode } from "@/app/settings/theme-mode"
import type { ThemeMode } from "@/platform/settings"

const directory = process.env.B2_EVIDENCE_DIR
if (!directory) throw new Error("B2_EVIDENCE_DIR must point outside the repository")
const output = directory
mkdirSync(output, { recursive: true })
initAppI18n({ initialLanguage: "en-US" })
const storage = createSnapshotStorage({ dataDir: output })
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
const root = createTestRoot({ width: 1440, height: 960, ...keyboard.rootHandlers })
function node(testId: string) {
  const found = root.renderer.findByTestId(testId)
  if (!found) throw new Error(`Missing native surface ${testId}`)
  return found
}
async function layoutPass() {
  await Bun.sleep(20)
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
}
async function layout() {
  await layoutPass()
  await layoutPass()
  await layoutPass()
  await layoutPass()
}
async function capture(locale: "en-US" | "zh-CN", mode: "dark" | "light") {
  await i18next.changeLanguage(locale)
  appearance.themeMode.set(mode)
  await layout()
  const key = `${locale}-${mode}`
  root.renderer.captureScreenshot(path.join(output, `r2-arrangement-${key}.png`))
  writeFileSync(
    path.join(output, `r2-arrangement-${key}.ax.json`),
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
  await layout()
  root.renderer.nativeSimulateKeystrokes(node("home-create").id, "enter")
  if (!(await whenProjectBackendIdle())) throw new Error("Native engine rejected project open")
  flushSync(() => projectActions.setEditingClip("native-midi-clip"))
  await layout()
  flushSync(() =>
    projectActions.updateClip("native-midi-clip", { label: "R2 saved from MIDI editor" })
  )
  if (!(await whenProjectBackendIdle())) throw new Error("Native engine rejected authored edit")
  if (!useProjectState.getState().session.dirty) throw new Error("Authored edit was not dirty")
  root.renderer.nativeSimulateKeystrokes(node("midi-grid").id, "cmd-s")
  await whenProjectBackendIdle()
  await Bun.sleep(0)
  if (useProjectState.getState().session.dirty)
    throw new Error("Clip editor save did not clear dirty")
  const clip = root.renderer.getElementBounds(node("clip-source-native-midi-clip").id)
  if (!clip) throw new Error("Missing real MIDI clip geometry")
  const document = useProjectState.getState().document
  root.renderer.nativeSimulateMouseDown(clip.x + 20, clip.y + 6)
  root.renderer.nativeSimulateMouseMove(clip.x + 100, clip.y + 6, 0)
  root.renderer.simulateKeystrokes("tab")
  root.renderer.nativeSimulateMouseUp(clip.x + 100, clip.y + 6)
  if (
    useProjectState.getState().document !== document ||
    useProjectState.getState().session.preview
  )
    throw new Error("Tab followed by release committed a cancelled lane drag")
  await capture("en-US", "dark")
  await capture("zh-CN", "light")
  console.log(
    JSON.stringify({
      native: useProjectState.getState().session.backend.phase,
      saved: true,
      blurCancelled: true,
      output,
    })
  )
} finally {
  root.unmount()
  setSnapshotStorage(null)
  console.log("released", useProjectState.getState().session.backend.phase)
}
