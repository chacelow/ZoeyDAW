/**
 * TitleBar — 40px chrome 条，`bg-muted` 融顶部 chrome 色。
 *
 * 不渲染标题；中间是空的 flex-1 作为可拖拽空白区。右侧只留 Settings 入口 +
 * 窗口按钮（非 mac 用自绘，mac 用原生红绿灯 + hiddenTitle）。
 * macOS 红绿灯位置由 `src-tauri/tauri.conf.json` trafficLightPosition 控制。
 */
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Copy, Minus, Settings, Square, X } from "lucide-react"
import { useLocation } from "react-router-dom"
import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { useSettingsDialog } from "@/shared/app-shared"
import { getTitlebarMouseAction, isPhysicalTitlebarTarget } from "./titlebar-drag"
import { useProjectState } from "@/pages/project/adapters"

const appWindow = isTauri() ? getCurrentWindow() : null

async function detectPlatform(): Promise<"macos" | "windows" | "linux"> {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("mac")) return "macos"
  if (ua.includes("win")) return "windows"
  return "linux"
}

export function TitleBar() {
  const { t } = useTranslation()
  const location = useLocation()
  // params 曾用于展示项目 ID,产品无后端、ID 对用户无意义,已去掉
  const openSettings = useSettingsDialog(state => state.openSettings)
  const projectName = useProjectState(state => state.document.name)
  const [platform, setPlatform] = useState<"macos" | "windows" | "linux">("macos")
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void detectPlatform().then(setPlatform)
  }, [])

  useEffect(() => {
    if (!appWindow) return
    let disposed = false
    const updateMaximized = () => {
      void appWindow.isMaximized().then(value => {
        if (!disposed) setMaximized(value)
      })
    }
    updateMaximized()
    let unlisten: (() => void) | undefined
    void appWindow.onResized(updateMaximized).then(stop => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const isMac = platform === "macos"

  const handleTitlebarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPhysicalTitlebarTarget(event.currentTarget, event.target as Node)) return
    const action = getTitlebarMouseAction(event.buttons, event.detail)
    const target = event.target as HTMLElement
    if (target.closest("button, [role='menuitem'], [data-tab-interactive]")) return
    if (action === "toggle-maximize") void appWindow?.toggleMaximize()
    else if (action === "start-dragging") void appWindow?.startDragging()
  }

  return (
    <div
      onMouseDown={handleTitlebarMouseDown}
      data-app-titlebar
      className="fixed inset-x-0 top-0 z-[100] flex h-16 items-stretch bg-card"
    >
      <div className={appWindow && isMac ? "w-20 shrink-0" : "w-2 shrink-0"} aria-hidden />
      <div className="flex min-w-0 flex-1 items-center justify-center text-base font-semibold text-muted-foreground">
        {location.pathname.startsWith("/project/") ? (
          <span className="truncate">{projectName}</span>
        ) : null}
      </div>
      <div data-tab-interactive className="flex h-full items-center gap-1 pr-2">
        <Button
          variant="ghost"
          size="icon-lg"
          className="shrink-0 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:scale-[0.96]"
          onClick={() => openSettings()}
          aria-label={t("settings.title", "设置")}
          title={t("settings.title", "设置")}
        >
          <Settings className="size-7" />
        </Button>
        {appWindow && !isMac && (
          <div
            className="flex h-full items-center gap-1"
            aria-label={t("windowControls.groupLabel")}
          >
            <Button
              variant="ghost"
              size="icon-lg"
              className="shrink-0 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:scale-[0.96]"
              onClick={() => void appWindow.minimize()}
              aria-label={t("windowControls.minimize")}
              title={t("windowControls.minimize")}
            >
              <Minus className="size-7 stroke-[1.5]" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="shrink-0 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:scale-[0.96]"
              onClick={() => void appWindow.toggleMaximize()}
              aria-label={t(maximized ? "windowControls.restore" : "windowControls.maximize")}
              title={t(maximized ? "windowControls.restore" : "windowControls.maximize")}
            >
              {maximized ? (
                <Copy className="size-6 stroke-[1.5]" />
              ) : (
                <Square className="size-6 stroke-[1.5]" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="shrink-0 rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground active:scale-[0.96]"
              onClick={() => void appWindow.close()}
              aria-label={t("windowControls.close")}
              title={t("windowControls.close")}
            >
              <X className="size-7 stroke-[1.5]" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
