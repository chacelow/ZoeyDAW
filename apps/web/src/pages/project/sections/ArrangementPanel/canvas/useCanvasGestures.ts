import { useEffect, useRef, useState, type RefObject } from "react"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { useGestureCursor, type GestureCursor } from "../useGestureCursor"
import { arrangementScene } from "./scene"
import type { CanvasMenuTarget } from "./interactions/types"
import { createCanvasController, type CanvasController } from "./interactions/controller"

export function useCanvasGestures(container: RefObject<HTMLElement | null>) {
  const [cursor, setCursor] = useState<GestureCursor | null>(null)
  const controller = useRef<CanvasController | null>(null)
  useGestureCursor(cursor)
  useEffect(() => {
    const element = container.current
    if (!element) return
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
  }, [container])
  return {
    contextTarget(event: MouseEvent): CanvasMenuTarget | null {
      return controller.current?.contextTarget(event) ?? null
    },
  }
}
