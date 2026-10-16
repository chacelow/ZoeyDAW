import { useTheme } from "@/shared/theme/ThemeProvider"
import { Group, Panel, PanelDivider, PanelShell } from "@/ui/panels"
import type { ReactNode, Ref } from "react"
import type { PublicInstance } from "@gpuix/react"
import type { ProjectShellApi } from "./useProjectShell"

/**
 * Named slots filled by the composition root (phase 2) and the B2 sections. Slots receive
 * ready-made nodes; the layout only owns panel geometry and active-panel chrome.
 */
export interface ProjectLayoutSlots {
  /** Header row under the titlebar (TransportBar). */
  readonly transport: ReactNode
  readonly browser: ReactNode
  readonly arrangement: ReactNode
  /** Affect Chain / Clip Edit host (FooterPanel); `null` renders no footer chrome. */
  readonly footer: ReactNode
  /** Bottom status row (StatusStrip). */
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

/**
 * Web parity: Header → [Browser | Arrangement] over the footer, then the status row.
 * Clip Edit is a continuously resizable Panel; Affect Chain keeps a fixed height outside the
 * Group so expanding Clip Edit never squeezes it (LESSONS 2026-10-14 bottom-view layout).
 */
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
        // Full extents, zero minimums, and flex factors are containment invariants, not panel defaults.
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
        {/*
          One tree for both footer views, so switching Affect Chain / Clip Edit never remounts
          the Browser/Arrangement subtree: Clip Edit is a resizable Panel inside the Group,
          Affect Chain sits after it at the footer's own fixed height.
        */}
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
              onResize={size => shell.setFooterCollapsed(size.inPixels === 0)}
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
