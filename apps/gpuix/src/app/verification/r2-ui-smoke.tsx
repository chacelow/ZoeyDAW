/* eslint-disable no-await-in-loop -- Native layout and locale changes serialize on one root. */
import "@/app/verification/native-fixture"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AppShell } from "@/app/AppShell"
import { initAppI18n } from "@/app/i18n"
import { AppNativeEnvironmentProvider } from "@/app/native-environment"
import { createRouter } from "@/app/router/router"
import { createPreferenceStore } from "@/app/settings/preference-store"
import { isThemeMode } from "@/app/settings/theme-mode"
import { GalleryDemo } from "@/gallery/GalleryDemo"
import { AnimationFrameProvider } from "@/platform/frame"
import { i18next } from "@/platform/i18n/core"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import type { ThemeMode } from "@/platform/settings"
import {
  createMemorySnapshotStorage,
  projectActions,
  readProjectTelemetry,
  setSnapshotStorage,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { ControlEnvironmentProvider } from "@/ui/controls/ControlEnvironment"

const output = process.env.B2_EVIDENCE_DIR
if (!output) throw new Error("B2_EVIDENCE_DIR must be an isolated evidence directory")
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
const listeners = new Set<(active: boolean) => void>()
const cursor = { visible: true }
const environment = {
  subscribeWindowActive(listener: (active: boolean) => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  cursorLock: {
    capture: (point: { x: number; y: number }) => point,
    hide: () => {
      cursor.visible = false
    },
    restore: () => {
      cursor.visible = true
    },
  },
}
const keyboard = createWindowKeyboard()
const router = createRouter("/")
const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
async function layout() {
  for (let pass = 0; pass < 4; pass++) {
    await Bun.sleep(20)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}
function node(id: string) {
  const element = root.renderer.findByTestId(id)
  if (!element) throw new Error(`Missing ${id}`)
  return element
}
function assert(value: boolean, message: string) {
  if (!value) throw new Error(message)
}
try {
  root.render(
    <AnimationFrameProvider source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}>
      <AppNativeEnvironmentProvider value={environment}>
        <ControlEnvironmentProvider value={environment}>
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
        </ControlEnvironmentProvider>
      </AppNativeEnvironmentProvider>
    </AnimationFrameProvider>
  )
  root.renderer.nativeSimulateKeystrokes(node("home-create").id, "enter")
  assert(await whenProjectBackendIdle(), "Native backend did not open")
  flushSync(() => projectActions.selectTracks(["native-midi"], "header"))
  await layout()
  flushSync(() => {
    projectActions.seekBar(9)
  })
  await whenProjectBackendIdle()
  const beforeHome = useProjectState.getState().session.position
  root.renderer.nativeSimulateKeystrokes(node("footer-divider").id, "home")
  assert(
    JSON.stringify(useProjectState.getState().session.position) === JSON.stringify(beforeHome),
    "Divider Home rewound the actual project"
  )
  root.renderer.nativeSimulateKeystrokes(node("device-add").id, "enter")
  root.renderer.simulateKeystrokes("home")
  assert(
    JSON.stringify(useProjectState.getState().session.position) === JSON.stringify(beforeHome),
    "Menu Home rewound the actual project"
  )
  root.renderer.simulateKeystrokes("escape")
  flushSync(() => projectActions.setEditingClip("native-midi-clip"))
  await layout()
  const bpm = node("transport-bpm")
  const bounds = root.renderer.getElementBounds(bpm.id)
  if (!bounds) throw new Error("No painted BPM control")
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const original = useProjectState.getState().document.transport.bpm
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x, y - 40, 0)
  assert(
    useProjectState.getState().document.transport.bpm !== original && !cursor.visible,
    "BPM drag did not preview"
  )
  root.renderer.nativeSimulateKeystrokes(bpm.id, "escape")
  assert(
    useProjectState.getState().document.transport.bpm === original && cursor.visible,
    "BPM Escape failed to rollback"
  )
  assert(
    useProjectState.getState().session.editingClipId === "native-midi-clip",
    "BPM Escape closed Clip Edit"
  )
  root.renderer.nativeSimulateMouseUp(x, y - 40)
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x, y - 40, 0)
  flushSync(() => {
    for (const listener of listeners) listener(false)
  })
  assert(
    useProjectState.getState().document.transport.bpm === original && cursor.visible,
    "Inactive window retained BPM preview or cursor lock"
  )
  root.renderer.nativeSimulateMouseUp(x, y - 40)
  assert(await whenProjectBackendIdle(), "Native backend did not settle after cancellation")
  assert(readProjectTelemetry() !== null, "No real engine telemetry")
  for (const locale of ["en-US", "zh-CN"]) {
    await i18next.changeLanguage(locale)
    for (const mode of ["dark", "light"] as const) {
      appearance.themeMode.set(mode)
      await layout()
      root.renderer.captureScreenshot(path.join(output, `project-${locale}-${mode}.png`))
    }
  }
  writeFileSync(
    path.join(output, "project.ax.json"),
    JSON.stringify(root.renderer.getA11yTree(), null, 2)
  )
  console.log(
    JSON.stringify({
      nativeTelemetry: readProjectTelemetry(),
      dividerHome: "retained",
      menuHome: "retained",
      bpmEscape: "clip-retained",
      inactive: "rolled-back",
      screenshots: 4,
    })
  )
} finally {
  root.unmount()
}
const gallery = createTestRoot({ width: 1050, height: 780 })
try {
  gallery.render(<GalleryDemo />)
  gallery.renderer.flush()
  gallery.renderer.captureScreenshot(path.join(output, "gallery.png"))
} finally {
  gallery.unmount()
}
assert(listeners.size === 0, "Window activation listeners leaked after unmount")
assert(
  useProjectState.getState().session.backend.phase === "idle",
  "Native session leaked after unmount"
)
