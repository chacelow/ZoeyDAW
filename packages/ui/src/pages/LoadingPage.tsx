import { Loader2 } from "lucide-react"

interface LoadingPageProperties {
  readonly title?: string
  readonly description?: string
  readonly showSpinner?: boolean
}

/**
 * 加载页面组件 用于显示加载中状态
 */
export function LoadingPage({
  title = "加载中",
  description = "正在为您准备内容，请稍候...",
  showSpinner = true,
}: LoadingPageProperties) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* 加载动画 */}
        {showSpinner ? (
          <div className="mb-8">
            <div className="bg-primary/10 mx-auto mb-4 flex size-20 items-center justify-center rounded-full">
              <Loader2 className="text-primary size-10 animate-spin" />
            </div>
            <div className="bg-primary mx-auto h-1 w-24 animate-pulse rounded-full" />
          </div>
        ) : null}

        {/* 标题和描述 */}
        <h1 className="mb-4 text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
