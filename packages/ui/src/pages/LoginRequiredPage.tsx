import { LogIn, User } from "lucide-react"
import { Button } from "../button"

interface LoginRequiredPageProperties {
  readonly title?: string
  readonly description?: string
  readonly showLoginButton?: boolean
  readonly onLogin?: () => void
}

/**
 * 需要登录页面 — shadcn 风格, 主题色全跟随.
 *
 * 默认作为 401 状态展示 (访问需登录的资源, 但用户未登录).
 */
export function LoginRequiredPage({
  title = "需要登录",
  description = "请先登录您的账户以访问此功能",
  showLoginButton = true,
  onLogin,
}: LoginRequiredPageProperties) {
  const handleLogin = () => {
    if (onLogin) {
      onLogin()
    } else {
      window.location.assign("/login")
    }
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="text-muted-foreground/30 text-8xl font-bold tracking-tighter select-none md:text-9xl">
          401
        </div>

        <div className="space-y-2">
          <div className="mb-3 flex justify-center">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full">
              <User className="text-muted-foreground size-6" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>

        {showLoginButton ? (
          <div className="flex justify-center pt-2">
            <Button onClick={handleLogin} className="gap-2 px-8">
              <LogIn className="size-4" />
              立即登录
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
