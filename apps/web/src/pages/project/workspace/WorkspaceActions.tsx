import { useLayoutEffect, useState, useSyncExternalStore, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "@zoeymind/i18n"
import { MoreHorizontal, PanelBottom, PanelLeft, PanelRight } from "lucide-react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  controlMetricStyle,
} from "@zoeymind/ui"
import { workspacePanels, workspaceRegions } from "./panels"
import type { WorkspaceController } from "./WorkspaceController"

const chromeMetrics = { ...controlMetricStyle("transport"), fontSize: "var(--text-control)" }
function stopChromeNavigation(event: KeyboardEvent<HTMLDivElement>) {
  if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", "Escape"].includes(
      event.key
    )
  )
    event.stopPropagation()
}
export function WorkspaceHeading({ controller }: { controller: WorkspaceController }) {
  const { t } = useTranslation()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useLayoutEffect(() => {
    setSlot(document.getElementById("app-titlebar-workspace-actions"))
  }, [])
  if (!slot) return null
  return createPortal(
    <div
      className="project-workspace-titlebar-actions"
      data-workspace-chrome=""
      onKeyDown={stopChromeNavigation}
    >
      {workspaceRegions.map(region => {
        const Icon = region === "left" ? PanelLeft : region === "bottom" ? PanelBottom : PanelRight
        const label = t(`workspace.toggle.${region}`, `Toggle ${region} region`)
        return (
          <Button
            key={region}
            variant="ghost"
            size="control-icon"
            data-titlebar-control="true"
            data-workspace-region={region}
            title={label}
            aria-label={label}
            aria-pressed={controller.isRegionVisible(region)}
            onClick={() => controller.toggleRegion(region)}
          >
            <Icon aria-hidden="true">
              <rect
                className="project-workspace-region-fill"
                x={region === "right" ? 16 : 4}
                y={region === "bottom" ? 16 : 4}
                width={region === "bottom" ? 16 : 4}
                height={region === "bottom" ? 4 : 16}
              />
            </Icon>
          </Button>
        )
      })}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="control-icon"
              data-titlebar-control="true"
              aria-label={t("workspace.menu", "Workspace menu")}
              title={t("workspace.menu", "Workspace menu")}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="project-workspace-menu"
          style={chromeMetrics}
          onKeyDown={event => {
            if (event.key !== " ") event.stopPropagation()
          }}
        >
          {workspacePanels.map(panel => (
            <DropdownMenuItem key={panel.id} onClick={() => controller.togglePanel(panel.id)}>
              {controller.hasPanel(panel.id)
                ? t("workspace.hide", "Hide")
                : t("workspace.restore", "Restore")}{" "}
              {t(`workspace.panels.${panel.id}`, panel.title)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={controller.reset}>
            {t("workspace.reset", "Reset layout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>,
    slot
  )
}
