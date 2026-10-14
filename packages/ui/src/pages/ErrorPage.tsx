import { AlertTriangle, RefreshCw, Home, ArrowLeft } from "lucide-react"
import { Button } from "../button"

interface ErrorPageProperties {
  /**
  大字号代码 (如 "404" / "500"); 不传则显示警告图标
  */
  readonly code?: string
  readonly title?: string
  readonly description?: string
  /**
  开发模式下的技术错误详情
  */
  readonly error?: string
  /**
  按钮文案; 不传用默认中文
  */
  readonly refreshButtonText?: string
  readonly backButtonText?: string
  readonly homeButtonText?: string
  readonly showRefreshButton?: boolean
  readonly showBackButton?: boolean
  readonly showHomeButton?: boolean
  readonly onRefresh?: () => void
  readonly onBack?: () => void
  readonly onHome?: () => void
}

/**
 * 通用错误/404 页面 — shadcn 风格, 主题色全跟随 CSS variables.
 *
 * 文案通过 props 传入 (caller 用 @zoeymind/i18n 翻译后传值); 此组件刻意不用 useTranslation,
 * 不传 prop 时 fallback 默认中文.
 *
 * 注意: 此组件可能在 Router 上下文外被渲染 (defaultErrorComponent / notFoundComponent),
 * 不用 useNavigate, 直接操作 window.location / window.history.
 */
export function ErrorPage({
  code,
  title = "出现错误",
  description = "抱歉,系统遇到了一些问题,请稍后重试",
  error,
  refreshButtonText = "重试",
  backButtonText = "返回",
  homeButtonText = "回到首页",
  showRefreshButton = true,
  showBackButton = true,
  showHomeButton = true,
  onRefresh,
  onBack,
  onHome,
}: ErrorPageProperties) {
  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh()
    } else {
      window.location.reload()
    }
  }

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      window.history.back()
    }
  }

  const handleHome = () => {
    if (onHome) {
      onHome()
    } else {
      window.location.assign("/")
    }
  }

  return (
    <div className="bg-background flex h-full min-h-full items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* 大字号代码 OR 警告图标 */}
        {code ? (
          <div className="text-muted-foreground/30 text-8xl font-bold tracking-tighter select-none md:text-9xl">
            {code}
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="bg-muted flex size-16 items-center justify-center rounded-full">
              <AlertTriangle className="text-muted-foreground size-8" />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>

        {/* 错误详情 — 仅开发模式 */}
        {error ? (
          <div className="border-destructive/30 bg-destructive/5 rounded-md border px-3 py-2 text-left">
            <p className="text-destructive font-mono text-xs break-all whitespace-pre-wrap">
              {error}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row">
          {showRefreshButton ? (
            <Button onClick={handleRefresh} className="gap-2">
              <RefreshCw className="size-4" />
              {refreshButtonText}
            </Button>
          ) : null}
          {showBackButton ? (
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="size-4" />
              {backButtonText}
            </Button>
          ) : null}
          {showHomeButton ? (
            <Button variant="outline" onClick={handleHome} className="gap-2">
              <Home className="size-4" />
              {homeButtonText}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
