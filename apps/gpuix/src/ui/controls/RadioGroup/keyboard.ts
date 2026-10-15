import type { EventPayload, NativeRenderer, PublicInstance } from "@gpuix/react"

export interface SelectionEntry {
  value: string
  disabled: boolean
  node: PublicInstance
}

export function navigateSelection({
  event,
  value,
  entries,
  renderer,
  orientation,
  select,
}: {
  event: EventPayload
  value: string
  entries: Map<string, SelectionEntry>
  renderer: NativeRenderer | null
  orientation: "horizontal" | "vertical"
  select?: (value: string) => void
}) {
  const key = event.key?.toLowerCase()
  const backward = key === (orientation === "horizontal" ? "left" : "up")
  const forward = key === (orientation === "horizontal" ? "right" : "down")
  if (!backward && !forward && key !== "home" && key !== "end") return
  const enabled = [...entries.values()].filter(entry => !entry.disabled)
  enabled.sort((a, b) => {
    const first = renderer?.getElementBounds?.(a.node.id)
    const second = renderer?.getElementBounds?.(b.node.id)
    if (!first || !second) return 0
    return orientation === "vertical"
      ? first.y - second.y || first.x - second.x
      : first.x - second.x || first.y - second.y
  })
  const index = enabled.findIndex(entry => entry.value === value)
  const target =
    key === "home"
      ? enabled[0]
      : key === "end"
        ? enabled.at(-1)
        : enabled[(index + (backward ? -1 : 1) + enabled.length) % enabled.length]
  if (!target) return
  event.preventDefault()
  event.stopPropagation()
  renderer?.focusElement?.(target.node.id)
  select?.(target.value)
}

export function isActivationKey(event: EventPayload) {
  return event.key === "enter" || event.key === "space" || event.key === " "
}
