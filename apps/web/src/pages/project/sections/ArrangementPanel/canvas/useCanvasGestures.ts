import { useEffect, useRef, useState } from "react"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { useGestureCursor } from "../useGestureCursor"
import { arrangementScene } from "./scene"
import { createCanvasController } from "./interactions/controller"
import type { CanvasController } from "./interactions/controller"
import type { GestureCursor } from "../useGestureCursor"
import type { RefObject } from "react"
import type { CanvasMenuTarget } from "./interactions/types"

export function useCanvasGestures(container: RefObject<HTMLElement | null>) {
  const [cursor, setCursor] = useState<GestureCursor | null>(null)
  const controller = useRef<CanvasController | null>(null)
  const epoch = useProjectState(state => state.session.editEpoch)
  useGestureCursor(cursor)
  useEffect(() => {
    const element = container.current
    if (!element) {
      return
    }
    const active = createCanvasController(
      {
        element,
        scene: arrangementScene,
        actions: projectActions,
        getState: useProjectState.getState,
      },
      setCursor
    )
    controller.current = active
    return () => {
      controller.current = null
      active.dispose()
    }
  }, [container, epoch])
  return {
    contextTarget: (event: MouseEvent): CanvasMenuTarget | null =>
      controller.current?.contextTarget(event) ?? null,
  }
}
