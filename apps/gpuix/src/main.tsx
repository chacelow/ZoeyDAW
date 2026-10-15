/**
 * Application entry: create the window, wire process-wide platform ports, mount the app.
 * No project session opens here; the project route acquires and releases its own lease.
 */
import { render } from "@gpuix/react"
// Composition-root exception (coordinator-approved): window options are computed before
// render(), so there is no useTheme() yet; only this file reads the metrics directly.
import { PROJECT_METRICS } from "@zoeymind/ui/metrics"
import { configureLogger } from "@zoeymind/logger"
import { createLogPlatform, createNativeLogSink } from "./platform/log"
import { createWindowKeyboard, WindowKeyboardProvider } from "./platform/keyboard"
import { createSettingStorage, DEFAULT_THEME_MODE } from "./platform/settings"
import { createThemePresetSetting } from "./platform/settings/theme-preset"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "./shared/theme/presets"
import { createSnapshotStorage } from "./platform/storage"
import { setSnapshotStorage } from "./project/adapters"
import { initAppI18n } from "./app/i18n"
import { NativeRoot } from "./app/NativeRoot"
import { createRouter } from "./app/router/router"
import { createPreferenceStore } from "./app/settings/preference-store"
import { isThemeMode } from "./app/settings/theme-mode"
import { emptyProjectSlots } from "./app/project/empty-slots"

createLogPlatform().initialize()
configureLogger({ sinks: [createNativeLogSink()] })
initAppI18n({ storage: createSettingStorage("language") })
const presetSetting = createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET)
const appearance = {
  themeMode: createPreferenceStore(
    createSettingStorage("themeMode"),
    isThemeMode,
    DEFAULT_THEME_MODE
  ),
  themePreset: createPreferenceStore(presetSetting, isThemePresetId, DEFAULT_THEME_PRESET),
}
const storage = createSnapshotStorage()
setSnapshotStorage(storage)

const keyboard = createWindowKeyboard()

render(
  <WindowKeyboardProvider value={keyboard}>
    <NativeRoot
      router={createRouter(process.env.ZOEYDAW_ROUTE ?? "/")}
      appearance={appearance}
      storage={storage}
      renderProjectSlots={emptyProjectSlots}
      showErrorDetails={process.env.NODE_ENV !== "production"}
    />
  </WindowKeyboardProvider>,
  {
    title: "zoeydaw",
    // Initial window size from src-tauri/tauri.conf.json (app.windows[0]).
    width: 1280,
    height: 800,
    titlebarTransparent: true,
    trafficLightX: PROJECT_METRICS.trafficLightMargin,
    trafficLightY: (PROJECT_METRICS.titlebarHeight - PROJECT_METRICS.trafficLightFrameHeight) / 2,
    ...keyboard.rootHandlers,
  }
)
