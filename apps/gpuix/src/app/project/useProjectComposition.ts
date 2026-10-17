import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { flushSync, useGpuix } from "@gpuix/react"
import { createNativeClipboard } from "@/platform/clipboard"
import { useAnimationFrame, useResumeFrame } from "@/platform/frame"
import { useWindowKeyboard } from "@/platform/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { useArrangementPolicy } from "@/project/sections/arrangement/configuration"
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
  const projectRef = useRef(project)
  projectRef.current = project
  const [metrics] = useState(() => ({
    get minimapMinHeight() {
      return projectRef.current.minimapMinHeight
    },
    get minimapMaxHeight() {
      return projectRef.current.minimapMaxHeight
    },
    get timelineAutoScrollEdge() {
      return projectRef.current.timelineAutoScrollEdge
    },
  }))
  const policy = useArrangementPolicy()
  const policyRef = useRef(policy)
  policyRef.current = policy
  const readPolicy = useCallback(() => policyRef.current, [])
  const browserRef = useRef<BrowserPanelHandle | null>(null)
  const focusRef = useRef<PublicInstance | null>(null)
  const shellRef = useRef(shell)
  shellRef.current = shell
  const geometryRef = useRef(layout)
  geometryRef.current = layout
  const [composition, setComposition] = useState<ProjectComposition | null>(null)
  useLayoutEffect(() => {
    const owner = createProjectComposition({
      interaction,
      keyboard,
      clipboard: createNativeClipboard(),
      metrics,
      geometry: geometryRef.current,
      readPolicy,
      subscribeWindowActive,
      blurControl: () => {
        if (focusRef.current) renderer?.focusElement?.(focusRef.current.id)
      },
      browserCollapsed: () => shellRef.current.browserCollapsed,
      focusBrowserSearch: () => browserRef.current?.focusSearch(),
      dock: {
        focused: () => shellRef.current.dockFocused.current,
        execute: command => shellRef.current.dockRef.current?.executeCommand(command) ?? false,
      },
    })
    setComposition(owner)
    return owner.dispose
  }, [interaction, keyboard, renderer, subscribeWindowActive, readPolicy, metrics])
  useLayoutEffect(() => {
    composition?.timeline.sceneStore.setGeometry(layout)
  }, [composition, layout])
  useLayoutEffect(() => {
    composition?.lane.interrupt()
    composition?.timeline.view.cancelGestures()
  }, [composition, policy, project])
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
