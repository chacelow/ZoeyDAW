import { useMemo, useSyncExternalStore } from "react"
import { useGpuix } from "@gpuix/react"
import { nativeCursorLock } from "@/platform/cursor"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import { createWindowPlatform } from "@/platform/window"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { PanelEnvironmentProvider } from "@/ui/panels"
import { AppShell } from "./AppShell"
import type { AppShellProps } from "./AppShell"

export type NativeRootProps = Omit<AppShellProps, "closeRenderer" | "systemAppearance">

/**
 * Binds renderer-scoped native capabilities exactly once: the single animation-frame source,
 * the cursor lock for drag controls, window activation for panel gesture rollback and the
 * close guard. Everything below receives them through providers.
 */
export function NativeRoot(props: NativeRootProps) {
  const { renderer } = useGpuix()
  if (!renderer) throw new Error("NativeRoot must render inside a gpuix root")
  const native = useMemo(() => {
    const window = createWindowPlatform(renderer)
    return {
      frames: createAnimationFrameSource(renderer),
      panels: { subscribeWindowActive: window.subscribeApplicationActive },
      controls: { cursorLock: nativeCursorLock },
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
          <AppShell {...props} closeRenderer={renderer} systemAppearance={systemAppearance} />
        </PanelEnvironmentProvider>
      </ControlEnvironmentProvider>
    </AnimationFrameProvider>
  )
}
