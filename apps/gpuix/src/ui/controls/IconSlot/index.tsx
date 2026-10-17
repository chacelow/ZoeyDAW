import { IconInteractionContext } from "../Icon"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { Props } from "@gpuix/react"
import type { ControlSize } from "../chrome"

export interface IconSlotProps extends Props {
  readonly size?: ControlSize
  readonly interactive?: boolean
  readonly hovered?: boolean
  readonly filled?: boolean
  readonly reducedMotion?: boolean
}

/**
 * Centres an icon in a fixed slot. Interactive slots hand hover growth to the
 * glyph as a paint-only GPU scale: the SVG rasterises once at its base size,
 * so hover never re-lays out or re-rasterises.
 */
export function IconSlot({ size = "default", interactive = false, hovered = false, filled = false, reducedMotion = false, children, style, ...props }: IconSlotProps) {
  const theme = useTheme()
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const dimension = metrics["--spacing-control-icon-slot"]
  const glyph = metrics["--spacing-control-icon"]
  const motion = theme.design.motion.icon
  return (
    <div
      {...props}
      aria-hidden="true"
      style={sx(
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: dimension,
          height: dimension,
          flexShrink: 0,
          pointerEvents: "none",
        },
        style
      )}
    >
      {interactive ? (
        <IconInteractionContext
          value={{
            filled,
            size: glyph,
            scale: hovered ? (glyph + theme.design.icon.hoverGrowth) / glyph : 1,
            transition: { duration: reducedMotion ? 0 : motion.duration, ease: motion.easing },
          }}
        >
          {children}
        </IconInteractionContext>
      ) : children}
    </div>
  )
}
