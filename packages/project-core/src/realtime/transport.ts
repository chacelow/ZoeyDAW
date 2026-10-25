import {
  HEADER_FLAGS_PLAYING,
  HEADER_FLAGS_RECORDING,
  TRANSPORT_FLAGS_AUDIBLE_VALID,
  TRANSPORT_FLAGS_CONTROL_VALID,
  TRANSPORT_KINDS_AUDIO,
  TRANSPORT_KINDS_STOPPED,
  TRANSPORT_KINDS_UNAVAILABLE,
  type WireHeader,
} from "./protocol.generated"

type MusicalPosition = Pick<WireHeader, "bar" | "barsPerSecond">
type ControlIdentity = Pick<WireHeader, "controlGeneration" | "appliedSequence" | "ownerEpoch">
export type RealtimeTransport =
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "stopped"
      readonly position: MusicalPosition
      readonly control: ControlIdentity
    }
  | {
      readonly kind: "audio"
      readonly rendered: MusicalPosition
      readonly audible: MusicalPosition | null
      readonly control: ControlIdentity | null
      readonly clock: Pick<WireHeader, "timeSamples" | "sampleRate">
      readonly observedMonotonicNs: bigint
      readonly playing: boolean
      readonly recording: boolean
    }

export function decodeTransport(header: WireHeader): RealtimeTransport | null {
  const flags = header.transportFlags
  if ((flags & ~(TRANSPORT_FLAGS_CONTROL_VALID | TRANSPORT_FLAGS_AUDIBLE_VALID)) !== 0) return null
  const control =
    (flags & TRANSPORT_FLAGS_CONTROL_VALID) !== 0
      ? {
          controlGeneration: header.controlGeneration,
          appliedSequence: header.appliedSequence,
          ownerEpoch: header.ownerEpoch,
        }
      : null
  if (
    control
      ? control.ownerEpoch === 0n
      : header.controlGeneration !== 0n || header.appliedSequence !== 0n || header.ownerEpoch !== 0n
  )
    return null
  const position = { bar: header.bar, barsPerSecond: header.barsPerSecond }
  const validPosition =
    Number.isFinite(position.bar) &&
    Number.isFinite(position.barsPerSecond) &&
    position.barsPerSecond > 0
  const audibleValid = (flags & TRANSPORT_FLAGS_AUDIBLE_VALID) !== 0
  const audible = audibleValid
    ? { bar: header.audibleBar, barsPerSecond: header.audibleBarsPerSecond }
    : null
  if (
    audible
      ? !Number.isFinite(audible.bar) ||
        !Number.isFinite(audible.barsPerSecond) ||
        audible.barsPerSecond <= 0
      : header.audibleBar !== 0 || header.audibleBarsPerSecond !== 0
  )
    return null
  if (header.observedMonotonicNs > header.producedMonotonicNs) return null
  if (header.transportKind === TRANSPORT_KINDS_AUDIO) {
    if (
      !validPosition ||
      !Number.isFinite(header.sampleRate) ||
      header.sampleRate <= 0 ||
      !Number.isFinite(header.timelineBeat) ||
      !Number.isFinite(header.tempoBpm) ||
      header.tempoBpm < 20 ||
      header.tempoBpm > 999
    )
      return null
    return {
      kind: "audio",
      rendered: position,
      audible,
      control,
      clock: { timeSamples: header.timeSamples, sampleRate: header.sampleRate },
      observedMonotonicNs: header.observedMonotonicNs,
      playing: (header.flags & HEADER_FLAGS_PLAYING) !== 0,
      recording: (header.flags & HEADER_FLAGS_RECORDING) !== 0,
    }
  }
  if (
    header.sampleRate !== 0 ||
    header.timeSamples !== 0n ||
    header.timelineSample !== 0n ||
    header.timelineBeat !== 0 ||
    header.tempoBpm !== 0 ||
    audible !== null ||
    (header.flags & (HEADER_FLAGS_PLAYING | HEADER_FLAGS_RECORDING)) !== 0
  )
    return null
  if (header.transportKind === TRANSPORT_KINDS_STOPPED) {
    if (!control || !validPosition) return null
    return { kind: "stopped", position, control }
  }
  if (
    header.transportKind !== TRANSPORT_KINDS_UNAVAILABLE ||
    control !== null ||
    header.bar !== 0 ||
    header.barsPerSecond !== 0 ||
    header.observedMonotonicNs !== 0n
  )
    return null
  return { kind: "unavailable" }
}
