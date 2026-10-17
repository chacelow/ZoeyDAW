import { useCallback, useLayoutEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { chineseDockLabels, englishDockLabels } from "@/app/locales/sections/dock"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ControlEnvironmentProvider,
  Toaster,
  configureToastPolicy,
  dismissToast,
} from "@/ui/controls"
import { TitleBar, TitleBarMenuButton } from "@/ui/panels/TitleBar"
import type { TitleBarWindow } from "@/ui/panels/TitleBar"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import type { DisplayFormats } from "@/project/model/display-formats"
import { VERIFICATION_CONTROL_INPUT_POLICY } from "@/app/control-input"
import type { ControlInfo, CursorLockPort } from "@/ui/controls"
import { GalleryCatalog, GalleryCategories } from "./catalog"
import { DockLayout, DockLayoutToggles, DockViewMenu } from "@/ui/panels/Dock"
import type { DockLayoutJSON, DockPanelRegistry } from "@/ui/panels/Dock"

export function createGalleryWorkspaceLayout(): DockLayoutJSON {
  return {
    version: 2,
    borders: {
      left: { tabs: ["categories"], end: [], selected: "categories", size: DEFAULT_DESIGN_TOKENS.dock.borderSize, type: "split" },
      bottom: { tabs: [], end: [], selected: null, size: DEFAULT_DESIGN_TOKENS.dock.borderSize, type: "split" },
      right: {
        tabs: ["theme"],
        end: [],
        selected: null,
        size: DEFAULT_DESIGN_TOKENS.dock.borderSize,
        type: "overlay",
      },
    },
    hidden: [],
    activeGroup: "preview",
    maximizedGroup: null,
    root: { kind: "group", id: "preview", tabs: ["preview"], active: "preview" },
  }
}

export function GalleryWorkspace({
  cursorLock,
  locale,
  formats,
  themePanel,
  window,
  onLocaleChange,
}: {
  readonly cursorLock?: CursorLockPort
  readonly locale: "en" | "zh"
  readonly formats: DisplayFormats
  readonly themePanel?: ReactNode
  readonly window?: TitleBarWindow
  readonly onLocaleChange?: (locale: "en" | "zh") => void
}) {
  useLayoutEffect(() => {
    configureToastPolicy(PREFERENCE_DEFAULTS.notifications)
    return () => dismissToast()
  }, [])
  const theme = useTheme()
  const t = useCallback((en: string, zh: string) => (locale === "zh" ? zh : en), [locale])
  const [info, setInfo] = useState<ControlInfo | null>(null)
  const [category, setCategory] = useState("buttons")
  const [layout, setLayout] = useState(createGalleryWorkspaceLayout)
  const registry = useMemo<DockPanelRegistry>(
    () => ({
      categories: {
        title: t("Categories", "类别"),
        icon: "List",
        minimumSize: theme.design.dock.minimumSize,
        render: () => (
          <GalleryCategories category={category} onCategoryChange={setCategory} t={t} />
        ),
      },
      preview: {
        title: t("Preview", "预览"),
        icon: "PanelsTopLeft",
        minimumSize: theme.design.dock.minimumSize,
        render: () => (
          <GalleryCatalog category={category} locale={locale} formats={formats} t={t} />
        ),
      },
      theme: {
        title: t("Theme", "主题"),
        icon: "Palette",
        minimumSize: theme.design.dock.minimumSize,
        render: () => themePanel,
      },
    }),
    [t, category, formats, locale, themePanel, theme.design.dock.minimumSize]
  )
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
        <TitleBar
          testId="gallery-titlebar"
          title={t("ZoeyDAW · Component Gallery", "ZoeyDAW · 组件画廊")}
          window={window}
          actions={<DockLayoutToggles layout={layout} onLayoutChange={setLayout} labels={locale === "zh" ? chineseDockLabels : englishDockLabels} testId="gallery-layout" />}
          labels={{
            minimize: t("Minimize window", "最小化窗口"),
            maximizeRestore: t("Maximize / restore window", "最大化 / 还原窗口"),
            close: t("Close window", "关闭窗口"),
          }}
          left={
            window?.platform === "macos" ? undefined : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <TitleBarMenuButton label={t("File", "文件")} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem disabled={!window} onSelect={window?.close}>
                      {t("Close window", "关闭窗口")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <TitleBarMenuButton label={t("Edit", "编辑")} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      disabled={!onLocaleChange}
                      onSelect={() => onLocaleChange?.("en")}
                    >
                      English
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!onLocaleChange}
                      onSelect={() => onLocaleChange?.("zh")}
                    >
                      中文
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DockViewMenu
                  layout={layout}
                  registry={registry}
                  onLayoutChange={setLayout}
                  labels={locale === "zh" ? chineseDockLabels : englishDockLabels}
                  testId="gallery-view"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <TitleBarMenuButton label={t("Help", "帮助")} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem disabled>
                      {t("UI examples only", "仅 UI 示例")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )
          }
        />
        <div style={{ flexGrow: 1, minHeight: 0, minWidth: 0 }}>
          <DockLayout
            testId="gallery-workspace"
            layout={layout}
            registry={registry}
            onLayoutChange={setLayout}
            labels={locale === "zh" ? chineseDockLabels : englishDockLabels}
          />
        </div>
        <text
          role="status"
          aria-label={t("Gallery status", "画廊状态")}
          style={{
            borderTopWidth: theme.design.shape.separatorWidth,
            borderColor: theme.colors.border,
          }}
        >
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
