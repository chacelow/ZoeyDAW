import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { createSettingStorage } from "@/platform/settings"
import { createThemePresetSetting } from "@/platform/settings/theme-preset"
import { createSnapshotStorage } from "@/platform/storage"
import {
  projectActions,
  setSnapshotStorage,
  useProjectState,
  whenProjectBackendIdle,
  readProjectTelemetry,
} from "@/project/adapters"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { AppShell } from "../AppShell"
import { initAppI18n } from "../i18n"
import { AppNativeEnvironmentProvider } from "../native-environment"
import { createRouter } from "../router/router"
import { createPreferenceStore } from "../settings/preference-store"
import { isThemeMode } from "../settings/theme-mode"
import type { AnimationFrameCallback } from "@/platform/frame"

const directory = process.env.B2_EVIDENCE_DIR
if (!directory)
  throw new Error("B2_EVIDENCE_DIR must point to the isolated native fixture directory")
const options = { configDir: directory }
initAppI18n({ initialLanguage: "en-US", storage: createSettingStorage("language", options) })
const storage = createSnapshotStorage({ dataDir: directory })
setSnapshotStorage(storage)
const appearance = {
  themeMode: createPreferenceStore(createSettingStorage("themeMode", options), isThemeMode, "dark"),
  themePreset: createPreferenceStore(
    createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET, options),
    isThemePresetId,
    DEFAULT_THEME_PRESET
  ),
}
const native: {
  resume: AnimationFrameCallback | null
  frame: AnimationFrameCallback | null
  active: boolean
} = { resume: null, frame: null, active: false }
const frames = createAnimationFrameSource({
  setAnimationFrameCallback(callback) {
    native.frame = callback
  },
  setResumeFrameCallback(callback) {
    native.resume = callback
  },
  setAnimationFrameActive(active) {
    native.active = active
  },
})
const keyboard = createWindowKeyboard()
const router = createRouter("/")
const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
function retainedScroll() {
  const node = root.renderer.findByTestId("timeline-horizontal-scroll")
  if (!node) throw new Error("No real Arrangement scrollbar")
  const text = root.renderer.getElement(node.id)?.customProps?.["aria-valuetext"]
  if (typeof text !== "string" || text.trim() === "")
    throw new Error("Scrollbar has no retained numeric label")
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error("Scrollbar retained label is not a finite number")
  return value
}
async function layoutPass() {
  await Bun.sleep(20)
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
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
            storage={storage}
            closeRenderer={null}
            showErrorDetails
          />
        </WindowKeyboardProvider>
      </AppNativeEnvironmentProvider>
    </AnimationFrameProvider>
  )
  const create = root.renderer.findByTestId("home-create")
  if (!create) throw new Error("No real Home create command")
  root.renderer.nativeSimulateKeystrokes(create.id, "enter")
  const createdRoute = router.getRoute()
  if (createdRoute.kind !== "project") throw new Error("Home did not open a project")
  if (!(await whenProjectBackendIdle())) throw new Error("First native project lease was rejected")
  flushSync(() => router.navigate("/"))
  if (useProjectState.getState().session.backend.phase !== "idle")
    throw new Error("Leaving project did not release its native lease")
  await layoutPass()
  const card = root.renderer.findByTestId(`recent-${createdRoute.projectId}`)
  if (!card) throw new Error("No real recent-project Card")
  const bounds = root.renderer.getElementBounds(card.id)
  console.log(
    JSON.stringify({
      recentCard: {
        width: bounds?.width,
        paddingLeft: card.style.paddingLeft,
        paddingRight: card.style.paddingRight,
        gap: card.style.gap,
      },
    })
  )
  root.renderer.nativeSimulateKeystrokes(card.id, "enter")
  const reopened = router.getRoute()
  if (reopened.kind !== "project" || reopened.projectId !== createdRoute.projectId)
    throw new Error("Project Card keyboard activation changed the route identity")
  if (!(await whenProjectBackendIdle()))
    throw new Error("Native fixture backend did not accept the project")
  await layoutPass()
  await layoutPass()
  await layoutPass()
  await layoutPass()
  flushSync(() => {
    projectActions.setFollow(true)
    projectActions.togglePlay()
    projectActions.seekBar(20)
  })
  if (!(await whenProjectBackendIdle()))
    throw new Error("Native transport did not accept playback/seek")
  // Telemetry stays null until the engine publishes a frame that applied this control sequence;
  // on a loaded CI runner that can take longer than any fixed sleep, so wait for it with a deadline.
  const deadline = performance.now() + 5000
  let telemetry = readProjectTelemetry()
  while (!telemetry?.playing && performance.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- Polls one engine until it reports playback.
    await Bun.sleep(20)
    telemetry = readProjectTelemetry()
  }
  if (!telemetry?.playing) throw new Error("The real native engine is not playing")
  const before = retainedScroll()
  if (before !== 0) throw new Error("Fixture already followed before any frame delivery")
  native.resume?.(performance.now())
  const retainedBeforePresent = retainedScroll()
  const workspace = useProjectState.getState().workspace.scrollX
  if (!(retainedBeforePresent > 0) || retainedBeforePresent !== workspace)
    throw new Error("First resume did not synchronously publish the latest real viewport")
  root.renderer.flush()
  const stats = root.renderer.getDebugFrameOverlayStats()
  console.log(
    JSON.stringify({
      nativePlaying: telemetry.playing,
      nativeBar: telemetry.clock.bar,
      before,
      retainedBeforePresent,
      workspace,
      frames: stats.frames,
    })
  )
  flushSync(projectActions.stop)
  await whenProjectBackendIdle()
} finally {
  root.unmount()
  setSnapshotStorage(null)
  console.log("released", useProjectState.getState().session.backend.phase)
}
