import type { EventPayload, NativeRenderer } from "@gpuix/react"
import type { EntryEdge, MenuEntry, MenuState } from "./model"

export function focusEntry(
  entries: Map<number, MenuEntry>,
  renderer: NativeRenderer | null,
  edge: EntryEdge
) {
  const enabled = [...entries.values()].filter(entry => !entry.disabled)
  const entry = edge === "first" ? enabled[0] : enabled.at(-1)
  if (entry) {
    renderer?.focusElement?.(entry.instance.id)
    entry.instance.scrollIntoView?.()
    return true
  }
  return false
}

export function finishSelection(menu: MenuState, renderer: NativeRenderer | null) {
  menu.closeAll()
  let root = menu
  while (root.parent) root = root.parent
  if (root.trigger.current) renderer?.focusElement?.(root.trigger.current.id)
}

export function navigate(
  menu: MenuState,
  renderer: NativeRenderer | null,
  event: EventPayload
): boolean {
  const key = event.key?.toLowerCase()
  const activeChild = menu.activeChild.current
  if (
    activeChild?.open &&
    (key === "escape" || key === "esc" || key === "left" || key === "arrowleft")
  )
    return navigate(activeChild, renderer, event)
  if (
    key === "escape" ||
    key === "esc" ||
    (menu.parent && (key === "left" || key === "arrowleft"))
  ) {
    menu.setOpen(false)
    if (menu.trigger.current) renderer?.focusElement?.(menu.trigger.current.id)
    return true
  }
  if (key === "tab") {
    menu.closeAll()
    return true
  }
  if (key === "home" || key === "end") {
    focusEntry(menu.entries, renderer, key === "home" ? "first" : "last")
    return true
  }
  const direction =
    key === "down" || key === "arrowdown" ? 1 : key === "up" || key === "arrowup" ? -1 : 0
  if (!direction) return false
  const enabled = [...menu.entries.values()].filter(entry => !entry.disabled)
  const index = enabled.findIndex(entry => entry.instance.id === event.elementId)
  const next =
    index === -1
      ? direction > 0
        ? 0
        : enabled.length - 1
      : (index + direction + enabled.length) % enabled.length
  const entry = enabled[next]
  if (entry) {
    renderer?.focusElement?.(entry.instance.id)
    entry.instance.scrollIntoView?.()
  }
  return true
}

export function isActivation(event: EventPayload) {
  const key = event.key?.toLowerCase()
  return key === "enter" || key === "space" || key === " "
}
