export interface MinimapViewport {
  pxPerBar: number
  scrollX: number
}

export interface MinimapGeometry extends MinimapViewport {
  bars: number
  viewportWidth: number
  minPxPerBar: number
  maxPxPerBar: number
  onNavigate: () => void
}

const CAP_WIDTH = 2
const MIN_INNER_WIDTH = 12

export function minimapFrame(width: number, geometry: MinimapGeometry) {
  const contentWidth = Math.trunc(geometry.bars * geometry.pxPerBar + 1.5)
  const viewportWidth = Math.trunc(geometry.viewportWidth)
  if (contentWidth <= viewportWidth || width <= 0) return { left: 0, right: width, panRatio: 1 }
  const frameWidth = Math.min(
    width,
    Math.max(
      MIN_INNER_WIDTH,
      Math.trunc(((width - 2 * CAP_WIDTH) * viewportWidth) / contentWidth)
    ) +
      2 * CAP_WIDTH
  )
  const scale =
    width === frameWidth ? 1 : Math.fround((width - frameWidth) / (contentWidth - viewportWidth))
  const left = Math.trunc(Math.fround(Math.fround(geometry.scrollX) * scale) + 0.5)
  return { left, right: left + frameWidth, panRatio: Math.fround(1 / scale) }
}

export function minimapZoom(
  geometry: MinimapGeometry,
  pxPerBar: number,
  anchorBar: number
): MinimapViewport {
  const contentWidth = Math.min(
    1073740823,
    Math.max(geometry.viewportWidth, Math.trunc(geometry.bars * pxPerBar))
  )
  const zoom = Math.max(
    geometry.minPxPerBar,
    Math.min(geometry.maxPxPerBar, (contentWidth - 1) / geometry.bars)
  )
  const before = Math.trunc(anchorBar * geometry.pxPerBar + 0.5)
  const after = Math.trunc(anchorBar * zoom + 0.5)
  return minimapPan(geometry, geometry.scrollX + after - before, zoom)
}

export function minimapPan(
  geometry: MinimapGeometry,
  scrollX: number,
  pxPerBar = geometry.pxPerBar
): MinimapViewport {
  return {
    pxPerBar,
    scrollX: Math.max(
      0,
      Math.min(
        Math.max(0, Math.trunc(geometry.bars * pxPerBar + 1.5) - geometry.viewportWidth),
        scrollX
      )
    ),
  }
}

export function minimapAnchor(width: number, x: number, geometry: MinimapGeometry): number {
  const pixel = Math.trunc(
    Math.fround(
      (Math.fround(Math.trunc(geometry.bars * geometry.pxPerBar + 1.5)) *
        Math.fround(x - CAP_WIDTH)) /
        Math.fround(Math.max(1, width - 2 * CAP_WIDTH))
    ) + 0.5
  )
  return pixel / geometry.pxPerBar
}

export type MinimapMode = "left" | "right" | "body" | "jump" | "pan" | "page"

export function minimapHit(
  x: number,
  width: number,
  geometry: MinimapGeometry,
  modified = false
): MinimapMode {
  const frame = minimapFrame(width, geometry)
  if (x < frame.left || x > frame.right) return modified ? "page" : "jump"
  if (modified) return "pan"
  const handle = frame.right - frame.left < 12 ? Math.trunc((frame.right - frame.left) / 3) : 4
  if (x < frame.left + handle) return "left"
  if (x < frame.right && x >= frame.right - handle) return "right"
  return "body"
}

export function minimapEdgeZoom(
  width: number,
  x: number,
  mode: "left" | "right",
  frame: { left: number; right: number },
  geometry: MinimapGeometry
): number {
  const inner =
    mode === "left"
      ? frame.right - x - 2 * CAP_WIDTH
      : Math.min(x, width) - frame.left - 2 * CAP_WIDTH
  const factor = Math.max(
    mode === "left"
      ? Math.trunc(geometry.bars * geometry.pxPerBar + 1.5) /
          (geometry.viewportWidth + geometry.scrollX)
      : 1,
    Math.fround((width - 2 * CAP_WIDTH) / Math.max(MIN_INNER_WIDTH, inner))
  )
  return (geometry.viewportWidth * factor) / geometry.bars
}
