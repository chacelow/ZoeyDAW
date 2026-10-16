import { useMemo, useSyncExternalStore } from "react"
import { useGpuix } from "@gpuix/react"
import { createNativeCursorLock } from "@/platform/cursor"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import { createWindowPlatform } from "@/platform/window"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { PanelEnvironmentProvider } from "@/ui/panels"
import { AppShell } from "./AppShell"
import { AppNativeEnvironmentProvider } from "./native-environment"
import type { AppShellProps } from "./AppShell"

export type NativeRootProps = Omit<AppShellProps, "closeRenderer" | "systemAppearance">

export function NativeRoot(props: NativeRootProps) {
  const { renderer } = useGpuix()
  if (!renderer) throw new Error("NativeRoot must render inside a gpuix root")
  const native = useMemo(() => {
    const window = createWindowPlatform(renderer)
    return {
      frames: createAnimationFrameSource(renderer),
      panels: { subscribeWindowActive: window.subscribeApplicationActive },
      controls: {
        cursorLock: createNativeCursorLock(renderer),
        subscribeWindowActive: window.subscribeApplicationActive,
      },
      window,
    }
  }, [renderer])
  const systemAppearance = useSyncExternalStore(
    native.window.subscribeSystemAppearance,
    native.window.getSystemAppearance
  )
  return (
    <AnimationFrameProvider source={native.frames}>
      <ControlEnvironmentProvider value={native.controls}>
        <PanelEnvironmentProvider environment={native.panels}>
          <AppNativeEnvironmentProvider value={native.panels}>
            <AppShell {...props} closeRenderer={renderer} systemAppearance={systemAppearance} />
          </AppNativeEnvironmentProvider>
        </PanelEnvironmentProvider>
      </ControlEnvironmentProvider>
    </AnimationFrameProvider>
  )
}
