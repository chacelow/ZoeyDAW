export type PanelSize = number | string

export interface PanelConstraints {
  minSize?: PanelSize
  maxSize?: PanelSize
  collapsible?: boolean
  collapsedSize?: PanelSize
}

export interface ResolvedConstraints {
  min: number
  max: number
  collapsed: number
  collapsible: boolean
  fixed: boolean
}

export function toPixels(size: PanelSize, total: number): number {
  if (typeof size === "number") {
    if (!Number.isFinite(size) || size < 0)
      throw new RangeError("Panel pixels must be non-negative")
    return size
  }
  if (!/^\d+(?:\.\d+)?%?$/.test(size)) throw new RangeError(`Invalid panel percentage: ${size}`)
  return (Number.parseFloat(size) / 100) * total
}

export function resolveConstraints(
  panels: readonly PanelConstraints[],
  total: number
): ResolvedConstraints[] {
  return panels.map(panel => {
    const min = toPixels(panel.minSize ?? 0, total)
    const max = toPixels(panel.maxSize ?? "100", total)
    const collapsed = toPixels(panel.collapsedSize ?? 0, total)
    if (
      (typeof panel.minSize === "number" && typeof panel.maxSize === "number" && max < min) ||
      (panel.collapsible && collapsed > min)
    ) {
      throw new RangeError("Panel requires collapsedSize <= minSize <= maxSize")
    }
    return {
      min,
      max: Math.max(min, max),
      collapsed,
      collapsible: panel.collapsible ?? false,
      fixed:
        panel.minSize !== undefined &&
        panel.maxSize !== undefined &&
        typeof panel.minSize === typeof panel.maxSize &&
        max <= min,
    }
  })
}

export function snapSize(size: number, constraint: ResolvedConstraints): number {
  if (constraint.collapsible && size < (constraint.min + constraint.collapsed) / 2) {
    return constraint.collapsed
  }
  return Math.min(constraint.max, Math.max(constraint.min, size))
}

export function initialLayout(
  defaults: readonly (PanelSize | undefined)[],
  constraints: readonly ResolvedConstraints[],
  total: number
): number[] {
  const specified = defaults.reduce<number>(
    (sum, size) => sum + (size === undefined ? 0 : toPixels(size, total)),
    0
  )
  const missing = defaults.filter(size => size === undefined).length
  const share = missing > 0 ? Math.max(0, total - specified) / missing : 0
  return reflowLayout(
    defaults.map(size => (size === undefined ? share : toPixels(size, total))),
    constraints,
    total,
    defaults.map(size => typeof size === "number")
  )
}

export function fitLayout(
  sizes: readonly number[],
  constraints: readonly ResolvedConstraints[],
  total: number
): number[] {
  const locked = constraints.map((c, index) =>
    c.collapsible && (sizes[index] ?? 0) < (c.min + c.collapsed) / 2
      ? c.collapsed
      : c.fixed
        ? c.min
        : null
  )
  const reserved = locked.reduce<number>((sum, size) => sum + (size ?? 0), 0)
  if (reserved > total) throw new RangeError("Fixed panels exceed the available size")
  const flexibleMin = constraints.reduce((sum, c, i) => sum + (locked[i] === null ? c.min : 0), 0)
  const minScale = flexibleMin > 0 ? Math.min(1, (total - reserved) / flexibleMin) : 1
  const result = constraints.map(
    (c, i) => locked[i] ?? Math.min(c.max, Math.max(c.min * minScale, sizes[i] ?? 0))
  )
  for (let pass = 0; pass <= constraints.length; pass++) {
    const remainder = total - result.reduce((sum, size) => sum + size, 0)
    if (Math.abs(remainder) < 0.000001) break
    const eligible = constraints.flatMap((c, i) => {
      if (locked[i] !== null) return []
      const capacity = remainder > 0 ? c.max - result[i] : result[i] - c.min * minScale
      return capacity > 0.000001 ? [i] : []
    })
    if (eligible.length === 0) break
    const share = remainder / eligible.length
    for (const i of eligible) {
      const c = constraints[i]
      result[i] = Math.min(c.max, Math.max(c.min * minScale, result[i] + share))
    }
  }
  return result
}

export function reflowLayout(
  sizes: readonly number[],
  inputConstraints: readonly ResolvedConstraints[],
  total: number,
  pixelPanels: readonly boolean[] = []
): number[] {
  const hardFixed = inputConstraints.reduce(
    (sum, c, i) => sum + (c.fixed ? snapSize(sizes[i], c) : 0),
    0
  )
  let held = inputConstraints.map((c, i) =>
    pixelPanels[i] === true && !c.fixed ? snapSize(sizes[i], c) : 0
  )
  const heldTotal = held.reduce((sum, size) => sum + size, 0)
  const pixelBudget = Math.max(0, total - hardFixed)
  if (heldTotal > pixelBudget) {
    held = fitLayout(
      held,
      inputConstraints.map((c, i) =>
        pixelPanels[i] === true && !c.fixed
          ? c
          : { min: 0, max: 0, collapsed: 0, collapsible: false, fixed: true }
      ),
      pixelBudget
    )
  }
  const constraints = inputConstraints.map((c, i) =>
    pixelPanels[i] === true && !c.fixed ? { ...c, min: held[i], max: held[i], fixed: true } : c
  )
  const fixed = constraints.reduce(
    (sum, c, i) =>
      sum +
      (c.fixed
        ? snapSize(sizes[i], c)
        : c.collapsible && sizes[i] === c.collapsed
          ? c.collapsed
          : 0),
    0
  )
  const flexible = sizes.reduce((sum, size, i) => {
    const c = constraints[i]
    return sum + (c.fixed || (c.collapsible && size === c.collapsed) ? 0 : size)
  }, 0)
  const ratio = flexible > 0 ? Math.max(0, total - fixed) / flexible : 1
  return fitLayout(
    sizes.map((size, i) => {
      const c = constraints[i]
      return c.fixed || (c.collapsible && size === c.collapsed)
        ? size
        : Math.max(c.min, size * ratio)
    }),
    constraints,
    total
  )
}
