import { useMemo, useSyncExternalStore } from "react"
import { useGpuix } from "@gpuix/react"
import { createNativeCursorLock } from "@/platform/cursor"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import { createWindowPlatform } from "@/platform/window"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { PanelEnvironmentProvider } from "@/ui/panels"
import type { PanelEnvironment } from "@/ui/panels"
import { AppShell } from "./AppShell"
import { AppNativeEnvironmentProvider } from "./native-environment"
import type { AppShellProps } from "./AppShell"
import type { TitleBarWindow } from "@/ui/panels/TitleBar"

export type NativeRootProps = Omit<
  AppShellProps,
  "windowRenderer" | "systemAppearance" | "titlebarWindow"
> & { readonly subscribePointer?: PanelEnvironment["subscribePointer"] }

export function NativeRoot({ subscribePointer, ...props }: NativeRootProps) {
  const { renderer } = useGpuix()
  if (!renderer) throw new Error("NativeRoot must render inside a gpuix root")
  const native = useMemo(() => {
    const window = createWindowPlatform(renderer)
    const frames = createAnimationFrameSource(renderer)
    return {
      frames,
      panels: { subscribeWindowActive: window.subscribeApplicationActive, subscribePointer },
      controls: {
        cursorLock: createNativeCursorLock(renderer),
        subscribeWindowActive: window.subscribeApplicationActive,
      },
      window,
      titlebar: {
        platform:
          process.platform === "darwin"
            ? "macos"
            : process.platform === "win32"
              ? "windows"
              : "linux",
        minimize: window.minimize,
        zoom: window.zoom,
        close: window.close,
        doubleClick: window.titlebarDoubleClick,
        subscribeActive: window.subscribeApplicationActive,
      } satisfies TitleBarWindow,
    }
  }, [renderer, subscribePointer])
  const systemAppearance = useSyncExternalStore(
    native.window.subscribeSystemAppearance,
    native.window.getSystemAppearance
  )
  return (
    <AnimationFrameProvider source={native.frames}>
      <ControlEnvironmentProvider value={native.controls}>
        <PanelEnvironmentProvider environment={native.panels}>
          <AppNativeEnvironmentProvider value={native.panels}>
            <AppShell
              {...props}
              windowRenderer={renderer}
              systemAppearance={systemAppearance}
              titlebarWindow={native.titlebar}
            />
          </AppNativeEnvironmentProvider>
        </PanelEnvironmentProvider>
      </ControlEnvironmentProvider>
    </AnimationFrameProvider>
  )
}
