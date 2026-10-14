import { Home, ArrowLeft } from "lucide-react"
import { Button } from "../button"

interface NotFoundPageProperties {
  readonly title?: string
  readonly description?: string
  readonly showBackButton?: boolean
  readonly showHomeButton?: boolean
  readonly onBack?: () => void
  readonly onHome?: () => void
}

/**
 * 404页面组件 用于显示页面不存在的状态
 */
export function NotFoundPage({
  title = "页面不存在",
  description = "抱歉，您访问的页面不存在或已被移除",
  showBackButton = true,
  showHomeButton = true,
  onBack,
  onHome,
}: NotFoundPageProperties) {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      window.history.back()
    }
  }

  const handleHome = () => {
    onHome?.()
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* 404图标 */}
        <div className="mb-8">
          <div className="text-muted-foreground/20 mb-2 text-8xl font-bold">404</div>
          <div className="bg-primary mx-auto h-1 w-24 rounded-full" />
        </div>

        {/* 标题和描述 */}
        <h1 className="mb-4 text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">{description}</p>

        {/* 操作按钮 */}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          {showBackButton ? (
            <Button variant="outline" onClick={handleBack} className="flex items-center gap-2">
              <ArrowLeft className="size-4" />
              返回上页
            </Button>
          ) : null}
          {showHomeButton && onHome ? (
            <Button onClick={handleHome} className="flex items-center gap-2">
              <Home className="size-4" />
              返回首页
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
