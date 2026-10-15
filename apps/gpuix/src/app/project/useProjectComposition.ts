import { useLayoutEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { createNativeClipboard } from "@/platform/clipboard"
import { useAnimationFrame } from "@/platform/frame"
import { useWindowKeyboard } from "@/platform/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { useAppInteraction } from "../interaction"
import { useAppNativeEnvironment } from "../native-environment"
import { createProjectComposition } from "./composition"
import type { ProjectComposition } from "./composition"
import type { ProjectShellApi } from "./useProjectShell"
import type { BrowserPanelHandle } from "@/project/sections/browser"
import type { PublicInstance } from "@gpuix/react"

export function useProjectComposition(shell: ProjectShellApi) {
  const { renderer } = useGpuix()
  const keyboard = useWindowKeyboard()
  const interaction = useAppInteraction()
  const { subscribeWindowActive } = useAppNativeEnvironment()
  const { project } = useTheme()
  const browserRef = useRef<BrowserPanelHandle | null>(null)
  const focusRef = useRef<PublicInstance | null>(null)
  const shellRef = useRef(shell)
  shellRef.current = shell
  const [composition, setComposition] = useState<ProjectComposition | null>(null)
  const { minimapMinHeight, minimapMaxHeight, timelineAutoScrollEdge } = project
  useLayoutEffect(() => {
    const owner = createProjectComposition({
      interaction,
      keyboard,
      clipboard: createNativeClipboard(),
      metrics: { minimapMinHeight, minimapMaxHeight, timelineAutoScrollEdge },
      subscribeWindowActive,
      blurControl: () => {
        if (focusRef.current) renderer?.focusElement?.(focusRef.current.id)
      },
      browserCollapsed: () => shellRef.current.browserHandleRef.current?.isCollapsed() ?? true,
      focusBrowserSearch: () => browserRef.current?.focusSearch(),
    })
    setComposition(owner)
    return owner.dispose
  }, [
    interaction,
    keyboard,
    renderer,
    subscribeWindowActive,
    minimapMinHeight,
    minimapMaxHeight,
    timelineAutoScrollEdge,
  ])
  useAnimationFrame(timestamp => composition?.tick(timestamp), composition !== null)
  return { composition, browserRef, focusRef }
}
