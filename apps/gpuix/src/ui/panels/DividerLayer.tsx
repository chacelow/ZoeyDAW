import { createContext, useContext, useMemo, useState } from "react"
import { createPortal } from "@gpuix/react"
import type { Props, PublicInstance } from "@gpuix/react"
import { sx } from "@/shared/theme/style"

export type DividerBounds = { x: number; y: number; width: number; height: number }
const LayerContext = createContext<{
  local: PublicInstance | null
  root: PublicInstance | null
  bounds: DividerBounds | null
  origin: DividerBounds | null
} | null>(null)

export function useDividerLayer() {
  return useContext(LayerContext)?.local ?? null
}

export function DividerLayer({
  children,
  style,
  layoutBounds,
  ...props
}: Props & { layoutBounds?: DividerBounds }) {
  const parent = useContext(LayerContext)
  const [layer, setLayer] = useState<PublicInstance | null>(null)
  const [measuredBounds, setBounds] = useState<DividerBounds | null>(null)
  const bounds = layoutBounds ?? measuredBounds
  const root = parent?.root ?? layer
  const origin = parent ? parent.origin : measuredBounds
  const context = useMemo(
    () => ({ local: layer, root, bounds, origin }),
    [layer, root, bounds, origin]
  )
  const measure = !layoutBounds || !parent
  return (
    <LayerContext.Provider value={context}>
      <div {...props} style={sx(style, { position: "relative" })}>
        {children}
        <div
          ref={setLayer}
          onLayout={
            measure
              ? event => {
                  if (
                    event.x === undefined ||
                    event.y === undefined ||
                    event.width === undefined ||
                    event.height === undefined
                  )
                    return
                  const next = { x: event.x, y: event.y, width: event.width, height: event.height }
                  setBounds(previous =>
                    previous?.x === next.x &&
                    previous.y === next.y &&
                    previous.width === next.width &&
                    previous.height === next.height
                      ? previous
                      : next
                  )
                }
              : undefined
          }
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
      </div>
    </LayerContext.Provider>
  )
}

export function DividerOverlay({ children }: Pick<Props, "children">) {
  const context = useContext(LayerContext)
  if (!context?.root) return null
  if (context.root === context.local) return createPortal(children, context.root)
  if (!context.bounds || !context.origin) return null
  const origin = context.origin
  return createPortal(
    <div
      style={{
        position: "absolute",
        left: context.bounds.x - (origin?.x ?? 0),
        top: context.bounds.y - (origin?.y ?? 0),
        width: context.bounds.width,
        height: context.bounds.height,
        pointerEvents: "none",
      }}
    >
      {children}
    </div>,
    context.root
  )
}
