/**
 * StatusStrip — 底部状态条。
 *
 * 左：折叠底栏 toggle
 * 中：`<InfoChannel />` 展示 hover info / warnings（填满空间）
 * 右：真实监控（采样率 / 缓冲 / CPU）
 *
 * 和 chrome 同色 `bg-card`，无 border 无圆角。
 */
import { ChevronDown, ChevronUp } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { InfoChannel } from "./InfoChannel"

export interface StatusStripProps {
  readonly projectId: string
  readonly footerCollapsed: boolean
  readonly onToggleFooter: () => void
}

export function StatusStrip({ footerCollapsed, onToggleFooter }: StatusStripProps) {
  const { t } = useTranslation()
  return (
    <div className="bg-card text-muted-foreground flex h-9 shrink-0 items-center gap-4 px-4 text-xs tabular-nums">
      <button
        type="button"
        onClick={onToggleFooter}
        className="hover:bg-accent hover:text-accent-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-sm"
        title={t("project.toggleFooter")}
        aria-label={t("project.toggleFooter")}
      >
        {footerCollapsed ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
      </button>
      <InfoChannel />
      <div className="flex shrink-0 items-center gap-3">
        <span>{t("project.status.sampleRate")}</span>
        <span>{t("project.status.buffer")}</span>
        <span>{t("project.status.cpu")}</span>
      </div>
    </div>
  )
}
