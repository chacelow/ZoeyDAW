import { DEVICE_PARAMETERS } from "@zoeydaw/project-core/devices"
import type { DeviceParameter } from "@zoeydaw/project-core/devices"
import type { AutomationPoint, AutomationTarget } from "@zoeydaw/project-core/types"

export const AUTOMATION_MIME = "application/x-zoeymind-automation+json"

export interface AutomationClipboard {
  target: AutomationTarget
  points: AutomationPoint[]
}

function isDeviceParameter(value: string): value is DeviceParameter {
  return Object.prototype.hasOwnProperty.call(DEVICE_PARAMETERS, value)
}

function clipboardTarget(value: unknown): AutomationTarget | null {
  if (typeof value !== "object" || value === null || !("kind" in value) || !("parameter" in value))
    return null
  if (
    value.kind === "mixer" &&
    (value.parameter === "volume" || value.parameter === "pan") &&
    Object.keys(value).length === 2
  )
    return { kind: "mixer", parameter: value.parameter }
  if (
    value.kind !== "device" ||
    !("deviceId" in value) ||
    typeof value.deviceId !== "string" ||
    typeof value.parameter !== "string" ||
    !isDeviceParameter(value.parameter) ||
    Object.keys(value).length !== 3
  )
    return null
  return { kind: "device", deviceId: value.deviceId, parameter: value.parameter }
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
    parsed.version !== 2 ||
    !("target" in parsed) ||
    !clipboardTarget(parsed.target) ||
    !("points" in parsed) ||
    !Array.isArray(parsed.points)
  ) {
    return null
  }
  const target = clipboardTarget(parsed.target)
  if (!target) return null
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
    ) {
      return null
    }
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
    ? { target, points }
    : null
}
