import { nativeBrowserCatalog } from "@/shared/native/browser"
import { createBrowserLibrary } from "./controller"

const controller = createBrowserLibrary(nativeBrowserCatalog)
export const browserLibrary = controller.library
export const useBrowserLibraryState = controller.useState
export { BROWSER_WINDOW_SIZE } from "./controller"
export { browserAudioDrag, BROWSER_AUDIO_MIME } from "./audio-drag"
export { browserPluginDrag, BROWSER_PLUGIN_MIME } from "./plugin-drag"
export type { BrowserAudioDragSource } from "./audio-drag"
export type {
  BrowserAuditionPort,
  PreparedAudition,
  AuditionState,
  BrowserLibraryState,
} from "./controller"
