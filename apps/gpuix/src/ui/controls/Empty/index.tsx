import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { Props } from "@gpuix/react"

export function Empty({ style, ...props }: Props) {
  const theme = useTheme()
  const gap = theme.control["--spacing-control-track-gap"]
  return (
    <div
      role="group"
      {...props}
      style={sx(
        {
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          width: "100%",
          minWidth: 0,
          alignItems: "center",
          justifyContent: "center",
          gap: gap * 4,
          padding: gap * 6,
          borderRadius: gap * 3,
          textAlign: "center",
          color: theme.colors.foreground,
          fontSize: theme.control["--text-control-track"],
        },
        style
      )}
    />
  )
}

export function EmptyHeader({ style, ...props }: Props) {
  const theme = useTheme()
  return (
    <div
      {...props}
      style={sx(
        {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: theme.project.controlsWidth,
          gap: theme.control["--spacing-control-track-gap"] * 2,
        },
        style
      )}
    />
  )
}

export function EmptyTitle({ style, ...props }: Props) {
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
          color: theme.colors.foreground,
          textAlign: "center",
        },
        style
      )}
    />
  )
}

export function EmptyDescription({ style, ...props }: Props) {
  const theme = useTheme()
  return (
    <div
      {...props}
      style={sx(
        {
          fontSize: theme.control["--text-control-track"],
          color: theme.colors.mutedForeground,
          textAlign: "center",
        },
        style
      )}
    />
  )
}
