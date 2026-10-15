import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "@gpuix/react"
import { toast } from "@/ui/controls"
import { projectActions, useProjectState, whenProjectBackendIdle } from "@/project/adapters"
import { useAppTranslation } from "../i18n"
import { createWindowCloseGuard } from "@/platform/window"
import { chooseClose, IDLE_CLOSE, requestClose } from "./unsaved-close"
import type { WindowRenderer, WindowCloseGuard } from "@/platform/window"
import type { UnsavedCloseChoice, UnsavedCloseState } from "./unsaved-close"

/** Saves through the project's snapshot path and reports whether the project became clean. */
async function saveProject(): Promise<boolean> {
  projectActions.saveSnapshot()
  if (!(await whenProjectBackendIdle())) return false
  const { dirty, snapshotError } = useProjectState.getState().session
  return !dirty && snapshotError === null
}

/**
 * Vetoes closing a dirty project window and asks first. `renderer === null` (test roots and
 * renderers without the close-guard patch) leaves closing unguarded.
 */
export function useUnsavedCloseGuard(renderer: WindowRenderer | null) {
  const { t } = useAppTranslation()
  const [asking, setAsking] = useState(false)
  const state = useRef<UnsavedCloseState>(IDLE_CLOSE)
  const guard = useRef<WindowCloseGuard | null>(null)
  const labels = useRef(t)
  labels.current = t

  useLayoutEffect(() => {
    if (!renderer) return
    // The renderer keeps its predicate after unmount (the port has no unregister); a retired
    // guard therefore allows closing and never touches this component's state again.
    let isRetired = false
    const created = createWindowCloseGuard(renderer, {
      shouldClose() {
        if (isRetired) return true
        const result = requestClose(state.current, useProjectState.getState().session.dirty)
        state.current = result.next
        // AppKit is waiting on this answer; open the dialog right after it returns, committed
        // synchronously because the request arrives outside any React event.
        if (!result.allow) {
          queueMicrotask(() => {
            if (!isRetired) flushSync(() => setAsking(true))
          })
        }
        return result.allow
      },
    })
    guard.current = created
    return () => {
      isRetired = true
      if (guard.current === created) guard.current = null
    }
  }, [renderer])

  const choose = useCallback(async (choice: UnsavedCloseChoice) => {
    setAsking(false)
    const current = guard.current
    const saved = choice === "save" && (await saveProject())
    // Unmounted or replaced while saving: the decision belongs to a guard that no longer exists.
    if (current !== guard.current) return
    if (choice === "save" && !saved) toast.error(labels.current("windowClose.saveFailed"))
    state.current = chooseClose(state.current, choice, saved)
    if (state.current.phase !== "armed") return
    try {
      current?.close()
    } catch {
      toast.error(labels.current("windowClose.closeFailed"))
    }
  }, [])

  return { asking, choose }
}
