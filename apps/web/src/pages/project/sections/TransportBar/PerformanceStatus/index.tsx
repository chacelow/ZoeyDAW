import { useSyncExternalStore } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { readNativeAudioStatus, subscribeNativeAudioStatus } from "@/shared/native/audio"

export function PerformanceStatus() {
  const { t } = useTranslation()
  const status = useSyncExternalStore(subscribeNativeAudioStatus, readNativeAudioStatus)
  const device = status.device
  const ready = device?.state === "ready"
  return (
    <div
      data-performance-status
      role="group"
      aria-label={t("detail.performance")}
      title={status.error ?? device?.error ?? device?.deviceName ?? t("audioSettings.notRunning")}
      className="text-muted-foreground ml-2 flex shrink-0 items-center gap-2 text-xs tabular-nums"
    >
      {ready ? (
        <>
          <span title={t("audioSettings.sampleRate")}>
            {(device.sampleRate / 1000).toFixed(1)} kHz
          </span>
          <span title={t("audioSettings.actualBuffer")}>{device.bufferFrames}</span>
          <span>{device.host}</span>
        </>
      ) : (
        <span>{t(`audioSettings.${device?.state ?? "closed"}`)}</span>
      )}
    </div>
  )
}
