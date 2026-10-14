import { Group, Panel } from "react-resizable-panels"
import { useTranslation } from "@zoeymind/i18n"
import { PanelDivider, PanelShell } from "@/components/panels"
import { TransportBar } from "./sections/TransportBar"
import { StatusStrip } from "./sections/StatusStrip"
import { BrowserPanel } from "./sections/BrowserPanel"
import { ArrangementPanel } from "./sections/ArrangementPanel"
import { FooterPanel } from "./sections/FooterPanel"
import { DeviceDivider } from "./sections/FooterPanel/DeviceDivider"
import type { ProjectShellApi } from "./useProjectShell"
import { DEVICE_VIEW_HEIGHT, CLIP_VIEW_MIN_HEIGHT } from "./detail-view"
import "./project.css"

export interface ProjectLayoutProps {
  readonly projectId: string
  readonly shell: ProjectShellApi
  readonly onBack: () => void
}

export function ProjectLayout({ projectId, shell, onBack }: ProjectLayoutProps) {
  const { t } = useTranslation()
  const {
    activeSection,
    setActiveSection,
    footerCollapsed,
    clipCollapsed,
    devicesCollapsed,
    setBrowserCollapsed,
    reportDetailSize,
    setDeviceExpanded,
    browserHandleRef,
    clipHandleRef,
    toggleBrowser,
    toggleFooter,
    toggleDetail,
  } = shell

  return (
    <div className="bg-card text-foreground flex h-full flex-col">
      <TransportBar onBack={onBack} onToggleBrowser={toggleBrowser} />

      <div className="flex min-h-0 flex-1 flex-col gap-[var(--project-panel-gap)] px-[var(--project-panel-gap)] pt-[var(--project-panel-gap)] pb-[var(--project-panel-gap)]">
        <div className="flex min-h-0 flex-1 flex-col">
          <Group
            id={`project-layout-${projectId}`}
            orientation="vertical"
            className="min-h-0 flex-1"
          >
            <Panel minSize={180}>
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
                            className="before:bg-border hover:before:bg-ring focus-visible:before:bg-ring bg-transparent before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:w-px"
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
            <PanelDivider
              orientation="horizontal"
              aria-label={t("detail.clipResize")}
              disabled={clipCollapsed}
              hidden={clipCollapsed}
            />
            <Panel
              id="project-clip-view"
              panelRef={clipHandleRef}
              defaultSize={0}
              minSize={CLIP_VIEW_MIN_HEIGHT}
              maxSize="70"
              collapsible
              collapsedSize={0}
              onResize={size => reportDetailSize("clip", size.inPixels)}
            >
              <PanelShell id="clip" active={activeSection} onActivate={setActiveSection}>
                {!clipCollapsed && <FooterPanel view="clip" onClose={() => toggleDetail("clip")} />}
              </PanelShell>
            </Panel>
          </Group>
          <DeviceDivider expanded={!devicesCollapsed} onExpandedChange={setDeviceExpanded} />
          <div
            id="project-device-view"
            className="shrink-0 overflow-hidden"
            style={{ height: devicesCollapsed ? 0 : DEVICE_VIEW_HEIGHT }}
          >
            <PanelShell id="devices" active={activeSection} onActivate={setActiveSection}>
              {!devicesCollapsed && (
                <FooterPanel view="devices" onClose={() => toggleDetail("devices")} />
              )}
            </PanelShell>
          </div>
        </div>
        <StatusStrip
          footerCollapsed={footerCollapsed}
          clipVisible={!clipCollapsed}
          devicesVisible={!devicesCollapsed}
          onToggleFooter={toggleFooter}
          onToggleDetail={toggleDetail}
        />
      </div>
    </div>
  )
}
