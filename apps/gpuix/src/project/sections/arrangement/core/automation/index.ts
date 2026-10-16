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
): "automationDraw" | "grab" | "verticalResize" | undefined {
  if (drawMode && hit) return "automationDraw"
  return hit?.kind === "point" ? "grab" : hit?.kind === "segment" ? "verticalResize" : undefined
}
