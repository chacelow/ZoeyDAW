import type {
  BackendNoteResult,
  BackendResult,
  BackendTelemetry,
} from "@zoeydaw/project-core/backend"

export function controlGenerationValue(value: unknown): bigint | null {
  if (typeof value !== "string" || value.length > 20 || !/^(0|[1-9][0-9]*)$/.test(value))
    return null
  const parsed = BigInt(value)
  return parsed <= (1n << 64n) - 1n ? parsed : null
}
function validIdentity(
  value: unknown
): value is { kind: unknown; sessionId: string; sequence: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "sequence" in value &&
    typeof value.sequence === "number" &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence >= 0
  )
}
function validFailure(value: unknown): boolean {
  return (
    value === "rejected" || value === "connection" || value === "protocol" || value === "disposed"
  )
}
export function validNoteResult(value: unknown): value is BackendNoteResult {
  return (
    validIdentity(value) &&
    value.sequence > 0 &&
    (value.kind === "accepted" ||
      (value.kind === "rejected" &&
        "code" in value &&
        (validFailure(value.code) || value.code === "note-overrun")))
  )
}
export function validResult(value: unknown): value is BackendResult {
  if (
    !validIdentity(value) ||
    !("controlGeneration" in value) ||
    controlGenerationValue(value.controlGeneration) === null
  )
    return false
  return value.kind === "accepted"
    ? "revision" in value &&
        typeof value.revision === "number" &&
        Number.isSafeInteger(value.revision) &&
        value.revision >= 0
    : value.kind === "rejected" &&
        "code" in value &&
        (validFailure(value.code) || value.code === "superseded-open")
}
export function validFrame(value: BackendTelemetry, sessionId: string): boolean {
  if (
    !value ||
    value.sessionId !== sessionId ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0 ||
    !Number.isSafeInteger(value.appliedSequence) ||
    value.appliedSequence < 0 ||
    controlGenerationValue(value.controlGeneration) === null ||
    typeof value.playing !== "boolean" ||
    typeof value.recording !== "boolean"
  )
    return false
  const { clock } = value
  if (
    !clock ||
    (clock.kind !== "musical" && clock.kind !== "sample") ||
    !Number.isFinite(clock.bar) ||
    clock.bar < 1 ||
    !Number.isFinite(clock.barsPerSecond) ||
    clock.barsPerSecond < 0
  )
    return false
  if (
    clock.kind === "sample" &&
    (!Number.isSafeInteger(clock.frame) ||
      clock.frame < 0 ||
      !Number.isFinite(clock.sampleRate) ||
      clock.sampleRate <= 0)
  )
    return false
  return true
}
