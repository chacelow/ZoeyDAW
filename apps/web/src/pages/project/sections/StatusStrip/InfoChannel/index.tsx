import { AlertTriangle, CircleAlert, Info } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { useControlInteractions } from "@/shared/control-interactions/index"
import type { WarningSeverity } from "@/shared/control-interactions/index"
import { ProjectFileFeedback } from "@/pages/project/files"
import { useSyncExternalStore } from "react"
import { PluginFaultFeedback } from "@/pages/project/plugin-recovery"
import { readNativePluginFaults, subscribeNativeAudioStatus } from "@/shared/native/audio"
import { useProjectState } from "@/pages/project/adapters"

const SEVERITY_ICON: Record<WarningSeverity, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  error: CircleAlert,
}

const SEVERITY_COLOR: Record<WarningSeverity, string> = {
  info: "text-muted-foreground",
  warning: "text-chart-4",
  error: "text-destructive",
}

export function InfoChannel() {
  const { t } = useTranslation()
  const info = useControlInteractions(state => state.info)
  const warnings = useControlInteractions(state => state.warnings)
  const topWarning = warnings.at(-1)
  const faults = useSyncExternalStore(subscribeNativeAudioStatus, readNativePluginFaults)
  const fault = useProjectState(state =>
    faults.find(
      fault =>
        fault.sessionId === state.session.backend.sessionId &&
        state.document.tracks.some(track =>
          track.devices?.some(device => device.id === fault.deviceId && device.kind === "external")
        )
    )
  )

  if (info) {
    return (
      <div
        data-slot="info-channel"
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-xs"
      >
        <span className="text-foreground shrink-0 font-medium">
          {t(`project.info.${info}.title`)}
        </span>
        <span className="text-muted-foreground truncate">
          {t(`project.info.${info}.description`)}
        </span>
      </div>
    )
  }
  if (fault) return <PluginFaultFeedback fault={fault} className="flex-1" />

  if (topWarning) {
    const severity = topWarning.severity ?? "info"
    const Icon = SEVERITY_ICON[severity]
    const color = SEVERITY_COLOR[severity]
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-xs">
        <Icon className={`size-4 shrink-0 ${color}`} />
        <span className={`truncate ${color}`}>{topWarning.message}</span>
      </div>
    )
  }
  return <ProjectFileFeedback showDependencies />
}
