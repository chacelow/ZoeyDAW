import { useTheme } from "../../../shared/theme/ThemeProvider"
import { sx } from "../../../shared/theme/style"
import { Progress } from "../Progress"
import type { Props } from "@gpuix/react"

export interface LoadingProps extends Props {
  readonly tip?: string
  readonly message?: string
  readonly show?: boolean
  readonly progress?: number
  readonly logoSrc?: string
}

export function Loading({
  tip,
  message,
  show = true,
  progress,
  logoSrc,
  children,
  style,
  ...props
}: LoadingProps) {
  const theme = useTheme()
  if (!show) return null
  const label = tip ?? message ?? "Loading"
  const gap = theme.control["--spacing-control-track-gap"]
  const showProgress = typeof progress === "number"
  return (
    <div
      {...props}
      role="status"
      aria-label={props["aria-label"] ?? label}
      aria-live="polite"
      aria-busy={true}
      style={sx(
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: gap * 3,
          backgroundColor: theme.colors.background,
          color: theme.colors.mutedForeground,
          fontSize: theme.control["--text-control-track"],
        },
        style
      )}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt="ZoeyMind"
          objectFit="contain"
          style={{
            width: theme.control["--spacing-control-icon"] * 6,
            height: theme.control["--spacing-control-track"] * 3,
          }}
        />
      ) : null}
      <div>{label}</div>
      {showProgress ? (
        <div style={{ width: theme.project.controlsWidth }}>
          <Progress value={progress ?? 0} aria-label={label} />
        </div>
      ) : null}
      {children}
    </div>
  )
}
