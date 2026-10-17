import { useMemo } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { DockLayout, DockLayoutToggles, DockViewMenu } from "@/ui/panels"
import { Separator } from "@/ui/controls"
import type { DockPanelRegistry } from "@/ui/panels"
import type { ReactNode, Ref } from "react"
import type { KeyEvent, PublicInstance } from "@gpuix/react"
import { useAppTranslation } from "../i18n"
import { chineseFooterLabels, englishFooterLabels } from "../locales/sections/footer"
import { chineseDockLabels, englishDockLabels } from "../locales/sections/dock"
import type { ProjectShellApi } from "./useProjectShell"

export interface ProjectLayoutSlots {
  readonly transport: ReactNode
  readonly browser: ReactNode
  readonly arrangement: ReactNode
  readonly clipEditor: ReactNode
  readonly devices: ReactNode
  readonly status: ReactNode
}
export interface ProjectLayoutProps extends ProjectLayoutSlots {
  readonly projectId: string
  readonly shell: ProjectShellApi
  readonly focusRef: Ref<PublicInstance>
  readonly onDockKeyDown?: (event: KeyEvent) => void
  readonly renderViewMenu?: (view: ReactNode, toggles: ReactNode) => ReactNode
  readonly labels: {
    readonly browserPanel: string
    readonly arrangementPanel: string
  }
}
export function ProjectLayout({
  projectId,
  shell,
  focusRef,
  labels,
  transport,
  browser,
  arrangement,
  clipEditor,
  devices,
  status,
  onDockKeyDown,
  renderViewMenu,
}: ProjectLayoutProps) {
  const theme = useTheme()
  const { locale } = useAppTranslation()
  const zh = locale === "zh-CN"
  const footerLabels = zh ? chineseFooterLabels : englishFooterLabels
  const registry = useMemo<DockPanelRegistry>(
    () => ({
      browser: {
        title: labels.browserPanel,
        icon: "Folder",
        minimumSize:
          theme.project.browserNavigationWidth +
          theme.project.browserResultsWidth +
          theme.design.shape.separatorWidth,
        render: () => browser,
      },
      arrangement: {
        title: labels.arrangementPanel,
        icon: "LayoutList",
        minimumSize: theme.project.timelineMinHeight,
        render: () => arrangement,
      },
      clipEditor: {
        title: footerLabels.clipTab,
        icon: "Music",
        minimumSize: theme.design.dock.minimumSize,
        render: () => clipEditor,
      },
      devices: {
        title: footerLabels.devicesTab,
        icon: "SlidersHorizontal",
        minimumSize: theme.design.dock.minimumSize,
        render: () => devices,
      },
    }),
    [
      browser,
      arrangement,
      clipEditor,
      devices,
      labels.browserPanel,
      labels.arrangementPanel,
      footerLabels,
      theme,
    ]
  )
  const viewMenu = (
    <DockViewMenu
      layout={shell.layout}
      registry={registry}
      onLayoutChange={shell.setLayout}
      labels={zh ? chineseDockLabels : englishDockLabels}
      testId="project-view-menu"
    />
  )
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      testId="project-layout"
      role="group"
      aria-label={projectId}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        backgroundColor: theme.colors.muted,
        color: theme.colors.foreground,
      }}
    >
      {renderViewMenu?.(
        viewMenu,
        <DockLayoutToggles
          layout={shell.layout}
          onLayoutChange={shell.setLayout}
          labels={zh ? chineseDockLabels : englishDockLabels}
          testId="project-layout-toggle"
        />
      )}
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", flexShrink: 0 }}>
        <div style={{ flexGrow: 1, minWidth: 0 }}>{transport}</div>
        {!renderViewMenu ? viewMenu : null}
      </div>
      <Separator decorative />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <div style={{ flexGrow: 1, minHeight: 0, minWidth: 0 }}>
          <DockLayout
            ref={shell.dockRef}
            layout={shell.layout}
            registry={registry}
            onLayoutChange={shell.setLayout}
            testId="project-workspace"
            onFocusChange={focused => {
              shell.dockFocused.current = focused
            }}
            onKeyDown={onDockKeyDown}
            labels={zh ? chineseDockLabels : englishDockLabels}
          />
        </div>
        <Separator decorative />
        <div style={{ flexShrink: 0 }}>{status}</div>
      </div>
    </div>
  )
}
