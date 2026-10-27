export interface AudioWarpMarker {
  readonly id: string
  readonly sourceBar: number
  readonly targetBar: number
}

export function isAudioWarpMarkers(value: unknown): value is readonly AudioWarpMarker[] {
  if (!Array.isArray(value) || value.length > 256) return false
  let source = 0
  let target = 0
  const ids = new Set<string>()
  for (const marker of value) {
    if (
      typeof marker !== "object" ||
      marker === null ||
      Object.keys(marker).length !== 3 ||
      !("id" in marker) ||
      typeof marker.id !== "string" ||
      !marker.id ||
      ids.has(marker.id) ||
      !("sourceBar" in marker) ||
      !("targetBar" in marker) ||
      typeof marker.sourceBar !== "number" ||
      typeof marker.targetBar !== "number" ||
      !Number.isFinite(marker.sourceBar) ||
      !Number.isFinite(marker.targetBar) ||
      marker.sourceBar > 1e12 ||
      marker.targetBar > 1e12 ||
      marker.sourceBar <= source ||
      marker.targetBar <= target
    )
      return false
    const ratio = (marker.sourceBar - source) / (marker.targetBar - target)
    if (ratio < 0.1 || ratio > 10) return false
    source = marker.sourceBar
    target = marker.targetBar
    ids.add(marker.id)
  }
  return true
}

export function warpSourceBar(markers: readonly AudioWarpMarker[], target: number): number {
  if (target <= 0) return target
  let sourceStart = 0
  let targetStart = 0
  for (const marker of markers) {
    if (target <= marker.targetBar)
      return (
        sourceStart +
        ((target - targetStart) * (marker.sourceBar - sourceStart)) /
          (marker.targetBar - targetStart)
      )
    sourceStart = marker.sourceBar
    targetStart = marker.targetBar
  }
  return sourceStart + target - targetStart
}

export function warpTargetBar(markers: readonly AudioWarpMarker[], source: number): number {
  if (source <= 0) return source
  let sourceStart = 0
  let targetStart = 0
  for (const marker of markers) {
    if (source <= marker.sourceBar)
      return (
        targetStart +
        ((source - sourceStart) * (marker.targetBar - targetStart)) /
          (marker.sourceBar - sourceStart)
      )
    sourceStart = marker.sourceBar
    targetStart = marker.targetBar
  }
  return targetStart + source - sourceStart
}
