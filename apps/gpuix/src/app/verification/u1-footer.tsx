/* eslint-disable no-await-in-loop -- Drain sequential native layout rounds before input. */
import "./native-fixture"
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import {
  createMemorySnapshotStorage,
  setSnapshotStorage,
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
assert.ok(output, "Pass an external evidence directory")
mkdirSync(output, { recursive: true })
initAppI18n({ initialLanguage: "en-US", storage: { get: () => "en-US", set: () => {} } })
const storage = createMemorySnapshotStorage()
setSnapshotStorage(storage)
const keyboard = createWindowKeyboard()
const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
async function settle() {
  for (let pass = 0; pass < 6; pass++) {
    await Bun.sleep(20)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}
async function command(testId: string, key = "enter") {
  const node = root.renderer.findByTestId(testId)
  assert.ok(node, `Missing ${testId}`)
  root.renderer.nativeSimulateKeystrokes(node.id, key)
  await settle()
}
try {
  root.render(
    <AnimationFrameProvider source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}>
      <AppNativeEnvironmentProvider value={{ subscribeWindowActive: () => () => {} }}>
        <WindowKeyboardProvider value={keyboard}>
          <AppShell
            router={createRouter("/")}
            appearance={{
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
            }}
            systemAppearance="dark"
            storage={storage}
            closeRenderer={null}
            showErrorDetails
          />
        </WindowKeyboardProvider>
      </AppNativeEnvironmentProvider>
    </AnimationFrameProvider>
  )
  await settle()
  await command("home-create")
  assert.ok(await whenProjectBackendIdle(), "Real backend did not become ready")
  await settle()
  await command("status-clip")
  const content = root.renderer.findByTestId("footer-content")
  assert.ok(content)
  assert.equal(content.customProps?.role, "group")
  assert.equal(content.customProps?.["aria-label"], "Clip Edit")
  assert.equal(root.renderer.findByTestId("motion-tab-clip"), undefined)
  assert.equal(root.renderer.findByTestId("motion-tab-devices"), undefined)
  root.renderer.captureScreenshot(path.join(output, "footer-clip.png"))
  writeFileSync(
    path.join(output, "footer-clip.ax.json"),
    JSON.stringify(root.renderer.getA11yTree(), null, 2)
  )
  await command("status-clip")
  assert.equal(root.renderer.findByTestId("footer-content"), undefined)
  await command("status-devices")
  assert.equal(
    root.renderer.findByTestId("footer-content")?.customProps?.["aria-label"],
    "Affect Chain"
  )
  const devices = root.renderer.findByTestId("status-devices")
  assert.ok(devices)
  root.renderer.focusElement(devices.id)
  root.renderer.nativeSimulateKeystrokes(devices.id, "shift-tab")
  const clip = root.renderer.findByTestId("status-clip")
  assert.ok(clip)
  assert.equal(root.renderer.getFocusedElementId(), clip.id)
  await command("status-clip")
  assert.equal(
    root.renderer.findByTestId("footer-content")?.customProps?.["aria-label"],
    "Clip Edit"
  )
  console.log(
    JSON.stringify({
      output,
      backend: "real",
      statusSwitches: "clip/collapse/devices/Tab/clip passed",
    })
  )
} finally {
  root.unmount()
}
