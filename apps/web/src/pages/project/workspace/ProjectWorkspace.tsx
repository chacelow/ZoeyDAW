import { useMemo, useSyncExternalStore } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { DEVICE_VIEW_HEIGHT } from "../detail-view"
import type { WorkspaceController } from "./WorkspaceController"
import { WorkspacePanel } from "./WorkspacePanels"
import { WorkspaceHeading } from "./WorkspaceActions"
import { DockLayout, type DockLabels, type DockRegistry } from "./dock/DockLayout"
import "./workspace.css"

export function ProjectWorkspace({ controller }: { readonly controller: WorkspaceController }) {
  const { t } = useTranslation()
  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const labels: DockLabels = {
    close: t("workspace.close", "Close panel"),
    closeOthers: t("workspace.closeOthers", "Close other panels"),
    splitRight: t("workspace.splitRight", "Split right"),
    splitDown: t("workspace.splitDown", "Split down"),
    maximize: t("workspace.maximizeGroup", "Maximize group"),
    restore: t("workspace.restoreGroup", "Restore group"),
    hide: t("workspace.hide", "Hide"),
    dragGroup: t("workspace.dragGroup", "Drag group"),
    more: t("workspace.panelMenu", "Panel actions"),
    showPanels: t("workspace.showPanels", "Show panels"),
    railOptions: t("workspace.railOptions", "Sidebar options"),
    overlayMode: t("workspace.overlayMode", "Overlay mode"),
    hoverReveal: t("workspace.hoverReveal", "Reveal on hover"),
  }
  const registry = useMemo<DockRegistry>(
    () => ({
      browser: {
        title: t("workspace.panels.browser", "Browser"),
        minimumSize: 190,
        render: visible => <WorkspacePanel id="browser" visible={visible} />,
      },
      arrangement: {
        title: t("workspace.panels.arrangement", "Arrangement"),
        minimumSize: 160,
        render: visible => <WorkspacePanel id="arrangement" visible={visible} />,
      },
      clip: {
        title: t("workspace.panels.clip", "Clip"),
        minimumSize: 160,
        render: visible => <WorkspacePanel id="clip" visible={visible} />,
      },
      devices: {
        title: t("workspace.panels.devices", "Devices"),
        minimumSize: 80,
        fixedContentHeight: DEVICE_VIEW_HEIGHT,
        render: visible => <WorkspacePanel id="devices" visible={visible} />,
      },
    }),
    [t]
  )
  return (
    <div className="project-workspace">
      <WorkspaceHeading controller={controller} />
      <DockLayout
        layout={controller.layout}
        registry={registry}
        labels={labels}
        onLayoutChange={controller.setLayout}
      />
    </div>
  )
}
