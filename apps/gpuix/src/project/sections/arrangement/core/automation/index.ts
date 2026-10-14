import type { AutomationHit } from "./hit"

export type AutomationAction = "draw" | "point" | "segment" | "flat" | "marquee"

export function automationAction(
  hit: AutomationHit | null,
  drawMode: boolean,
  button: number
): AutomationAction | null {
  if (!hit || button !== 0) return null
  if (drawMode) return "draw"
  if (hit.kind === "point" || hit.kind === "segment") return hit.kind
  return hit.onLine ? "flat" : "marquee"
}

export function automationCursor(
  hit: AutomationHit | null,
  drawMode: boolean
): "crosshair" | "grab" | "ns-resize" | undefined {
  if (drawMode && hit) return "crosshair"
  return hit?.kind === "point" ? "grab" : hit?.kind === "segment" ? "ns-resize" : undefined
}
