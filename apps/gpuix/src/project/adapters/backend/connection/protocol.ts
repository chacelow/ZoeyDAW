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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

export function validFrame(value: unknown, sessionId: string): value is BackendTelemetry {
  if (
    !record(value) ||
    value.sessionId !== sessionId ||
    !nonnegativeInteger(value.sequence) ||
    !nonnegativeInteger(value.appliedSequence) ||
    typeof value.playing !== "boolean" ||
    typeof value.recording !== "boolean" ||
    !(value.outputLatencyFrames === null || nonnegativeInteger(value.outputLatencyFrames))
  ) {
    return false
  }
  const { clock } = value
  if (
    !record(clock) ||
    (clock.kind !== "musical" && clock.kind !== "sample") ||
    typeof clock.bar !== "number" ||
    !Number.isFinite(clock.bar) ||
    clock.bar < 1 ||
    typeof clock.barsPerSecond !== "number" ||
    !Number.isFinite(clock.barsPerSecond) ||
    clock.barsPerSecond < 0
  ) {
    return false
  }
  if (
    clock.kind === "sample" &&
    (!nonnegativeInteger(clock.frame) ||
      typeof clock.sampleRate !== "number" ||
      !Number.isFinite(clock.sampleRate) ||
      clock.sampleRate <= 0)
  ) {
    return false
  }
  return (
    record(value.levels) &&
    Object.values(value.levels).every(
      pair =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every(level => typeof level === "number" && Number.isFinite(level))
    )
  )
}
