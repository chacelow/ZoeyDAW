import { Shield, ArrowLeft, LogIn } from "lucide-react"
import { Button } from "../button"

interface UnauthorizedPageProperties {
  readonly title?: string
  readonly description?: string
  readonly showBackButton?: boolean
  readonly showLoginButton?: boolean
  readonly backButtonText?: string
  readonly loginButtonText?: string
  readonly onBack?: () => void
  readonly onLogin?: () => void
}

/**
 * 401 权限不足页面 — shadcn 风格, 主题色全跟随.
 */
export function UnauthorizedPage({
  title = "访问受限",
  description = "抱歉,您没有访问此页面的权限,请联系管理员获取访问权限",
  showBackButton = true,
  showLoginButton = true,
  backButtonText = "返回",
  loginButtonText = "重新登录",
  onBack,
  onLogin,
}: UnauthorizedPageProperties) {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      window.history.back()
    }
  }

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
            <div className="bg-destructive/10 flex size-12 items-center justify-center rounded-full">
              <Shield className="text-destructive size-6" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>

        <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row">
          {showBackButton ? (
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="size-4" />
              {backButtonText}
            </Button>
          ) : null}
          {showLoginButton ? (
            <Button onClick={handleLogin} className="gap-2">
              <LogIn className="size-4" />
              {loginButtonText}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
