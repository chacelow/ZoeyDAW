import { render } from "@gpuix/react"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { configureLogger } from "@/platform/log/logger"
import { createLogPlatform, createNativeLogSink } from "./platform/log"
import { createWindowKeyboard, WindowKeyboardProvider } from "./platform/keyboard"
import { createSettingStorage, DEFAULT_THEME_MODE, getPreference } from "./platform/settings"
import { createThemePresetSetting } from "./platform/settings/theme-preset"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "./shared/theme/presets"
import { createSnapshotStorage } from "./platform/storage"
import { LAUNCH_FOCUS } from "./platform/window"
import { setSnapshotStorage } from "./project/adapters"
import { initAppI18n } from "./app/i18n"
import { i18next } from "./platform/i18n/core"
import { NativeRoot } from "./app/NativeRoot"
import { createRouter } from "./app/router/router"
import { createPreferenceStore } from "./app/settings/preference-store"
import { isThemeMode } from "./app/settings/theme-mode"

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
const startupWindow = getPreference("window")

render(
  <WindowKeyboardProvider value={keyboard}>
    <NativeRoot
      router={createRouter(process.env.ZOEYDAW_ROUTE ?? "/")}
      appearance={appearance}
      storage={storage}
      showErrorDetails={process.env.NODE_ENV !== "production"}
    />
  </WindowKeyboardProvider>,
  {
    title: i18next.t("app.name"),
    width: startupWindow.width,
    height: startupWindow.height,
    titlebarTransparent: true,
    trafficLightX: PROJECT_METRICS.trafficLightMargin,
    trafficLightY: (PROJECT_METRICS.titlebarHeight - PROJECT_METRICS.trafficLightFrameHeight) / 2,
    ...keyboard.rootHandlers,
    ...LAUNCH_FOCUS,
  }
)
