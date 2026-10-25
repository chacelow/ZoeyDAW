import type { MeterSnapshot } from "./meter-store"
import {
  SOURCE_FLAGS_VALID,
  SOURCE_FLAGS_STALE,
  SOURCE_FLAGS_UNAVAILABLE,
  type WireSource,
} from "./protocol.generated"

export type SourceReference =
  | { readonly kind: "arrangement"; readonly clipId: string; readonly sourceId: string }
  | { readonly kind: "preview"; readonly clipId: string }

export interface SourcePosition extends Pick<
  WireSource,
  "sourceFrame" | "sourceRate" | "observedDeviceSample" | "positionAgeSamples"
> {
  readonly seconds: number
}

export function readSourcePosition(
  snapshot: MeterSnapshot | null,
  reference: SourceReference
): SourcePosition | null {
  if (!snapshot || snapshot.stale) return null
  const mapping = snapshot.registry.sources.find(
    mapping =>
      mapping.owner === reference.kind &&
      mapping.clipId === reference.clipId &&
      (reference.kind === "preview" || mapping.sourceId === reference.sourceId)
  )
  if (!mapping) return null
  const source = snapshot.sources.find(source => source.clipHandle === mapping.clipHandle)
  if (
    !source ||
    (source.flags & SOURCE_FLAGS_VALID) === 0 ||
    (source.flags & (SOURCE_FLAGS_STALE | SOURCE_FLAGS_UNAVAILABLE)) !== 0
  )
    return null
  return {
    sourceFrame: source.sourceFrame,
    sourceRate: source.sourceRate,
    seconds: source.sourceFrame / source.sourceRate,
    observedDeviceSample: source.observedDeviceSample,
    positionAgeSamples: source.positionAgeSamples,
  }
}
