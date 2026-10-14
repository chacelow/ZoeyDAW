import { Children } from "react"
import { useTheme } from "../../../shared/theme/ThemeProvider"
import { sx } from "../../../shared/theme/style"
import { IconSlot } from "../IconSlot"
import type { Props } from "@gpuix/react"
import type { ReactNode } from "react"

export interface ControlGroupProps extends Props {
  readonly label?: string
  readonly icon?: ReactNode
  readonly separator?: "none" | "slash" | "dot" | "line"
}

export function ControlGroup({
  label,
  icon,
  separator = "none",
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
          backgroundColor: theme.colors.muted,
          borderRadius: 3,
        },
        style
      )}
    >
      {icon ? <IconSlot>{icon}</IconSlot> : null}
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
                    height: theme.control["--spacing-control-track"],
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
