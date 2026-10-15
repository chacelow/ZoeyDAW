import { Children } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { IconSlot } from "../IconSlot"
import type { Props } from "@gpuix/react"
import type { ReactNode } from "react"
import type { ControlSize } from "../chrome"

export interface ControlGroupProps extends Props {
  readonly label?: string
  readonly icon?: ReactNode
  readonly separator?: "none" | "slash" | "dot" | "line"
  readonly variant?: "joined" | "toolbar"
  readonly size?: ControlSize
}

export function ControlGroup({
  label,
  icon,
  separator = "none",
  variant = "joined",
  size = "default",
  children,
  style,
  ...props
}: ControlGroupProps) {
  const theme = useTheme()
  const items = Children.toArray(children)
  return (
    <div
      {...props}
      role="group"
      aria-label={label}
      style={sx(
        {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap:
            variant === "toolbar"
              ? theme.design.spacing.toolbarGap[size]
              : theme.design.spacing.joinedGroupGap,
          backgroundColor: variant === "toolbar" ? "transparent" : theme.colors.muted,
          borderRadius: theme.design.shape.controlRadius,
        },
        style
      )}
    >
      {icon ? <IconSlot size={size}>{icon}</IconSlot> : null}
      {items.flatMap((child, index) =>
        index === 0 || separator === "none"
          ? [child]
          : [
              separator === "line" ? (
                <div
                  key={`separator-${index}`}
                  aria-hidden="true"
                  style={{
                    width: 1,
                    height:
                      size === "transport"
                        ? theme.transportControl["--spacing-control-track"]
                        : theme.control["--spacing-control-track"],
                    backgroundColor: theme.colors.border,
                  }}
                />
              ) : (
                <text
                  key={`separator-${index}`}
                  aria-hidden="true"
                  style={{
                    fontSize: theme.control["--text-control-track"],
                    color: theme.colors.mutedForeground,
                  }}
                >
                  {separator === "slash" ? "/" : "."}
                </text>
              ),
              child,
            ]
      )}
    </div>
  )
}
