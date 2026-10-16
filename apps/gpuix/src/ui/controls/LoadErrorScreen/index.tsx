import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "../Button"
import type { Props } from "@gpuix/react"

export type LoadErrorScreenProps = Props & {
  readonly error?: unknown
  readonly title: string
  readonly message?: string
  readonly description?: string
  readonly secondaryLabel?: string
  readonly onSecondary?: () => void
} & (
    | {
        readonly onPrimary: () => void
        readonly primaryLabel: string
        readonly onRetry?: () => void
        readonly retryLabel?: string
      }
    | {
        readonly onPrimary?: never
        readonly primaryLabel?: never
        readonly onRetry: () => void
        readonly retryLabel: string
      }
    | {
        readonly onPrimary?: never
        readonly primaryLabel?: never
        readonly onRetry?: never
        readonly retryLabel?: never
      }
  )

export function LoadErrorScreen({
  error,
  title,
  message,
  description,
  onRetry,
  retryLabel,
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
  const actionLabel = onPrimary ? primaryLabel : retryLabel
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
          gap: theme.design.feedback.gap,
          padding: theme.design.feedback.inset,
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
        style={{
          fontWeight: theme.design.typography.weights.semibold,
          color: theme.colors.destructive,
        }}
      >
        {title}
      </div>
      {detail ? (
        <div
          testId={testId ? `${testId}-description` : undefined}
          style={{
            maxWidth: theme.design.feedback.maxWidth,
            textAlign: "center",
            color: theme.colors.mutedForeground,
          }}
        >
          {detail}
        </div>
      ) : null}
      {children}
      <div style={{ display: "flex", gap: theme.design.feedback.actionGap }}>
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
            label={actionLabel}
            onClick={primaryAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
