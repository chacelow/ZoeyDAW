import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "../Button"
import type { Props } from "@gpuix/react"

export interface LoadErrorScreenProps extends Props {
  readonly error?: unknown
  readonly title?: string
  readonly message?: string
  readonly description?: string
  readonly onRetry?: () => void
  readonly retryLabel?: string
  readonly primaryLabel?: string
  readonly onPrimary?: () => void
  readonly secondaryLabel?: string
  readonly onSecondary?: () => void
}

export function LoadErrorScreen({
  error,
  title = "Unable to load",
  message,
  description,
  onRetry,
  retryLabel = "Retry",
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  children,
  style,
  testId,
  ...props
}: LoadErrorScreenProps) {
  const theme = useTheme()
  const detail =
    description ??
    message ??
    (error instanceof Error ? error.message : typeof error === "string" ? error : undefined)
  const primaryAction = onPrimary ?? onRetry
  const gap = theme.control["--spacing-control-track-gap"]
  return (
    <div
      {...props}
      testId={testId}
      role="alert"
      aria-label={props["aria-label"] ?? title}
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
          padding: gap * 6,
          backgroundColor: theme.colors.background,
          color: theme.colors.foreground,
          fontSize: theme.control["--text-control-track"],
        },
        style
      )}
    >
      <div
        role="heading"
        aria-level={2}
        style={{ fontWeight: 600, color: theme.colors.destructive }}
      >
        {title}
      </div>
      {detail ? (
        <div
          style={{
            maxWidth: theme.project.controlsWidth,
            textAlign: "center",
            color: theme.colors.mutedForeground,
          }}
        >
          {detail}
        </div>
      ) : null}
      {children}
      <div style={{ display: "flex", gap: gap * 2 }}>
        {secondaryLabel && onSecondary ? (
          <Button
            testId={testId ? `${testId}-secondary` : undefined}
            variant="outline"
            label={secondaryLabel}
            onClick={onSecondary}
          >
            {secondaryLabel}
          </Button>
        ) : null}
        {primaryAction ? (
          <Button
            testId={testId ? `${testId}-retry` : undefined}
            label={primaryLabel ?? retryLabel}
            onClick={primaryAction}
          >
            {primaryLabel ?? retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
