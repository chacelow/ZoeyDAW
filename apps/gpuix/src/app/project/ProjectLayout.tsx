import { useTheme } from "@/shared/theme/ThemeProvider"
import { Group, Panel, PanelDivider, PanelShell } from "@/ui/panels"
import type { ReactNode, Ref } from "react"
import type { PublicInstance } from "@gpuix/react"
import type { ProjectShellApi } from "./useProjectShell"

export interface ProjectLayoutSlots {
  readonly transport: ReactNode
  readonly browser: ReactNode
  readonly arrangement: ReactNode
  readonly footer: ReactNode
  readonly status: ReactNode
}

export interface ProjectLayoutProps extends ProjectLayoutSlots {
  readonly projectId: string
  readonly shell: ProjectShellApi
  readonly focusRef: Ref<PublicInstance>
  readonly labels: {
    readonly resizeClipEdit: string
    readonly resizeBrowser: string
    readonly browserPanel: string
    readonly arrangementPanel: string
    readonly footerPanel: string
    readonly activeDescription: string
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
  footer,
  status,
}: ProjectLayoutProps) {
  const theme = useTheme()
  const panels = theme.layout.project.panels
  const gap = theme.project.panelGap
  const clipView = shell.footerView === "clip"
  const footerShell =
    footer === null ? null : (
      <PanelShell
        id="footer"
        aria-label={labels.footerPanel}
        activeDescription={labels.activeDescription}
        active={shell.activeSection}
        onActivate={shell.setActiveSection}
      >
        {footer}
      </PanelShell>
    )
  const workspace = (
    <Group orientation="horizontal" testId="project-workspace">
      <Panel
        panelRef={shell.browserHandleRef}
        defaultSize={panels.browserDefaultSize}
        minSize={theme.project.browserNavigationWidth + theme.project.browserResultsWidth + gap}
        maxSize={panels.browserMaxSize}
        collapsible
        collapsedSize={0}
        testId="browser-panel"
      >
        <PanelShell
          id="browser"
          aria-label={labels.browserPanel}
          activeDescription={labels.activeDescription}
          active={shell.activeSection}
          onActivate={shell.setActiveSection}
        >
          {browser}
        </PanelShell>
      </Panel>
      <PanelDivider
        orientation="vertical"
        aria-label={labels.resizeBrowser}
        testId="browser-divider"
      />
      <Panel minSize={panels.arrangementMinWidth} testId="arrangement-panel">
        <PanelShell
          id="arrangement"
          aria-label={labels.arrangementPanel}
          activeDescription={labels.activeDescription}
          active={shell.activeSection}
          onActivate={shell.setActiveSection}
        >
          {arrangement}
        </PanelShell>
      </Panel>
    </Group>
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
      {transport}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
          gap,
          padding: gap,
        }}
      >
        <Group orientation="vertical" style={{ flexGrow: 1, minHeight: 0 }} testId="project-main">
          <Panel minSize={theme.project.timelineMinHeight} testId="workspace-panel">
            {workspace}
          </Panel>
          {clipView ? (
            <PanelDivider
              orientation="horizontal"
              aria-label={labels.resizeClipEdit}
              hidden={shell.footerCollapsed}
            />
          ) : null}
          {clipView ? (
            <Panel
              panelRef={shell.clipHandleRef}
              defaultSize={panels.clipDefaultSize}
              minSize={panels.clipMinSize}
              maxSize={panels.clipMaxSize}
              collapsible
              collapsedSize={0}
              onResize={size => shell.reportClipCollapsed(size.inPixels === 0)}
              testId="clip-panel"
            >
              {footerShell}
            </Panel>
          ) : null}
        </Group>
        {clipView ? null : (
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
            {footerShell}
          </div>
        )}
        {status}
      </div>
    </div>
  )
}
