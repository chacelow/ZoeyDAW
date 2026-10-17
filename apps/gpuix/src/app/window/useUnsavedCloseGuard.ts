import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "@gpuix/react"
import { toast } from "@/ui/controls"
import { useProjectState } from "@/project/adapters"
import { useAppTranslation } from "../i18n"
import { useProjectFiles } from "../project-file/ProjectFileProvider"
import { createWindowCloseGuard } from "@/platform/window"
import { chooseClose, IDLE_CLOSE, requestClose } from "./unsaved-close"
import type { WindowRenderer } from "@/platform/window"
import type { Router } from "../router/router"
import type { UnsavedCloseChoice, UnsavedCloseState } from "./unsaved-close"

export function useUnsavedCloseGuard(renderer: WindowRenderer | null, router: Router) {
  const { t } = useAppTranslation()
  const files = useProjectFiles()
  const [asking, setAsking] = useState(false)
  const state = useRef<UnsavedCloseState>(IDLE_CLOSE)
  const pending = useRef<(() => void) | null>(null)
  const labels = useRef(t)
  labels.current = t
  const save = useRef(files.save)
  save.current = files.save

  useLayoutEffect(() => {
    let isRetired = false
    const dirty = () =>
      router.getRoute().kind === "project" && useProjectState.getState().session.dirty
    const unregister = router.registerLeaveGuard((_next, proceed) => {
      if (pending.current) return false
      const result = requestClose(state.current, dirty())
      state.current = result.next
      if (result.allow) return true
      pending.current = proceed
      setAsking(true)
      return false
    })
    if (renderer) {
      const created = createWindowCloseGuard(renderer, {
        shouldClose() {
          if (isRetired) return true
          if (pending.current) return false
          const result = requestClose(state.current, dirty())
          state.current = result.next
          if (!result.allow) {
            pending.current = () => created.close()
            queueMicrotask(() => {
              if (!isRetired && pending.current) flushSync(() => setAsking(true))
            })
          }
          return result.allow
        },
      })
    }
    return () => {
      isRetired = true
      unregister()
      pending.current = null
      state.current = IDLE_CLOSE
    }
  }, [renderer, router])

  const choose = useCallback(async (choice: UnsavedCloseChoice) => {
    setAsking(false)
    const current = pending.current
    if (!current) return
    const saved = choice === "save" && (await save.current())
    if (current !== pending.current) return
    const failed = choice === "save" && !saved && useProjectState.getState().session.fileError
    if (failed) toast.error(labels.current("windowClose.saveFailed"))
    state.current = chooseClose(state.current, choice, saved)
    pending.current = null
    if (state.current.phase !== "armed") return
    try {
      current()
      state.current = IDLE_CLOSE
    } catch {
      state.current = IDLE_CLOSE
      toast.error(labels.current("windowClose.closeFailed"))
    }
  }, [])

  return { asking, choose }
}
