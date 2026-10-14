/**
 * 应用根 Provider 栈。
 *
 *   QueryClientProvider → 本地 I/O 查询缓存 I18nProvider        → zh-CN / en-US ThemeProvider       → light / dark / system ThemePresetProvider → 品牌配色预设 LoadingProvider     → 全局 loading 遮罩状态 RouterProvider      → / 首页 · /project/:id 单项目视图 <Loading>           → 读 LoadingProvider 渲染遮罩 <Toaster>           → 跟随主题的通知
 */
import { useEffect } from "react"
import { RouterProvider } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Loading, ThemeProvider, Toaster, useTheme } from "@zoeymind/ui"
import { I18nProvider, useTranslation } from "@zoeymind/i18n"
import { LoadingProvider, ThemePresetProvider, useLoading } from "@/shared/app-shared"
import { installExternalLinkBoundary } from "@/shared/native/external-links"
import { SettingsDialog } from "@/pages/SettingsDialog"
import { router } from "@/routes"
import { appLocales } from "@/locales"
import logoLightUrl from "@/assets/logo.svg?url"
import logoDarkUrl from "@/assets/logo-dark.svg?url"
import { SharedControlBridgeProvider } from "@/components/SharedControlBridge"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false } },
})

function InnerApp() {
  const { loading, tip, progress } = useLoading()
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const loadingLogoUrl = resolvedTheme === "dark" ? logoDarkUrl : logoLightUrl
  useEffect(() => installExternalLinkBoundary(), [])
  return (
    <>
      <RouterProvider router={router} />
      <SettingsDialog />
      <Loading
        show={loading}
        tip={tip ?? t("common.loading")}
        progress={progress}
        logoSrc={loadingLogoUrl}
      />
      <Toaster position="bottom-left" />
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider resources={appLocales}>
        <ThemeProvider defaultTheme="system">
          <ThemePresetProvider>
            <LoadingProvider>
              <SharedControlBridgeProvider>
                <InnerApp />
              </SharedControlBridgeProvider>
            </LoadingProvider>
          </ThemePresetProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}
