import { ChevronDown, ChevronUp, AudioLines, Piano } from "lucide-react"
import { Button } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { InfoChannel } from "./InfoChannel"
import type { DetailSection } from "@/pages/project/detail-view"

export interface StatusStripProps {
  readonly footerCollapsed: boolean
  readonly clipVisible: boolean
  readonly devicesVisible: boolean
  readonly onToggleFooter: () => void
  readonly onToggleDetail: (section: DetailSection) => void
}

export function StatusStrip({
  footerCollapsed,
  clipVisible,
  devicesVisible,
  onToggleFooter,
  onToggleDetail,
}: StatusStripProps) {
  const { t } = useTranslation()
  return (
    <div className="bg-card text-muted-foreground flex h-9 shrink-0 items-center gap-2 px-2 text-xs tabular-nums">
      <Button
        variant="ghost"
        size="control-icon"
        onClick={onToggleFooter}
        aria-label={t("project.toggleFooter")}
        aria-expanded={!footerCollapsed}
      >
        {footerCollapsed ? <ChevronUp /> : <ChevronDown />}
      </Button>
      <InfoChannel />
      <div role="group" aria-label={t("detail.views")} className="flex shrink-0 items-center gap-1">
        <Button
          variant={clipVisible ? "secondary" : "ghost"}
          size="control"
          aria-pressed={clipVisible}
          aria-controls="project-clip-view"
          aria-label={t("detail.clipToggle")}
          onClick={() => onToggleDetail("clip")}
        >
          <Piano />
          {t("detail.clip")}
        </Button>
        <Button
          variant={devicesVisible ? "secondary" : "ghost"}
          size="control"
          aria-pressed={devicesVisible}
          aria-controls="project-device-view"
          aria-label={t("detail.devicesToggle")}
          onClick={() => onToggleDetail("devices")}
        >
          <AudioLines />
          {t("detail.devices")}
        </Button>
      </div>
    </div>
  )
}
