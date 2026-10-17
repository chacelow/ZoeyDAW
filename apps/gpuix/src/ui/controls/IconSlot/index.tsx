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
}

/**
 * Centres an icon in a fixed slot. Interactive slots enlarge the glyph on hover as a
 * paint-only GPU scale, instantly and without animation; layout never changes.
 */
export function IconSlot({ size = "default", interactive = false, hovered = false, filled = false, children, style, ...props }: IconSlotProps) {
  const theme = useTheme()
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const dimension = metrics["--spacing-control-icon-slot"]
  const glyph = metrics["--spacing-control-icon"]
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
            hovered,
            size: glyph,
            scale: (glyph + theme.design.icon.hoverGrowth) / glyph,
          }}
        >
          {children}
        </IconInteractionContext>
      ) : children}
    </div>
  )
}
