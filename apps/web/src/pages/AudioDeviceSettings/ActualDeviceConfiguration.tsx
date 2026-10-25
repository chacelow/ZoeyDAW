import { useTranslation } from "@zoeymind/i18n"
import type { AudioDeviceConfiguration, AudioDeviceSnapshot } from "@/shared/native/audio"

export function ActualDeviceConfiguration({
  device,
  draft,
}: {
  device: AudioDeviceSnapshot | null
  draft: AudioDeviceConfiguration | null
}) {
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
    <dl aria-label={t("audioSettings.actual")} className="flex min-w-0 flex-col gap-3 text-sm">
      <div className="settings-row">
        <dt className="text-muted-foreground">{t("audioSettings.state")}</dt>
        <dd aria-live="polite">{t(`audioSettings.${device?.state ?? "closed"}`)}</dd>
      </div>
      {device && device.sampleRate > 0 && device.sampleRate !== draft?.sampleRate && (
        <div className="settings-row">
          <dt className="text-muted-foreground">{t("audioSettings.sampleRate")}</dt>
          <dd>{formatRate(device.sampleRate)}</dd>
        </div>
      )}
      {device && device.bufferFrames > 0 && device.bufferFrames !== draft?.bufferFrames && (
        <div className="settings-row">
          <dt className="text-muted-foreground">{t("audioSettings.actualBuffer")}</dt>
          <dd>{formatBuffer(device.bufferFrames)}</dd>
        </div>
      )}
      <div className="settings-row">
        <dt className="text-muted-foreground">{t("audioSettings.inputLatency")}</dt>
        <dd>{device?.inputDeviceId ? latency(device.inputLatencyFrames) : "—"}</dd>
      </div>
      <div className="settings-row">
        <dt className="text-muted-foreground">{t("audioSettings.outputLatency")}</dt>
        <dd>{latency(device?.outputLatencyFrames)}</dd>
      </div>
      <div className="settings-row">
        <dt className="text-muted-foreground">{t("audioSettings.overallLatency")}</dt>
        <dd>
          {latency(device ? device.inputLatencyFrames + device.outputLatencyFrames : undefined)}
        </dd>
      </div>
    </dl>
  )
}
