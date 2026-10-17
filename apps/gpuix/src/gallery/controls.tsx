import { useMemo } from "react"
import { render, useGpuix } from "@gpuix/react"
import { createNativeCursorLock } from "@/platform/cursor"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import { createFrameScheduler } from "@/platform/frame/animation-frame-source"
import { PanelEnvironmentProvider } from "@/ui/panels"
import { createWindowPlatform, LAUNCH_FOCUS } from "@/platform/window"
import { createWindowPointerObserver } from "@/platform/window/pointer-observer"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import type { TitleBarWindow } from "@/ui/panels/TitleBar"
import { GalleryDemo } from "./GalleryDemo"

const appearance = process.env.GALLERY_APPEARANCE === "light" ? "light" : "dark"
const locale = process.env.GALLERY_LOCALE === "zh" ? "zh" : "en"
const pointer = createWindowPointerObserver()
function NativeGallery() {
  const { renderer } = useGpuix()
  const cursorLock = useMemo(() => createNativeCursorLock(renderer), [renderer])
  const frames = useMemo(() => createAnimationFrameSource(renderer ?? {}), [renderer])
  const panels = useMemo(() => ({ scheduleFrame: createFrameScheduler(frames), subscribePointer: pointer.subscribePointer }), [frames])
  const window = useMemo(() => {
    if (!renderer) throw new Error("NativeGallery must render inside a gpuix root")
    const platform = createWindowPlatform(renderer)
    return {
      platform: process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux",
      minimize: platform.minimize, zoom: platform.zoom, close: platform.close,
      doubleClick: platform.titlebarDoubleClick,
      subscribeActive: platform.subscribeApplicationActive,
    } satisfies TitleBarWindow
  }, [renderer])
  return (
    <AnimationFrameProvider source={frames}>
      <PanelEnvironmentProvider environment={panels}>
        <GalleryDemo cursorLock={cursorLock} initialAppearance={appearance} initialLocale={locale} window={window} />
      </PanelEnvironmentProvider>
    </AnimationFrameProvider>
  )
}

render(<NativeGallery />, {
  title: "zoeydaw composition Gallery",
  width: 1050,
  height: 780,
  titlebarTransparent: true,
  trafficLightX: PROJECT_METRICS.trafficLightMargin,
  trafficLightY: (PROJECT_METRICS.titlebarHeight - PROJECT_METRICS.trafficLightFrameHeight) / 2,
  ...LAUNCH_FOCUS,
  ...pointer.rootHandlers,
})
