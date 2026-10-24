import { useTranslation } from "@zoeymind/i18n"
import type { AudioDeviceSnapshot } from "@/shared/native/audio"

export function ActualDeviceConfiguration({ device }: { device: AudioDeviceSnapshot | null }) {
  const { t } = useTranslation()
  const formatRate = (value: number) =>
    value > 0 ? t("audioSettings.hertz", { value: value.toLocaleString() }) : "—"
  const formatBuffer = (value: number) =>
    value > 0 ? t("audioSettings.frames", { count: value }) : "—"
  const latency = (frames: number | undefined) =>
    device?.state === "ready" && device.sampleRate > 0 && frames !== undefined
      ? t("audioSettings.milliseconds", { value: ((frames * 1000) / device.sampleRate).toFixed(2) })
      : t("audioSettings.notRunning")
  return (
    <>
      <h3 className="text-sm font-medium">{t("audioSettings.actual")}</h3>
      <dl
        aria-label={t("audioSettings.actual")}
        className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"
      >
        <dt className="text-muted-foreground">{t("audioSettings.state")}</dt>
        <dd aria-live="polite">{t(`audioSettings.${device?.state ?? "closed"}`)}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.host")}</dt>
        <dd>{device?.host || "—"}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.inputDevice")}</dt>
        <dd>{device?.inputDeviceName ?? t("audioSettings.noInput")}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.outputDevice")}</dt>
        <dd>{device?.deviceName ?? "—"}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.sampleRate")}</dt>
        <dd>{formatRate(device?.sampleRate ?? 0)}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.actualBuffer")}</dt>
        <dd>{formatBuffer(device?.bufferFrames ?? 0)}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.inputChannels")}</dt>
        <dd>{device?.inputChannels ?? "—"}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.channels")}</dt>
        <dd>{device?.outputChannels ?? "—"}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.confirmedRate")}</dt>
        <dd>{formatRate(device?.configuration?.sampleRate ?? 0)}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.confirmedBuffer")}</dt>
        <dd>{formatBuffer(device?.configuration?.bufferFrames ?? 0)}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.inputLatency")}</dt>
        <dd>{device?.inputDeviceId ? latency(device.inputLatencyFrames) : "—"}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.outputLatency")}</dt>
        <dd>{latency(device?.outputLatencyFrames)}</dd>
        <dt className="text-muted-foreground">{t("audioSettings.overallLatency")}</dt>
        <dd>
          {latency(device ? device.inputLatencyFrames + device.outputLatencyFrames : undefined)}
        </dd>
      </dl>
    </>
  )
}
