/**
 * Application entry: create the window, wire process-wide platform ports, mount the app.
 * No project session opens here; the project route acquires and releases its own lease.
 */
import { render } from "@gpuix/react"
import { PROJECT_METRICS } from "@zoeymind/ui/metrics"
import { configureLogger } from "@zoeymind/logger"
import { createLogPlatform, createNativeLogSink } from "./platform/log"
import { createWindowKeyboard, WindowKeyboardProvider } from "./platform/keyboard"
import { createSettingStorage } from "./platform/settings"
import { createSnapshotStorage } from "./platform/storage"
import { setSnapshotStorage } from "./project/adapters"
import { initAppI18n } from "./app/i18n"
import { NativeRoot } from "./app/NativeRoot"
import { createRouter } from "./app/router/router"
import { createThemeModeStore } from "./app/settings/theme-mode"
import { createThemeModeSetting } from "./app/settings/theme-mode-setting"
import { emptyProjectSlots } from "./app/project/empty-slots"

/** AppKit's standard window button frame height (Live AX: AXCloseButton 12×14). */
const TRAFFIC_LIGHT_FRAME_HEIGHT = 14

createLogPlatform().initialize()
configureLogger({ sinks: [createNativeLogSink()] })
initAppI18n({ storage: createSettingStorage("language") })
const storage = createSnapshotStorage()
setSnapshotStorage(storage)

const keyboard = createWindowKeyboard()

render(
  <WindowKeyboardProvider value={keyboard}>
    <NativeRoot
      router={createRouter(process.env.ZOEYDAW_ROUTE ?? "/")}
      themeModes={createThemeModeStore(createThemeModeSetting())}
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
    trafficLightY: (PROJECT_METRICS.titlebarHeight - TRAFFIC_LIGHT_FRAME_HEIGHT) / 2,
    ...keyboard.rootHandlers,
  }
)
