import { DEVICE_PARAMETERS, deviceParameterKeys, deviceParameterValue, isDevice } from "./devices"
import type { AutomationTarget, Track } from "./types"

export function sameAutomationTarget(a: AutomationTarget, b: AutomationTarget): boolean {
  return (
    a.kind === b.kind &&
    a.parameter === b.parameter &&
    (a.kind === "mixer" || (b.kind === "device" && a.deviceId === b.deviceId))
  )
}

export function isAutomationTarget(
  value: unknown,
  track: { kind?: unknown; devices?: unknown }
): value is AutomationTarget {
  if (typeof value !== "object" || value === null || !("kind" in value) || !("parameter" in value))
    return false
  if (value.kind === "mixer") {
    return (
      (track.kind === "audio" ||
        track.kind === "group" ||
        track.kind === "return" ||
        track.kind === "main") &&
      (value.parameter === "volume" || value.parameter === "pan") &&
      Object.keys(value).length === 2
    )
  }
  if (
    value.kind !== "device" ||
    !("deviceId" in value) ||
    typeof value.deviceId !== "string" ||
    !value.deviceId ||
    typeof value.parameter !== "string" ||
    Object.keys(value).length !== 3
  )
    return false
  const device = Array.isArray(track.devices)
    ? track.devices.find(item => isDevice(item) && item.id === value.deviceId)
    : undefined
  return (
    !!device && isDevice(device) && deviceParameterKeys(device).some(key => key === value.parameter)
  )
}
export function selectedAutomationTarget(
  track: Track,
  selected: AutomationTarget | null | undefined
): AutomationTarget | null {
  if (selected !== undefined)
    return selected && isAutomationTarget(selected, track) ? selected : null
  return track.automation.find(lane => isAutomationTarget(lane.target, track))?.target ?? null
}

export function automationTargetKey(target: AutomationTarget): string {
  return target.kind === "mixer"
    ? `mixer:${target.parameter}`
    : `device:${target.deviceId}:${target.parameter}`
}
export function automationLaneId(trackId: string, target: AutomationTarget): string {
  return `${trackId}-${target.kind}-${target.kind === "device" ? `${target.deviceId}-` : ""}${target.parameter}`
}
export function resolveAutomationTarget(
  track: Track,
  laneId: string,
  selected: AutomationTarget | null | undefined,
  displayed: readonly AutomationTarget[]
): AutomationTarget | null {
  const lane = track.automation.find(item => item.id === laneId)
  if (lane) return isAutomationTarget(lane.target, track) ? lane.target : null
  const target = [selected, ...displayed].find(
    item => item && automationLaneId(track.id, item) === laneId
  )
  return target && isAutomationTarget(target, track) ? target : null
}

export function automationTargetSource(track: Track, target: AutomationTarget): number {
  if (target.kind === "mixer") return target.parameter === "volume" ? track.volumeDb : track.pan
  const device = track.devices?.find(item => item.id === target.deviceId)
  return (
    (device && deviceParameterValue(device, target.parameter)) ??
    DEVICE_PARAMETERS[target.parameter].defaultValue
  )
}

export function automationTargetBounds(target: AutomationTarget): { min: number; max: number } {
  if (target.kind === "mixer")
    return target.parameter === "volume" ? { min: -60, max: 6 } : { min: -1, max: 1 }
  return DEVICE_PARAMETERS[target.parameter]
}
