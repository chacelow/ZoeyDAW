/**
 * ProjectLayout — 项目视图的结构合成层，只做 PanelGroup 拼装。
 *
 * 窗口纵向分三段：
 *
 *   root = flex-col bg-background
 *   ├─ TransportBar                    (融背景，无 border 无圆角)
 *   ├─ inner wrapper                   (px/pb/gap = 7px)
 *   │   ├─ Group vertical
 *   │   │   ├─ Panel 78% (top row)
 *   │   │   │   └─ Group horizontal
 *   │   │   │       ├─ Panel + PanelShell <browser>    (default 25%, collapsible)
 *   │   │   │       ├─ PanelDivider vertical
 *   │   │   │       └─ Panel + PanelShell <arrangement> (default 75%)
 *   │   │   ├─ PanelDivider horizontal
 *   │   │   └─ Panel 22% + PanelShell <footer>          (collapsible)
 *   │   └─ StatusStrip                 (融背景)
 *
 * 状态从 useProjectShell 来；section 组件接零到最少的 props，不自己管结构。
 */
import { Group, Panel } from "react-resizable-panels"
import { useTranslation } from "@zoeymind/i18n"
import { PanelDivider, PanelShell } from "@/components/panels"
import { TransportBar } from "./sections/TransportBar"
import { StatusStrip } from "./sections/StatusStrip"
import { BrowserPanel } from "./sections/BrowserPanel"
import { ArrangementPanel } from "./sections/ArrangementPanel"
import { FooterPanel } from "./sections/FooterPanel"
import type { ProjectShellApi } from "./useProjectShell"
import "./project.css"

export interface ProjectLayoutProps {
  projectId: string
  shell: ProjectShellApi
  onBack: () => void
}

export function ProjectLayout({ projectId, shell, onBack }: ProjectLayoutProps) {
  const { t } = useTranslation()
  const {
    activeSection,
    setActiveSection,
    browserCollapsed,
    footerCollapsed,
    setBrowserCollapsed,
    setFooterCollapsed,
    browserHandleRef,
    footerHandleRef,
    toggleBrowser,
    toggleFooter,
  } = shell

  return (
    <div className="flex h-full flex-col bg-card text-foreground">
      <TransportBar
        projectId={projectId}
        onBack={onBack}
        browserCollapsed={browserCollapsed}
        onToggleBrowser={toggleBrowser}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-[7px] px-[7px] pt-[7px] pb-[7px]">
        <Group orientation="vertical" className="min-h-0 flex-1">
          <Panel defaultSize="78" minSize="40">
            <Group orientation="horizontal" className="h-full min-h-0">
              <Panel
                panelRef={browserHandleRef}
                defaultSize="25"
                minSize={190}
                maxSize="50"
                collapsible
                collapsedSize="0"
                onResize={size => setBrowserCollapsed(size.asPercentage < 0.5)}
              >
                <PanelShell id="browser" active={activeSection} onActivate={setActiveSection}>
                  <BrowserPanel
                    renderBody={({ navigation, results }) => (
                      <Group orientation="horizontal" className="h-full w-full">
                        <Panel defaultSize="32" minSize={36}>
                          {navigation}
                        </Panel>
                        <PanelDivider
                          orientation="vertical"
                          aria-label={t("project.browser.resizeColumns")}
                          className="bg-transparent before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-border hover:before:bg-ring focus-visible:before:bg-ring"
                        />
                        <Panel defaultSize="68" minSize={140}>
                          {results}
                        </Panel>
                      </Group>
                    )}
                  />
                </PanelShell>
              </Panel>
              <PanelDivider orientation="vertical" />
              <Panel defaultSize="75" minSize="30">
                <PanelShell
                  id="arrangement"
                  active={activeSection}
                  onActivate={setActiveSection}
                  className="project-arrangement"
                >
                  <ArrangementPanel />
                </PanelShell>
              </Panel>
            </Group>
          </Panel>
          <PanelDivider orientation="horizontal" />
          <Panel
            panelRef={footerHandleRef}
            defaultSize="22"
            minSize="10"
            maxSize="60"
            collapsible
            collapsedSize="0"
            onResize={size => setFooterCollapsed(size.asPercentage < 0.5)}
          >
            <PanelShell id="footer" active={activeSection} onActivate={setActiveSection}>
              <FooterPanel />
            </PanelShell>
          </Panel>
        </Group>
        <StatusStrip
          projectId={projectId}
          footerCollapsed={footerCollapsed}
          onToggleFooter={toggleFooter}
        />
      </div>
    </div>
  )
}
