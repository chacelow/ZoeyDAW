import { useTranslation } from "@zoeymind/i18n"
import { Button, Separator } from "@zoeymind/ui"
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
    setDraft,
    preview,
    capabilities,
    choices,
    canApply,
    configurationChanged,
    message,
    refresh,
    changeDevices,
    openControlPanel,
    apply,
  } = useAudioDeviceSettings()

  if (!available)
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t("audioSettings.unavailable")}
      </p>
    )

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("audioSettings.requested")}</h3>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
          {t("audioSettings.refresh")}
        </Button>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <DeviceSelectors
          draft={draft}
          device={device}
          choices={choices}
          busy={busy}
          onChange={changeDevices}
        />
        <SampleBufferSelectors
          draft={draft}
          capabilities={capabilities}
          busy={busy}
          onChange={setDraft}
        />
      </div>
      {!choices.separateInputOutput && (
        <p className="text-muted-foreground text-xs">{t("audioSettings.coupledDevices")}</p>
      )}
      {preview.kind === "loading" && (
        <p role="status" className="text-muted-foreground text-xs">
          {t("audioSettings.loadingCapabilities")}
        </p>
      )}
      <DeviceChannels draft={draft} capabilities={capabilities} busy={busy} onChange={setDraft} />
      {draft && device && device.sampleRate > 0 && draft.sampleRate !== device.sampleRate && (
        <p role="note" className="text-muted-foreground text-xs">
          {t("audioSettings.sampleRateWarning")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!canApply} onClick={() => void apply()}>
          {t(operation === "applying" ? "audioSettings.applying" : "audioSettings.apply")}
        </Button>
        <span role="status" className="text-muted-foreground text-xs">
          {t(
            !draft
              ? "audioSettings.noConfiguration"
              : configurationChanged
                ? "audioSettings.unsaved"
                : "audioSettings.applied"
          )}
        </span>
      </div>
      <Separator />
      <ActualDeviceConfiguration device={device} />
      {device?.state === "ready" && device.capabilities.controlPanel && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void openControlPanel()}>
          {t("audioSettings.driverPanel")}
        </Button>
      )}
      <p className="text-muted-foreground text-xs">{t("audioSettings.latencyScope")}</p>
      <p className="text-muted-foreground text-xs">{t("audioSettings.deviceScope")}</p>
      <p className="text-muted-foreground text-xs">{t("audioSettings.inputScope")}</p>
      <p className="text-muted-foreground text-xs">{t("audioSettings.processing")}</p>
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
