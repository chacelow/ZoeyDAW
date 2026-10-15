export interface PaintGroup {
  readonly color: string
  readonly opacity: number
  readonly strokeWidth?: number
  readonly strokeColor?: string
  readonly rectangles: number[]
}

export interface PaintLayer extends Omit<PaintGroup, "rectangles"> {
  readonly key: string
  readonly rectangles: () => Float32Array
}

export function paintLayers(groups: ReadonlyMap<string, PaintGroup>): PaintLayer[] {
  return Array.from(groups, ([key, group]) => ({
    key,
    color: group.color,
    opacity: group.opacity,
    strokeWidth: group.strokeWidth,
    strokeColor: group.strokeColor,
    rectangles: () => new Float32Array(group.rectangles),
  }))
}
