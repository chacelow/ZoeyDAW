import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { ActualDeviceConfiguration } from "./AudioDeviceSettings/ActualDeviceConfiguration"
import { DeviceChannels } from "./AudioDeviceSettings/ChannelConfiguration"
import { DeviceSelectors } from "./AudioDeviceSettings/DeviceSelectors"
import { SampleBufferSelectors } from "./AudioDeviceSettings/SampleBufferSelectors"
import { useAudioDeviceSettings } from "./AudioDeviceSettings/useAudioDeviceSettings"

export function AudioDeviceSettings() {
  const { t } = useTranslation()
  const {
    available,
    device,
    issues,
    busy,
    operation,
    draft,
    changeConfiguration,
    preview,
    capabilities,
    choices,
    configurationChanged,
    message,
    discover,
    openControlPanel,
  } = useAudioDeviceSettings()

  if (!available)
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t("audioSettings.unavailable")}
      </p>
    )

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h3 className="settings-section-title">{t("audioSettings.deviceSection")}</h3>
      <div className="flex min-w-0 flex-col gap-3">
        <DeviceSelectors
          draft={draft}
          device={device}
          choices={choices}
          busy={busy}
          onChange={changeConfiguration}
          onDiscover={() => void discover()}
        />
        <DeviceChannels
          draft={draft}
          capabilities={capabilities}
          busy={busy}
          onChange={changeConfiguration}
        />
      </div>
      <h3 className="settings-section-title">{t("audioSettings.sampleSection")}</h3>
      <div className="flex min-w-0 flex-col gap-3">
        <SampleBufferSelectors
          draft={draft}
          capabilities={capabilities}
          busy={busy}
          onChange={changeConfiguration}
        />
      </div>
      {preview.kind === "loading" && (
        <p role="status" className="text-muted-foreground text-xs">
          {t("audioSettings.loadingCapabilities")}
        </p>
      )}
      {draft && device && device.sampleRate > 0 && draft.sampleRate !== device.sampleRate && (
        <p role="note" className="text-muted-foreground text-xs">
          {t("audioSettings.sampleRateWarning")}
        </p>
      )}
      {(!draft || operation === "applying" || (configurationChanged && !message)) && (
        <span role="status" className="text-muted-foreground text-xs">
          {t(
            !draft
              ? "audioSettings.noConfiguration"
              : operation === "applying"
                ? "audioSettings.applying"
                : "audioSettings.awaitingConfiguration"
          )}
        </span>
      )}
      <h3 className="settings-section-title">{t("audioSettings.latencySection")}</h3>
      <ActualDeviceConfiguration device={device} draft={draft} />
      {device?.state === "ready" && device.capabilities.controlPanel && (
        <div className="settings-row">
          <span>{t("audioSettings.driverPanel")}</span>
          <div className="min-w-0">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void openControlPanel()}
            >
              {t("audioSettings.openDriverPanel")}
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p role="alert" className="text-destructive text-sm break-words">
          {message}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="text-muted-foreground list-inside list-disc text-sm">
          {issues.map((issue, index) => (
            <li
              key={`${issue.code}:${issue.sourceId ?? issue.trackId ?? issue.clipId ?? ""}:${index}`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
