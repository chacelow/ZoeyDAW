export interface PaintLayer {
  readonly key: string
  readonly color: string
  readonly opacity: number
  readonly rectangles: () => Float32Array
}

export function paintLayers(
  groups: ReadonlyMap<string, { color: string; opacity: number; rectangles: number[] }>
): PaintLayer[] {
  return Array.from(groups, ([key, group]) => ({
    key,
    color: group.color,
    opacity: group.opacity,
    rectangles: () => new Float32Array(group.rectangles),
  }))
}
