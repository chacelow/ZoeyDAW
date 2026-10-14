import type { AutomationPoint } from "../../../../model/types"

export const AUTOMATION_MIME = "application/x-zoeymind-automation+json"

export interface AutomationClipboard {
  parameter: "volume" | "pan"
  points: AutomationPoint[]
}

export function parseAutomationClipboard(raw: string): AutomationClipboard | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("kind" in parsed) ||
    parsed.kind !== "automation" ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("parameter" in parsed) ||
    (parsed.parameter !== "volume" && parsed.parameter !== "pan") ||
    !("points" in parsed) ||
    !Array.isArray(parsed.points)
  )
    return null
  const ids = new Set<string>()
  const points: AutomationPoint[] = []
  for (const item of parsed.points) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string" ||
      ids.has(item.id) ||
      !("bar" in item) ||
      typeof item.bar !== "number" ||
      !Number.isFinite(item.bar) ||
      item.bar < 1 ||
      !("value" in item) ||
      typeof item.value !== "number" ||
      !Number.isFinite(item.value) ||
      item.value < 0 ||
      item.value > 1 ||
      ("curve" in item &&
        (typeof item.curve !== "number" ||
          !Number.isFinite(item.curve) ||
          item.curve < -1 ||
          item.curve > 1))
    )
      return null
    ids.add(item.id)
    points.push({
      id: item.id,
      bar: item.bar,
      value: item.value,
      ...("curve" in item && typeof item.curve === "number" && { curve: item.curve }),
    })
  }
  points.sort((a, b) => a.bar - b.bar)
  return points.length &&
    points.every((point, index) => index === 0 || point.bar - points[index - 1].bar >= 0.000001)
    ? { parameter: parsed.parameter, points }
    : null
}
