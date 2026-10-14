import type { BackendResult, BackendTelemetry } from "../../../model/backend"

export function validResult(value: unknown): value is BackendResult {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    !("sessionId" in value) ||
    typeof value.sessionId !== "string" ||
    !("sequence" in value) ||
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(value.sequence)
  ) {
    return false
  }
  return value.kind === "accepted"
    ? "revision" in value &&
        typeof value.revision === "number" &&
        Number.isSafeInteger(value.revision) &&
        value.revision >= 0
    : value.kind === "rejected" &&
        "code" in value &&
        (value.code === "rejected" ||
          value.code === "connection" ||
          value.code === "protocol" ||
          value.code === "disposed")
}

export function validFrame(value: BackendTelemetry, sessionId: string): boolean {
  if (
    !value ||
    value.sessionId !== sessionId ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0 ||
    !Number.isSafeInteger(value.appliedSequence) ||
    value.appliedSequence < 0 ||
    typeof value.playing !== "boolean" ||
    typeof value.recording !== "boolean"
  ) {
    return false
  }
  const { clock } = value
  if (
    !clock ||
    (clock.kind !== "musical" && clock.kind !== "sample") ||
    !Number.isFinite(clock.bar) ||
    clock.bar < 1 ||
    !Number.isFinite(clock.barsPerSecond) ||
    clock.barsPerSecond < 0
  ) {
    return false
  }
  if (
    clock.kind === "sample" &&
    (!Number.isSafeInteger(clock.frame) ||
      clock.frame < 0 ||
      !Number.isFinite(clock.sampleRate) ||
      clock.sampleRate <= 0)
  ) {
    return false
  }
  return typeof value.levels !== "object" || value.levels === null
    ? false
    : Object.values(value.levels).every(
        pair =>
          Array.isArray(pair) && pair.length === 2 && pair.every(level => Number.isFinite(level))
      )
}
