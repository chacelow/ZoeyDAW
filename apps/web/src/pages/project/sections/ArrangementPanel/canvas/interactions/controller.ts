import type {
  CanvasInteraction,
  CanvasMenuTarget,
  CanvasGesture,
  CanvasPointer,
  InteractionContext,
} from "./types"
import { canvasPointer } from "./coordinates"
import { hitTest } from "../hit-test"
import { createAutoScroll } from "./autoScroll"
import { createClipInteractions } from "./clip"
import { createRulerInteractions } from "./rulers"
import { createAutomationInteractions } from "./automation"
import { arrangementBodyTop } from "../layout"
import { isEditableTarget } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import { markDrawModeGesture } from "@/pages/project/sections/ArrangementPanel/Timeline/drawModeKey"
import { clipboardMemory } from "@/pages/project/adapters/clipboard-memory"
export interface CanvasController {
  contextTarget(event: MouseEvent): CanvasMenuTarget | null
  dispose(): void
}

export function createCanvasController(
  context: InteractionContext,
  setCursor: (cursor: CanvasGesture["cursor"] | null) => void
): CanvasController {
  const { element, scene, getState } = context
  const ruler = createRulerInteractions(context)
  const automation = createAutomationInteractions(context)
  const clip = createClipInteractions(context)
  let active: {
    gesture: CanvasGesture
    pointerId: number
    start: CanvasPointer
    owner: CanvasInteraction
    started: boolean
  } | null = null
  const scroll = createAutoScroll(context, pointer => {
    if (!active) return
    active.gesture.move(pointer)
    setCursor(active.gesture.cursor)
  })
  function isProtected(target: EventTarget | null) {
    return (
      isEditableTarget(target) ||
      (target instanceof Element &&
        !!target.closest('[data-clip-editor], [role="menu"], [role="menuitem"]'))
    )
  }
  function layers(pointer: CanvasPointer) {
    if (pointer.y < arrangementBodyTop()) return [ruler]
    if (!getState().workspace.automationMode) return [clip]
    return hitTest(scene.get(), pointer.x, pointer.y, true)?.kind === "clip-title"
      ? [clip]
      : [automation]
  }
  function deactivateOthers(owner: CanvasInteraction) {
    if (owner !== ruler) ruler.deactivate()
    if (owner !== automation) automation.deactivate()
    if (owner !== clip) clip.deactivate()
  }
  function finish(cancelled: boolean, pointerId?: number) {
    const current = active
    if (!current || (pointerId !== undefined && current.pointerId !== pointerId)) return
    active = null
    scroll.stop()
    setCursor(null)
    current.gesture.finish(cancelled)
    if (current.pointerId >= 0 && element.hasPointerCapture?.(current.pointerId))
      element.releasePointerCapture(current.pointerId)
  }
  function onDown(event: PointerEvent) {
    if (event.defaultPrevented || isProtected(event.target) || event.button !== 0 || active) return
    markDrawModeGesture()
    const pointer = canvasPointer(element, event)
    element.focus({ preventScroll: true })
    let owner: CanvasInteraction | null = null
    let gesture: CanvasGesture | null = null
    for (const layer of layers(pointer)) {
      gesture = layer.start(pointer)
      if (gesture) {
        owner = layer
        break
      }
    }
    if (owner) deactivateOthers(owner)
    else if (pointer.y >= arrangementBodyTop()) deactivateOthers(clip)
    if (!gesture || !owner) return
    active = { gesture, pointerId: pointer.pointerId, start: pointer, owner, started: false }
    if (pointer.pointerId >= 0) element.setPointerCapture?.(pointer.pointerId)
  }
  function onMove(event: PointerEvent) {
    const pointer = canvasPointer(element, event)
    if (!active) {
      let cursor: string | undefined
      for (const layer of layers(pointer)) {
        cursor = layer.hover(pointer)
        if (cursor) break
      }
      element.style.cursor = cursor ?? ""
      return
    }
    if (active.pointerId !== pointer.pointerId) return
    if (!active.started && Math.hypot(pointer.x - active.start.x, pointer.y - active.start.y) < 3)
      return
    if (!active.started) {
      active.started = true
      setCursor(active.gesture.cursor)
      if (active.gesture.autoScroll) scroll.start(element, pointer, active.gesture.autoScroll)
    }
    active.gesture.move(pointer)
    setCursor(active.gesture.cursor)
    if (active.gesture.autoScroll) scroll.update(pointer)
  }
  function onDoubleClick(event: MouseEvent) {
    if (event.defaultPrevented || isProtected(event.target)) return
    const pointer = canvasPointer(element, event)
    for (const layer of layers(pointer))
      if (layer.doubleClick(pointer)) {
        event.preventDefault()
        break
      }
  }
  function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented || isProtected(event.target)) return
    if (event.code === "Space" || event.key === " ") return
    if (event.key === "Escape" && active) {
      event.preventDefault()
      event.stopImmediatePropagation()
      finish(true)
      return
    }
    if (!element.contains(document.activeElement) && document.activeElement !== element) return
    if (active && ["Shift", "Alt", "Control", "Meta"].includes(event.key)) return
    if (active) finish(true)
    for (const layer of getState().workspace.automationMode ? [automation] : [ruler, clip])
      if (layer.keyDown(event)) {
        event.preventDefault()
        break
      }
  }
  function onClipboard(event: ClipboardEvent) {
    if (event.defaultPrevented || isProtected(event.target)) return
    if (!element.contains(document.activeElement) && document.activeElement !== element) return
    if (event.type === "paste" && event.clipboardData)
      clipboardMemory.write(
        event.clipboardData.getData("text/plain") ||
          event.clipboardData.getData("application/x-zoeymind-clips+json") ||
          event.clipboardData.getData("application/x-zoeymind-automation+json")
      )
    const operation = event.type === "copy" ? "copy" : event.type === "cut" ? "cut" : "paste"
    const ordered = getState().workspace.automationMode ? [automation] : [clip]
    if (active) finish(true)
    for (const layer of ordered)
      if (layer[operation]?.(event)) {
        event.preventDefault()
        break
      }
  }
  function onLeave() {
    if (active) return
    element.style.cursor = ""
    scene.setHover(null)
  }
  const onUp = (event: PointerEvent) => {
    const pointer = canvasPointer(element, event)
    if (active?.started && active.pointerId === pointer.pointerId) active.gesture.move(pointer)
    finish(false, pointer.pointerId)
  }
  const onCancel = (event: PointerEvent) =>
    finish(!(active?.gesture.commitOnInterrupt && active.started), event.pointerId)
  const onBlur = () => finish(!(active?.gesture.commitOnInterrupt && active.started))
  element.addEventListener("pointerdown", onDown)
  element.addEventListener("pointermove", onMove)
  element.addEventListener("pointerup", onUp)
  element.addEventListener("pointercancel", onCancel)
  element.addEventListener("lostpointercapture", onCancel)
  element.addEventListener("pointerleave", onLeave)
  element.addEventListener("dblclick", onDoubleClick)
  window.addEventListener("keydown", onKey, true)
  window.addEventListener("copy", onClipboard, true)
  window.addEventListener("cut", onClipboard, true)
  window.addEventListener("paste", onClipboard, true)
  window.addEventListener("blur", onBlur)
  return {
    contextTarget(event: MouseEvent): CanvasMenuTarget | null {
      if (event.defaultPrevented || isProtected(event.target)) return null
      finish(true)
      const pointer = canvasPointer(element, event)
      for (const layer of layers(pointer)) {
        const target = layer.contextMenu(pointer)
        if (target) {
          deactivateOthers(layer)
          return target
        }
      }
      return null
    },
    dispose() {
      element.removeEventListener("pointerdown", onDown)
      element.removeEventListener("pointermove", onMove)
      element.removeEventListener("pointerup", onUp)
      element.removeEventListener("pointercancel", onCancel)
      element.removeEventListener("lostpointercapture", onCancel)
      element.removeEventListener("pointerleave", onLeave)
      element.removeEventListener("dblclick", onDoubleClick)
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("copy", onClipboard, true)
      window.removeEventListener("cut", onClipboard, true)
      window.removeEventListener("paste", onClipboard, true)
      window.removeEventListener("blur", onBlur)
      finish(true)
      scroll.stop()
      element.style.cursor = ""
      clip.dispose?.()
      ruler.dispose?.()
      automation.dispose?.()
    },
  }
}
