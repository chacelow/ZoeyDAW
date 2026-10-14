import { useTranslation } from "@zoeymind/i18n"
import { Progress } from "@zoeymind/ui"

const PROTOTYPE_STATUS = { sampleRateKhz: 48, bufferSize: 256, cpuPercent: 2 }

export function PerformanceStatus() {
  const { t } = useTranslation()
  return (
    <div
      data-performance-status
      role="group"
      aria-label={t("detail.performance")}
      title={t("detail.performancePrototype")}
      className="text-muted-foreground ml-2 flex shrink-0 items-center gap-2 text-xs tabular-nums"
    >
      <span title={t("detail.sampleRate", { value: PROTOTYPE_STATUS.sampleRateKhz })}>
        {PROTOTYPE_STATUS.sampleRateKhz.toFixed(1)} kHz
      </span>
      <span title={t("detail.buffer", { value: PROTOTYPE_STATUS.bufferSize })}>
        {PROTOTYPE_STATUS.bufferSize}
      </span>
      <div className="flex items-center gap-1">
        <div className="w-10">
          <Progress
            value={PROTOTYPE_STATUS.cpuPercent}
            aria-label={t("detail.cpu", { value: PROTOTYPE_STATUS.cpuPercent })}
          />
        </div>
        <span>{t("detail.cpu", { value: PROTOTYPE_STATUS.cpuPercent })}</span>
      </div>
    </div>
  )
}
