import { uniqueId } from "../reducers"

interface DeviceBase {
  id: string
  enabled: boolean
  collapsed: boolean
}

export type Device =
  | (DeviceBase & { kind: "utility"; gainDb: number; pan: number; width: number })
  | (DeviceBase & { kind: "filter"; frequency: number; resonance: number })
  | (DeviceBase & { kind: "delay"; timeMs: number; feedback: number; mix: number })
  | (DeviceBase & { kind: "reverb"; decay: number; size: number; mix: number })

export type DeviceKind = Device["kind"]
export const DEVICE_KINDS: readonly DeviceKind[] = ["utility", "filter", "delay", "reverb"]

export const DEVICE_PARAMETERS = {
  gainDb: { min: -60, max: 24, step: 0.1, defaultValue: 0, unit: "db" },
  pan: { min: -1, max: 1, step: 0.01, defaultValue: 0, unit: "pan" },
  width: { min: 0, max: 200, step: 1, defaultValue: 100, unit: "percent" },
  frequency: { min: 20, max: 20000, step: 1, defaultValue: 1000, unit: "hz" },
  resonance: { min: 0, max: 1, step: 0.01, defaultValue: 0.2, unit: "ratioPercent" },
  timeMs: { min: 1, max: 2000, step: 1, defaultValue: 250, unit: "ms" },
  feedback: { min: 0, max: 0.95, step: 0.01, defaultValue: 0.35, unit: "ratioPercent" },
  mix: { min: 0, max: 1, step: 0.01, defaultValue: 0.25, unit: "ratioPercent" },
  decay: { min: 0.1, max: 20, step: 0.1, defaultValue: 2.5, unit: "seconds" },
  size: { min: 0, max: 1, step: 0.01, defaultValue: 0.5, unit: "ratioPercent" },
} satisfies Record<
  string,
  { min: number; max: number; step: number; defaultValue: number; unit: string }
>

export type DeviceParameter = keyof typeof DEVICE_PARAMETERS

export function deviceParameterKeys(device: Device): readonly DeviceParameter[] {
  switch (device.kind) {
    case "utility":
      return ["gainDb", "pan", "width"]
    case "filter":
      return ["frequency", "resonance"]
    case "delay":
      return ["timeMs", "feedback", "mix"]
    case "reverb":
      return ["decay", "size", "mix"]
  }
}

export function deviceParameterValue(device: Device, field: DeviceParameter): number | undefined {
  switch (field) {
    case "gainDb":
      return device.kind === "utility" ? device.gainDb : undefined
    case "pan":
      return device.kind === "utility" ? device.pan : undefined
    case "width":
      return device.kind === "utility" ? device.width : undefined
    case "frequency":
      return device.kind === "filter" ? device.frequency : undefined
    case "resonance":
      return device.kind === "filter" ? device.resonance : undefined
    case "timeMs":
      return device.kind === "delay" ? device.timeMs : undefined
    case "feedback":
      return device.kind === "delay" ? device.feedback : undefined
    case "mix":
      return device.kind === "delay" || device.kind === "reverb" ? device.mix : undefined
    case "decay":
      return device.kind === "reverb" ? device.decay : undefined
    case "size":
      return device.kind === "reverb" ? device.size : undefined
  }
}

export function withDeviceParameter(device: Device, field: DeviceParameter, value: number): Device {
  if (
    deviceParameterValue(device, field) === value ||
    !deviceParameterKeys(device).includes(field) ||
    !within(value, DEVICE_PARAMETERS[field])
  ) {
    return device
  }
  const next = { ...device, [field]: value }
  return isDevice(next) ? next : device
}

export function createDevice(kind: DeviceKind): Device {
  const base = { id: uniqueId("device"), enabled: true, collapsed: false }
  switch (kind) {
    case "utility":
      return {
        ...base,
        kind,
        gainDb: DEVICE_PARAMETERS.gainDb.defaultValue,
        pan: DEVICE_PARAMETERS.pan.defaultValue,
        width: DEVICE_PARAMETERS.width.defaultValue,
      }
    case "filter":
      return {
        ...base,
        kind,
        frequency: DEVICE_PARAMETERS.frequency.defaultValue,
        resonance: DEVICE_PARAMETERS.resonance.defaultValue,
      }
    case "delay":
      return {
        ...base,
        kind,
        timeMs: DEVICE_PARAMETERS.timeMs.defaultValue,
        feedback: DEVICE_PARAMETERS.feedback.defaultValue,
        mix: DEVICE_PARAMETERS.mix.defaultValue,
      }
    case "reverb":
      return {
        ...base,
        kind,
        decay: DEVICE_PARAMETERS.decay.defaultValue,
        size: DEVICE_PARAMETERS.size.defaultValue,
        mix: DEVICE_PARAMETERS.mix.defaultValue,
      }
  }
}

function within(value: unknown, bounds: { min: number; max: number }): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= bounds.min &&
    value <= bounds.max
  )
}

function onlyKeys(value: object, fields: readonly string[]): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === fields.length + 4 &&
    keys.every(
      key =>
        key === "id" ||
        key === "kind" ||
        key === "enabled" ||
        key === "collapsed" ||
        fields.includes(key)
    )
  )
}

export function isDevice(value: unknown): value is Device {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    !("enabled" in value) ||
    typeof value.enabled !== "boolean" ||
    !("collapsed" in value) ||
    typeof value.collapsed !== "boolean" ||
    !("kind" in value)
  )
    return false
  switch (value.kind) {
    case "utility":
      return (
        onlyKeys(value, ["gainDb", "pan", "width"]) &&
        "gainDb" in value &&
        within(value.gainDb, DEVICE_PARAMETERS.gainDb) &&
        "pan" in value &&
        within(value.pan, DEVICE_PARAMETERS.pan) &&
        "width" in value &&
        within(value.width, DEVICE_PARAMETERS.width)
      )
    case "filter":
      return (
        onlyKeys(value, ["frequency", "resonance"]) &&
        "frequency" in value &&
        within(value.frequency, DEVICE_PARAMETERS.frequency) &&
        "resonance" in value &&
        within(value.resonance, DEVICE_PARAMETERS.resonance)
      )
    case "delay":
      return (
        onlyKeys(value, ["timeMs", "feedback", "mix"]) &&
        "timeMs" in value &&
        within(value.timeMs, DEVICE_PARAMETERS.timeMs) &&
        "feedback" in value &&
        within(value.feedback, DEVICE_PARAMETERS.feedback) &&
        "mix" in value &&
        within(value.mix, DEVICE_PARAMETERS.mix)
      )
    case "reverb":
      return (
        onlyKeys(value, ["decay", "size", "mix"]) &&
        "decay" in value &&
        within(value.decay, DEVICE_PARAMETERS.decay) &&
        "size" in value &&
        within(value.size, DEVICE_PARAMETERS.size) &&
        "mix" in value &&
        within(value.mix, DEVICE_PARAMETERS.mix)
      )
    default:
      return false
  }
}
