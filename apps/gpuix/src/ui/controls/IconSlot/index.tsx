import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { Props } from "@gpuix/react"
import type { ControlSize } from "../chrome"

export interface IconSlotProps extends Props {
  readonly size?: ControlSize
}

export function IconSlot({ size = "default", children, style, ...props }: IconSlotProps) {
  const theme = useTheme()
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const dimension = metrics["--spacing-control-icon-slot"]
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
      {children}
    </div>
  )
}
