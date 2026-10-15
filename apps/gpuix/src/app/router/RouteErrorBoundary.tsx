import { Component, Fragment } from "react"
import { logger } from "@zoeymind/logger"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { LoadErrorScreen } from "@/ui/controls"
import { useAppTranslation } from "../i18n"
import type { ErrorInfo, ReactNode } from "react"

export interface RouteErrorBoundaryProps {
  /** Identity of the current route; a new route clears a previous failure. */
  readonly routeKey: string
  readonly onHome: () => void
  /** Show the raw error message (web shows it only in DEV builds). */
  readonly showDetails: boolean
  readonly children: ReactNode
}

interface RouteErrorBoundaryState {
  readonly error: unknown
  readonly failedRoute: string | null
  readonly attempt: number
}

/** Replaces a failed route with the shell's error screen instead of unmounting the window. */
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  override state: RouteErrorBoundaryState = { error: null, failedRoute: null, attempt: 0 }

  static getDerivedStateFromError(error: unknown): Partial<RouteErrorBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: RouteErrorBoundaryProps,
    state: RouteErrorBoundaryState
  ): Partial<RouteErrorBoundaryState> | null {
    if (state.failedRoute !== null && state.failedRoute !== props.routeKey) {
      return { error: null, failedRoute: null }
    }
    return null
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    logger.error("[RouteErrorBoundary] Unhandled route error", error, info.componentStack)
    this.setState({ failedRoute: this.props.routeKey })
  }

  override render() {
    const { error, failedRoute, attempt } = this.state
    if (failedRoute === null && error === null) {
      return <Fragment key={attempt}>{this.props.children}</Fragment>
    }
    return (
      <RouteErrorScreen
        error={error}
        showDetails={this.props.showDetails}
        onRetry={() =>
          this.setState(current => ({
            error: null,
            failedRoute: null,
            attempt: current.attempt + 1,
          }))
        }
        onHome={this.props.onHome}
      />
    )
  }
}

function RouteErrorScreen({
  error,
  showDetails,
  onRetry,
  onHome,
}: {
  readonly error: unknown
  readonly showDetails: boolean
  readonly onRetry: () => void
  readonly onHome: () => void
}) {
  const theme = useTheme()
  const { t } = useAppTranslation()
  const detail = showDetails && error instanceof Error ? error.message : undefined
  const gap = theme.control["--spacing-control-track-gap"]
  return (
    <LoadErrorScreen
      testId="route-error"
      title={t("routeError.title")}
      description={t("routeError.description")}
      primaryLabel={t("routeError.retry")}
      onPrimary={onRetry}
      secondaryLabel={t("routeError.home")}
      onSecondary={onHome}
    >
      {detail ? (
        <div
          role="group"
          aria-label={t("routeError.details")}
          style={{
            display: "flex",
            flexDirection: "column",
            gap,
            maxWidth: theme.project.controlsWidth,
            padding: gap * 2,
            borderRadius: gap,
            backgroundColor: theme.colors.muted,
            color: theme.colors.mutedForeground,
          }}
        >
          <text style={{ fontWeight: 500 }}>{t("routeError.details")}</text>
          <text style={{ whiteSpace: "normal" }}>{detail}</text>
        </div>
      ) : null}
    </LoadErrorScreen>
  )
}
