/* eslint-disable no-await-in-loop -- Captures serialize locale and layout changes on one native root. */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider } from "@/platform/frame"
import { i18next } from "@/platform/i18n/core"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import {
  createMemorySnapshotStorage,
  projectActions,
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
async function layout() {
  for (let frame = 0; frame < 6; frame++) {
    await Bun.sleep(20)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
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
  const create = root.renderer.findByTestId("home-create")
  if (!create) throw new Error("No Home create command")
  root.renderer.nativeSimulateKeystrokes(create.id, "enter")
  if (!(await whenProjectBackendIdle())) throw new Error("Native project did not become ready")
  for (const locale of ["en-US", "zh-CN"]) {
    await i18next.changeLanguage(locale)
    for (const mode of ["dark", "light"] as const) {
      appearance.themeMode.set(mode)
      for (const kind of ["midi", "audio"] as const) {
        flushSync(() => projectActions.setEditingClip(`native-${kind}-clip`))
        await layout()
        const key = `${locale}-${mode}-${kind}`
        if (
          !root.renderer.findByTestId("project-layout") ||
          !root.renderer.findByTestId(`${kind}-editor`)
        ) {
          throw new Error(`${key}: expected project/editor surface is missing`)
        }
        root.renderer.captureScreenshot(path.join(output, `${key}.png`))
        writeFileSync(
          path.join(output, `${key}.ax.json`),
          JSON.stringify(root.renderer.getA11yTree(), null, 2)
        )
      }
    }
  }
  console.log(JSON.stringify({ output, combinations: 8 }))
} finally {
  root.unmount()
}
