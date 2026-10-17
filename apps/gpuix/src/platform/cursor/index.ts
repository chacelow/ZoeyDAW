export interface RelativeDragPort {
  readonly begin: () => void
  readonly end: (release?: { readonly x: number; readonly y: number }) => void
}

interface RelativeDragRenderer {
  beginRelativeDrag(): void
  endRelativeDrag(x?: number, y?: number): void
}

function isRelativeDragRenderer(value: unknown): value is RelativeDragRenderer {
  return (
    typeof value === "object" &&
    value !== null &&
    "beginRelativeDrag" in value &&
    typeof value.beginRelativeDrag === "function" &&
    "endRelativeDrag" in value &&
    typeof value.endRelativeDrag === "function"
  )
}

export function createNativeCursorLock(renderer: unknown): RelativeDragPort | undefined {
  if (!isRelativeDragRenderer(renderer)) return undefined
  return {
    begin: () => renderer.beginRelativeDrag(),
    end: release =>
      release ? renderer.endRelativeDrag(release.x, release.y) : renderer.endRelativeDrag(),
  }
}
