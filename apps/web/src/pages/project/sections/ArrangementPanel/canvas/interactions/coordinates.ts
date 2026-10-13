import type { CanvasPointer, InteractionContext } from "./types"
import { snapBar } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"

export function canvasPointer(
  element: HTMLElement,
  event: MouseEvent | PointerEvent
): CanvasPointer {
  const rect = element.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerId: "pointerId" in event && typeof event.pointerId === "number" ? event.pointerId : -1,
    button: event.button,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
  }
}
export function barAtX(context: InteractionContext, x: number): number {
  const { viewport } = context.scene.get()
  return 1 + (x + viewport.scrollX) / viewport.pxPerBar
}
export function snappedBar(context: InteractionContext, bar: number, bypass = false): number {
  const { workspace } = context.getState()
  return snapBar(
    bar,
    workspace.snap,
    context.scene.get().gridPlan.cellBars,
    context.scene.get().bars + 1,
    bypass
  )
}
