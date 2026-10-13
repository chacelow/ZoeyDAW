/**
 * InfoChannel — StatusStrip 内嵌的信息展示通道。
 *
 * 优先级：hover info（有则显示）→ 最新 warning → 空占位
 * 全部走 token 色；severity 控制图标和强调色。
 */
import { AlertTriangle, CircleAlert, Info } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { useInfoHover, type WarningSeverity } from "@/pages/project/stores/useInfoHover"

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
  const info = useInfoHover(state => state.info)
  const warnings = useInfoHover(state => state.warnings)
  const topWarning = warnings[warnings.length - 1]

  if (info) {
    return (
      <div
        data-slot="info-channel"
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-xs"
      >
        <span className="shrink-0 font-medium text-foreground">
          {t(`project.info.${info}.title`)}
        </span>
        <span className="truncate text-muted-foreground">
          {t(`project.info.${info}.description`)}
        </span>
      </div>
    )
  }

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

  return <div className="flex-1" />
}
