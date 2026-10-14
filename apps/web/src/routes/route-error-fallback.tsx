import { useEffect } from "react"
import { isRouteErrorResponse, useRouteError } from "react-router-dom"
import { useTranslation } from "@zoeymind/i18n"
import { logger } from "@zoeymind/logger"
import { LoadErrorScreen } from "@zoeymind/ui"
import { ShellTitleBar } from "./ShellTitleBar"

function describeRouteError(error: unknown): string | undefined {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`.trim()
  }
  return error instanceof Error ? error.message : undefined
}

export function RouteErrorFallback() {
  const error = useRouteError()
  const { t } = useTranslation()
  const errorDetail = describeRouteError(error)

  useEffect(() => {
    logger.error("[RouteErrorFallback] Unhandled route error", error)
  }, [error])

  return (
    <div className="bg-background flex h-screen flex-col">
      <ShellTitleBar />
      <LoadErrorScreen
        title={t("routeError.title")}
        description={t("routeError.description")}
        primaryLabel={t("routeError.retry")}
        onPrimary={() => window.location.reload()}
        secondaryLabel={t("routeError.home")}
        onSecondary={() => window.location.assign("/")}
      >
        {import.meta.env.DEV && errorDetail ? (
          <details className="bg-muted/40 text-muted-foreground mb-6 w-full max-w-md rounded-lg px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium select-none">
              {t("routeError.details")}
            </summary>
            <p className="mt-2 max-h-24 overflow-auto font-mono break-words select-text">
              {errorDetail}
            </p>
          </details>
        ) : null}
      </LoadErrorScreen>
    </div>
  )
}
