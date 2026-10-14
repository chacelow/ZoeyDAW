import { useEffect, useState } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Copy, Minus, Settings, Square, X } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { useSettingsDialog } from "@/shared/app-shared"
import { getTitlebarMouseAction, isPhysicalTitlebarTarget } from "../titlebar-drag"
import type { MouseEvent as ReactMouseEvent } from "react"

const appWindow = isTauri() ? getCurrentWindow() : null

async function detectPlatform(): Promise<"macos" | "windows" | "linux"> {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("mac")) {
    return "macos"
  }
  return ua.includes("win") ? "windows" : "linux"
}

export function TitleBar({ title }: { readonly title?: string }) {
  const { t } = useTranslation()
  const openSettings = useSettingsDialog(state => state.openSettings)
  const [platform, setPlatform] = useState<"macos" | "windows" | "linux">("macos")
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void detectPlatform().then(setPlatform)
  }, [])

  useEffect(() => {
    if (!appWindow) {
      return
    }
    let isDisposed = false
    const updateMaximized = () => {
      void appWindow.isMaximized().then(value => {
        if (!isDisposed) {
          setMaximized(value)
        }
      })
    }
    updateMaximized()
    let unlisten: (() => void) | undefined
    void appWindow.onResized(updateMaximized).then(stop => {
      if (isDisposed) {
        stop()
      } else {
        unlisten = stop
      }
    })
    return () => {
      isDisposed = true
      unlisten?.()
    }
  }, [])

  const isMac = platform === "macos"

  const handleTitlebarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPhysicalTitlebarTarget(event.currentTarget, event.target as Node)) {
      return
    }
    const action = getTitlebarMouseAction(event.buttons, event.detail)
    const target = event.target as HTMLElement
    if (target.closest("button, [role='menuitem'], [data-tab-interactive]")) {
      return
    }
    if (action === "toggle-maximize") {
      void appWindow?.toggleMaximize()
    } else if (action === "start-dragging") {
      void appWindow?.startDragging()
    }
  }

  return (
    <div
      onMouseDown={handleTitlebarMouseDown}
      data-app-titlebar
      className="bg-card fixed inset-x-0 top-0 z-[100] flex h-16 items-stretch"
    >
      <div className={appWindow && isMac ? "w-20 shrink-0" : "w-2 shrink-0"} aria-hidden />
      <div className="text-muted-foreground flex min-w-0 flex-1 items-center justify-center text-base font-semibold">
        {title ? <span className="truncate">{title}</span> : null}
      </div>
      <div data-tab-interactive className="flex h-full items-center gap-1 pr-2">
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground shrink-0 rounded-full active:scale-[0.96]"
          onClick={() => openSettings()}
          aria-label={t("settings.title", "设置")}
          title={t("settings.title", "设置")}
        >
          <Settings className="size-7" />
        </Button>
        {appWindow && !isMac ? (
          <div
            role="group"
            className="flex h-full items-center gap-1"
            aria-label={t("windowControls.groupLabel")}
          >
            <Button
              variant="ghost"
              size="icon-lg"
              className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground shrink-0 rounded-full active:scale-[0.96]"
              onClick={() => void appWindow.minimize()}
              aria-label={t("windowControls.minimize")}
              title={t("windowControls.minimize")}
            >
              <Minus className="size-7 stroke-[1.5]" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground shrink-0 rounded-full active:scale-[0.96]"
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
              className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground shrink-0 rounded-full active:scale-[0.96]"
              onClick={() => void appWindow.close()}
              aria-label={t("windowControls.close")}
              title={t("windowControls.close")}
            >
              <X className="size-7 stroke-[1.5]" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
