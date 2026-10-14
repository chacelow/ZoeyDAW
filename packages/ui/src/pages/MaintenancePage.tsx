import { Wrench, RefreshCw, Home } from "lucide-react"
import { Button } from "../button"

interface MaintenancePageProperties {
  readonly title?: string
  readonly description?: string
  readonly estimatedTime?: string
  readonly showRefreshButton?: boolean
  readonly showHomeButton?: boolean
  readonly onRefresh?: () => void
  readonly onHome?: () => void
}

/**
 * 维护页面 — shadcn 风格, 主题色全跟随.
 */
export function MaintenancePage({
  title = "系统维护中",
  description = "系统正在进行升级维护,为您带来更好的体验",
  estimatedTime,
  showRefreshButton = true,
  showHomeButton = true,
  onRefresh,
  onHome,
}: MaintenancePageProperties) {
  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh()
    } else {
      window.location.reload()
    }
  }

  const handleHome = () => {
    onHome?.()
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="bg-muted flex size-16 items-center justify-center rounded-full">
            <Wrench className="text-muted-foreground size-8 animate-pulse" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>

        {estimatedTime ? (
          <div className="border-border bg-muted/50 rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-sm">
              <strong className="text-foreground">预计完成时间:</strong> {estimatedTime}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row">
          {showRefreshButton ? (
            <Button onClick={handleRefresh} className="gap-2">
              <RefreshCw className="size-4" />
              刷新页面
            </Button>
          ) : null}
          {showHomeButton && onHome ? (
            <Button variant="outline" onClick={handleHome} className="gap-2">
              <Home className="size-4" />
              返回首页
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
