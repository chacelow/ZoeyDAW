import { useWindowSize } from "@gpuix/react"
import type { FloatingContentProps } from "@gpuix/react/floating"

export function FloatingLayer({ side = "bottom", sideOffset = 0, align = "start", alignOffset = 0, collisionPadding, children, style, ref, ...props }: FloatingContentProps) {
  const { opacity, ...contentStyle } = style ?? {}
  const viewport = useWindowSize()
  const padding = collisionPadding ?? 0
  const oversized = (typeof style?.width === "number" && style.width >= viewport.width - padding * 2) ||
    (typeof style?.height === "number" && style.height >= viewport.height - padding * 2)
  return <anchored side={side} align={align} gap={sideOffset}
    offset={side === "top" || side === "bottom" ? { x: alignOffset, y: 0 } : { x: 0, y: alignOffset }}
    fit={oversized ? "snap" : "switch"} snapMargin={collisionPadding} deferred priority={1} occlude={style?.pointerEvents !== "none"}
    style={{ opacity }}>
    <div {...props} ref={ref} style={contentStyle}>{children}</div>
  </anchored>
}
