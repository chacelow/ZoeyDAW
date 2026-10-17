import { render } from "@gpuix/react"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { configureLogger } from "@/platform/log/logger"
import { createLogPlatform, createNativeLogSink } from "./platform/log"
import { createWindowKeyboard, WindowKeyboardProvider } from "./platform/keyboard"
import { createWindowPointerObserver } from "./platform/window/pointer-observer"
import { createSettingStorage, DEFAULT_THEME_MODE, getPreference } from "./platform/settings"
import { createThemePresetSetting } from "./platform/settings/theme-preset"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "./shared/theme/presets"
import {
  createProjectFileStorage,
  createProjectLocations,
  createRecentProjectStorage,
} from "./platform/storage"
import { LAUNCH_FOCUS } from "./platform/window"
import { setProjectFiles } from "./project/adapters"
import { initAppI18n } from "./app/i18n"
import { i18next } from "./platform/i18n/core"
import { NativeRoot } from "./app/NativeRoot"
import { createRouter } from "./app/router/router"
import type { Route } from "./app/router/route"
import { loadRecentProjects } from "./app/home/recent-projects"
import { createPreferenceStore } from "./app/settings/preference-store"
import { isThemeMode } from "./app/settings/theme-mode"
import { createThemeLibraryStore } from "./app/theme-editor"

createLogPlatform().initialize()
configureLogger({ sinks: [createNativeLogSink()] })
initAppI18n({ storage: createSettingStorage("language") })
const presetSetting = createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET)
const themePreset = createPreferenceStore(presetSetting, isThemePresetId, DEFAULT_THEME_PRESET)
const appearance = {
  themeMode: createPreferenceStore(
    createSettingStorage("themeMode"),
    isThemeMode,
    DEFAULT_THEME_MODE
  ),
  themePreset,
  themeLibrary: createThemeLibraryStore(createSettingStorage("themeLibrary"), themePreset.get()),
}
setProjectFiles(createProjectFileStorage())
const files = { recents: createRecentProjectStorage(), locations: createProjectLocations() }
const lastProject = loadRecentProjects(files.recents)[0]?.path
const startRoute: string | Route =
  process.env.ZOEYDAW_ROUTE ??
  (lastProject
    ? { kind: "project", projectId: lastProject }
    : { kind: "project", projectId: crypto.randomUUID(), openMode: "new" })

const keyboard = createWindowKeyboard()
const pointer = createWindowPointerObserver()
const startupWindow = getPreference("window")

render(
  <WindowKeyboardProvider value={keyboard}>
    <NativeRoot
      subscribePointer={pointer.subscribePointer}
      router={createRouter(startRoute)}
      appearance={appearance}
      files={files}
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
    ...pointer.rootHandlers,
    ...LAUNCH_FOCUS,
  }
)
