import type { EventPayload } from "@gpuix/react"
import type { Pointer } from "../../core/interactions/types"

export interface NativeTimelinePointer extends Pointer {
  windowX: number
  windowY: number
  ctrlKey: boolean
}

export function timelinePointer(
  event: EventPayload,
  bounds: { x: number; y: number }
): NativeTimelinePointer {
  const windowX = event.x ?? bounds.x
  const windowY = event.y ?? bounds.y
  return {
    x: windowX - bounds.x,
    y: windowY - bounds.y,
    windowX,
    windowY,
    button: event.button ?? event.pressedButton ?? 0,
    shiftKey: event.modifiers?.shift ?? false,
    altKey: event.modifiers?.alt ?? false,
    metaKey: event.modifiers?.cmd ?? false,
    ctrlKey: event.modifiers?.ctrl ?? false,
  }
}
