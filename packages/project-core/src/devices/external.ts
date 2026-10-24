export interface ExternalPluginIdentity {
  catalogId: string
  format: "clap" | "vst3" | "audioUnit"
  classId: string
  name: string
  vendor: string
  version: string
  role: "effect" | "instrument"
}

export interface PluginStateRef {
  sha256: string
  path: string
}

export interface ExternalParameterValue {
  id: string
  normalized: number
}

export interface ExternalDeviceSettings {
  kind: "external"
  plugin: ExternalPluginIdentity
  stateRef: PluginStateRef | null
  parameters: ExternalParameterValue[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isNativeParameterId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9][0-9]{0,19})$/.test(value) &&
    (value.length < 20 || value <= "18446744073709551615")
  )
}

export function isExternalPluginIdentity(value: unknown): value is ExternalPluginIdentity {
  return (
    record(value) &&
    Object.keys(value).length === 7 &&
    typeof value.catalogId === "string" &&
    /^[a-f0-9]{64}$/.test(value.catalogId) &&
    (value.format === "clap" || value.format === "vst3" || value.format === "audioUnit") &&
    typeof value.classId === "string" &&
    value.classId.length > 0 &&
    typeof value.name === "string" &&
    typeof value.vendor === "string" &&
    typeof value.version === "string" &&
    (value.role === "effect" || value.role === "instrument")
  )
}

export function isPluginStateRef(value: unknown): value is PluginStateRef {
  return (
    record(value) &&
    Object.keys(value).length === 2 &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    !value.path.includes("\0")
  )
}

export function isExternalParameters(value: unknown): value is ExternalParameterValue[] {
  if (!Array.isArray(value) || value.length > 4096) return false
  const ids = new Set<string>()
  for (const parameter of value) {
    if (
      !record(parameter) ||
      Object.keys(parameter).length !== 2 ||
      !isNativeParameterId(parameter.id) ||
      ids.has(parameter.id) ||
      typeof parameter.normalized !== "number" ||
      !Number.isFinite(parameter.normalized) ||
      parameter.normalized < 0 ||
      parameter.normalized > 1
    )
      return false
    ids.add(parameter.id)
  }
  return true
}
