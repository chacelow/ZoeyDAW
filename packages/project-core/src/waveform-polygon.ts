export interface WaveformContourPoint {
  readonly x: number
  readonly y: number
}

function rasterCoordinate(value: number): number {
  return Math.trunc(value * 256 + (value < 0 ? -0.5 : 0.5)) / 256
}

/** Native filled half-pixel contour; input y coordinates have already been clipped. */
export function waveformContour(
  upper: readonly WaveformContourPoint[],
  lower: readonly WaveformContourPoint[]
): string {
  const count = upper.length + lower.length
  if (count < 2) return ""

  let path = ""
  let previous: WaveformContourPoint | undefined
  let previousDx = 0
  let previousDy = 0
  let previousNormalX = 0
  let previousNormalY = 0
  let previousLengthSquared = 0
  let sourceIndex = 0
  let end = count + 1

  function emit(x: number, y: number): void {
    const command = path === "" ? "M" : "L"
    if (path === "") end = sourceIndex + count - 1
    path += `${command}${rasterCoordinate(x)},${rasterCoordinate(y)}`
  }

  // 0x10179b420 cycles the source until one complete circuit after the first join.
  while (sourceIndex < end) {
    const index = sourceIndex % count
    const point = index < upper.length ? upper[index] : lower[count - index - 1]
    sourceIndex++
    if (previous === undefined) {
      previous = point
      continue
    }

    const dx = point.x - previous.x
    const dy = point.y - previous.y
    const lengthSquared = dy * dy + dx * dx
    // 0x101813d28 leaves ALL converter state unchanged for these short edges.
    if (lengthSquared <= 0.25) continue

    const scale = 0.5 / Math.sqrt(lengthSquared)
    const normalX = dy * scale
    const normalY = -(dx * scale)
    if (previousLengthSquared > 0.25) {
      const ax = previous.x + previousNormalX
      const ay = previous.y + previousNormalY
      const bx = previous.x + normalX
      const by = previous.y + normalY
      const differenceX = bx - ax
      const differenceY = by - ay
      const cross = -(previousDy * dx) + dy * previousDx
      let miter = false
      if (cross < 0) {
        const t = (-(differenceY * dx) + dy * differenceX) / cross
        const intersectionX = ax + previousDx * t
        const intersectionY = ay + previousDy * t
        const distanceX = intersectionX - previous.x
        const distanceY = intersectionY - previous.y
        const distanceSquared = distanceY * distanceY + distanceX * distanceX
        if (distanceSquared < lengthSquared || distanceSquared < previousLengthSquared) {
          emit(intersectionX, intersectionY)
          miter = true
        }
      }
      if (!miter) {
        if (differenceY * differenceY + differenceX * differenceX < 0.25) {
          emit((bx + ax) * 0.5, (by + ay) * 0.5)
        } else {
          emit(ax, ay)
          emit(bx, by)
        }
      }
    }
    previous = point
    previousDx = dx
    previousDy = dy
    previousNormalX = normalX
    previousNormalY = normalY
    previousLengthSquared = lengthSquared
  }

  return path === "" ? "" : `${path}Z`
}
