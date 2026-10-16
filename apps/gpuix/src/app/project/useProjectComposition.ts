import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { flushSync, useGpuix } from "@gpuix/react"
import { createNativeClipboard } from "@/platform/clipboard"
import { useAnimationFrame, useResumeFrame } from "@/platform/frame"
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
  const { project, layout } = useTheme()
  const browserRef = useRef<BrowserPanelHandle | null>(null)
  const focusRef = useRef<PublicInstance | null>(null)
  const shellRef = useRef(shell)
  shellRef.current = shell
  const geometryRef = useRef(layout)
  geometryRef.current = layout
  const [composition, setComposition] = useState<ProjectComposition | null>(null)
  const { minimapMinHeight, minimapMaxHeight, timelineAutoScrollEdge } = project
  useLayoutEffect(() => {
    const owner = createProjectComposition({
      interaction,
      keyboard,
      clipboard: createNativeClipboard(),
      metrics: { minimapMinHeight, minimapMaxHeight, timelineAutoScrollEdge },
      geometry: geometryRef.current,
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
  useLayoutEffect(() => {
    composition?.timeline.sceneStore.setGeometry(layout)
  }, [composition, layout])
  const subscribeFrameDemand = useCallback(
    (listener: () => void) => composition?.subscribeFrameDemand(listener) ?? (() => {}),
    [composition]
  )
  const frameDemand = useSyncExternalStore(
    subscribeFrameDemand,
    () => composition?.getFrameDemand() ?? false
  )
  useAnimationFrame(timestamp => composition?.tick(timestamp), frameDemand)
  useResumeFrame(timestamp => {
    flushSync(() => composition?.tick(timestamp))
  }, frameDemand)
  return { composition, browserRef, focusRef }
}
