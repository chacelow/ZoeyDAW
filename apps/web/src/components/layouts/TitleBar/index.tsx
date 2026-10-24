import { useEffect, useState } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Copy, Minus, Settings, Square, X } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, CONTROL_METRICS, controlMetricStyle } from "@zoeymind/ui"
import { useSettingsDialog } from "@/shared/app-shared"
import { getTitlebarMouseAction, isPhysicalTitlebarTarget } from "../titlebar-drag"
import { nativeApplicationLifecycle } from "@/shared/native/application-lifecycle"
import type { MouseEvent as ReactMouseEvent } from "react"

const appWindow = isTauri() ? getCurrentWindow() : null
const transportMetrics = CONTROL_METRICS.transport
const titlebarMetrics = controlMetricStyle({
  ...transportMetrics,
  "--spacing-control-track":
    transportMetrics["--spacing-control-track"] +
    transportMetrics["--spacing-control-track-gap"] * 2,
  "--spacing-control-icon":
    transportMetrics["--spacing-control-icon"] + transportMetrics["--spacing-control-track-pad"],
})

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
    const target = event.target
    if (!(target instanceof Element) || !isPhysicalTitlebarTarget(event.currentTarget, target)) {
      return
    }
    if (target.closest("button, [role='menuitem'], [data-tab-interactive]")) {
      return
    }
    const action = getTitlebarMouseAction(event.buttons, event.detail)
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
      data-native-window-controls={Boolean(appWindow && !isMac)}
      style={{ display: "grid", ...titlebarMetrics }}
      className="app-titlebar bg-card fixed inset-x-0 top-0 z-[100] items-center"
    >
      <div aria-hidden />
      <div className="text-muted-foreground px-control-gap flex min-w-0 items-center justify-center text-xs font-medium">
        {title ? <span className="truncate">{title}</span> : null}
      </div>
      <div
        data-tab-interactive
        className="app-titlebar-actions gap-control-gap pr-control-track-gap flex h-full min-w-0 items-center justify-end"
      >
        <div
          id="app-titlebar-workspace-actions"
          className="gap-control-gap flex shrink-0 items-center"
        />
        <Button
          variant="ghost"
          size="control-icon"
          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          onClick={() => openSettings()}
          aria-label={t("settings.title", "设置")}
          title={t("settings.title", "设置")}
        >
          <Settings />
        </Button>
        {appWindow && !isMac ? (
          <div
            role="group"
            className="gap-control-gap flex h-full shrink-0 items-center"
            aria-label={t("windowControls.groupLabel")}
          >
            <Button
              variant="ghost"
              size="control-icon"
              className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              onClick={() => void appWindow.minimize()}
              aria-label={t("windowControls.minimize")}
              title={t("windowControls.minimize")}
            >
              <Minus className="stroke-[1.5]" />
            </Button>
            <Button
              variant="ghost"
              size="control-icon"
              className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              onClick={() => void appWindow.toggleMaximize()}
              aria-label={t(maximized ? "windowControls.restore" : "windowControls.maximize")}
              title={t(maximized ? "windowControls.restore" : "windowControls.maximize")}
            >
              {maximized ? <Copy className="stroke-[1.5]" /> : <Square className="stroke-[1.5]" />}
            </Button>
            <Button
              variant="ghost"
              size="control-icon"
              className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => void nativeApplicationLifecycle.requestClose()}
              aria-label={t("windowControls.close")}
              title={t("windowControls.close")}
            >
              <X className="stroke-[1.5]" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
