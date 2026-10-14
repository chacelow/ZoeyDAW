import { createContext, useContext } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { Props } from "@gpuix/react"

export interface CardProps extends Props {
  readonly size?: "default" | "sm"
}

const CardSpacing = createContext<number | null>(null)

function useCardSpacing() {
  const theme = useTheme()
  return useContext(CardSpacing) ?? theme.control["--spacing-control-track-gap"] * 4
}

export function Card({
  size = "default",
  style,
  children,
  onClick,
  onKeyDown,
  ...props
}: CardProps) {
  const theme = useTheme()
  const spacing = theme.control["--spacing-control-track-gap"] * (size === "sm" ? 3 : 4)
  const cardStyle = sx(
    {
      display: "flex",
      flexDirection: "column",
      gap: spacing,
      paddingTop: spacing,
      paddingBottom: spacing,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: spacing / 2,
      overflow: "hidden",
      backgroundColor: theme.colors.card,
      color: theme.colors.cardForeground,
      fontSize: theme.control["--text-control-track"],
    },
    style
  )
  return (
    <CardSpacing.Provider value={spacing}>
      {onClick ? (
        <div
          {...props}
          role="button"
          tabIndex={props.tabIndex ?? 0}
          aria-disabled={false}
          onClick={onClick}
          onKeyDown={event => {
            onKeyDown?.(event)
            if (event.key === "enter" || event.key === "space" || event.key === " ") {
              onClick(event)
            }
          }}
          style={cardStyle}
        >
          {children}
        </div>
      ) : (
        <div {...props} role="group" style={cardStyle}>
          {children}
        </div>
      )}
    </CardSpacing.Provider>
  )
}

export function CardHeader({ style, ...props }: Props) {
  const spacing = useCardSpacing()
  const theme = useTheme()
  return (
    <div
      {...props}
      style={sx(
        {
          display: "flex",
          flexDirection: "column",
          gap: theme.control["--spacing-control-gap"],
          paddingLeft: spacing,
          paddingRight: spacing,
        },
        style
      )}
    />
  )
}

export function CardTitle({ style, ...props }: Props) {
  const theme = useTheme()
  return (
    <div
      role="heading"
      aria-level={2}
      {...props}
      style={sx(
        {
          fontSize: theme.control["--text-control-track"],
          fontWeight: 600,
          color: theme.colors.cardForeground,
        },
        style
      )}
    />
  )
}

export function CardDescription({ style, ...props }: Props) {
  const theme = useTheme()
  return (
    <div
      {...props}
      style={sx(
        { color: theme.colors.mutedForeground, fontSize: theme.control["--text-control-track"] },
        style
      )}
    />
  )
}

export function CardContent({ style, ...props }: Props) {
  const spacing = useCardSpacing()
  return (
    <div
      {...props}
      style={sx({ paddingLeft: spacing, paddingRight: spacing, minWidth: 0 }, style)}
    />
  )
}
