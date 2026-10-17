import { useLayoutEffect, useState } from "react"
import type { ReactNode } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  ControlEnvironmentProvider,
  Toaster,
  configureToastPolicy,
  dismissToast,
} from "@/ui/controls"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import type { DisplayFormats } from "@/project/model/display-formats"
import { VERIFICATION_CONTROL_INPUT_POLICY } from "@/app/control-input"
import type { ControlInfo, CursorLockPort } from "@/ui/controls"
import { GalleryCatalog, GalleryCategories } from "./catalog"
import { DockLayout } from "@/ui/panels/Dock"
import type { DockLayoutJSON, DockPanelRegistry } from "@/ui/panels/Dock"

export function createGalleryWorkspaceLayout(): DockLayoutJSON {
  return {
    version: 1,
    hidden: [],
    activeGroup: "preview",
    maximizedGroup: null,
    root: {
      kind: "split",
      id: "gallery-workspace",
      orientation: "horizontal",
      sizes: [1, 4, 2],
      children: [
        { kind: "group", id: "categories", tabs: ["categories"], active: "categories" },
        { kind: "group", id: "preview", tabs: ["preview"], active: "preview" },
        { kind: "group", id: "theme", tabs: ["theme"], active: "theme" },
      ],
    },
  }
}

export function GalleryWorkspace({
  cursorLock,
  locale,
  formats,
  themePanel,
}: {
  readonly cursorLock?: CursorLockPort
  readonly locale: "en" | "zh"
  readonly formats: DisplayFormats
  readonly themePanel?: ReactNode
}) {
  useLayoutEffect(() => {
    configureToastPolicy(PREFERENCE_DEFAULTS.notifications)
    return () => dismissToast()
  }, [])
  const theme = useTheme()
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const [info, setInfo] = useState<ControlInfo | null>(null)
  const [category, setCategory] = useState("buttons")
  const [layout, setLayout] = useState(createGalleryWorkspaceLayout)
  const registry: DockPanelRegistry = {
    categories: {
      title: t("Categories", "类别"),
      minimumSize: theme.design.dock.minimumSize,
      closable: false,
      render: () => <GalleryCategories category={category} onCategoryChange={setCategory} t={t} />,
    },
    preview: {
      title: t("Preview", "预览"),
      minimumSize: theme.design.dock.minimumSize,
      closable: false,
      render: () => <GalleryCatalog category={category} locale={locale} formats={formats} t={t} />,
    },
    theme: {
      title: t("Theme", "主题"),
      minimumSize: theme.design.dock.minimumSize,
      closable: false,
      render: () => themePanel,
    },
  }
  return (
    <ControlEnvironmentProvider
      value={{ cursorLock, setInfo, inputPolicy: VERIFICATION_CONTROL_INPUT_POLICY }}
    >
      <div
        testId="gallery-root"
        role="application"
        aria-label={t("Native composition gallery", "原生组合画廊")}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          minHeight: 0,
          backgroundColor: theme.colors.background,
          color: theme.colors.foreground,
          fontSize: theme.control["--text-control-track"],
        }}
      >
        <DockLayout
          testId="gallery-workspace"
          layout={layout}
          registry={registry}
          onLayoutChange={setLayout}
          labels={{
            close: t("Close", "关闭"),
            closeOthers: t("Close others", "关闭其他"),
            splitRight: t("Split right", "向右拆分"),
            splitDown: t("Split down", "向下拆分"),
            maximize: t("Maximize group", "最大化面板组"),
            restore: t("Restore group", "还原面板组"),
            hide: t("Hide", "隐藏"),
            dragGroup: t("Drag group", "拖动面板组"),
            more: t("More group actions", "更多面板组操作"),
            showPanels: t("Show panels", "显示面板"),
          }}
        />
        <text role="status" aria-label={t("Gallery status", "画廊状态")}>
          {`${t("Info", "提示")}: ${info ?? "—"} · ${t("Ready · UI examples only", "就绪 · 仅 UI 示例")}`}
        </text>
        <Toaster
          policy={PREFERENCE_DEFAULTS.notifications}
          aria-label={t("Notifications", "通知")}
          dismissLabel={t("Dismiss notification", "关闭通知")}
          loadingLabel={t("Loading", "加载中")}
        />
      </div>
    </ControlEnvironmentProvider>
  )
}
