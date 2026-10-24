import { useId, useState, type Dispatch, type SetStateAction } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, Checkbox, Label } from "@zoeymind/ui"
import type { AudioDeviceCapabilities, AudioDeviceConfiguration } from "@/shared/native/audio"

export function DeviceChannels({
  draft,
  capabilities,
  busy,
  onChange,
}: {
  draft: AudioDeviceConfiguration | null
  capabilities: AudioDeviceCapabilities | null
  busy: boolean
  onChange: Dispatch<SetStateAction<AudioDeviceConfiguration | null>>
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex flex-col gap-3">
        <ChannelConfiguration
          title={t("audioSettings.inputConfig")}
          names={capabilities?.inputChannelNames ?? []}
          mono={draft?.inputMono ?? []}
          stereo={draft?.inputStereo ?? []}
          disabled={busy || !capabilities || draft?.inputDeviceId == null}
          onChange={(inputMono, inputStereo) =>
            onChange(previous => previous && { ...previous, inputMono, inputStereo })
          }
        />
        <ChannelConfiguration
          title={t("audioSettings.outputConfig")}
          names={capabilities?.outputChannelNames ?? []}
          mono={draft?.outputMono ?? []}
          stereo={draft?.outputStereo ?? []}
          disabled={busy || !capabilities}
          onChange={(outputMono, outputStereo) =>
            onChange(previous => previous && { ...previous, outputMono, outputStereo })
          }
        />
      </div>
      {capabilities && draft && draft.outputMono.length + draft.outputStereo.length === 0 && (
        <p className="text-muted-foreground text-xs">{t("audioSettings.outputRequired")}</p>
      )}
    </>
  )
}

function ChannelConfiguration({
  title,
  names,
  mono,
  stereo,
  disabled,
  onChange,
}: {
  title: string
  names: string[]
  mono: number[]
  stereo: number[]
  disabled: boolean
  onChange: (mono: number[], stereo: number[]) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const toggle = (channels: number[], index: number, checked: boolean) =>
    checked
      ? [...channels, index].sort((left, right) => left - right)
      : channels.filter(channel => channel !== index)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        aria-expanded={expanded}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setExpanded(value => !value)}
      >
        {title}
      </Button>
      {expanded && (
        <div
          id={id}
          role="group"
          aria-label={title}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-2">
            <legend className="text-muted-foreground mb-2 text-xs">
              {t("audioSettings.mono")}
            </legend>
            {names.map((name, channel) => (
              <div key={channel} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-mono-${channel}`}
                  checked={mono.includes(channel)}
                  onCheckedChange={checked => onChange(toggle(mono, channel, checked), stereo)}
                />
                <Label htmlFor={`${id}-mono-${channel}`}>
                  {t("audioSettings.monoChannel", { channel: channel + 1, name })}
                </Label>
              </div>
            ))}
          </fieldset>
          <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-2">
            <legend className="text-muted-foreground mb-2 text-xs">
              {t("audioSettings.stereo")}
            </legend>
            {names.flatMap((left, channel) =>
              channel % 2 === 0 && channel + 1 < names.length
                ? [
                    <div key={channel} className="flex items-center gap-2">
                      <Checkbox
                        id={`${id}-stereo-${channel}`}
                        checked={stereo.includes(channel)}
                        onCheckedChange={checked =>
                          onChange(mono, toggle(stereo, channel, checked))
                        }
                      />
                      <Label htmlFor={`${id}-stereo-${channel}`}>
                        {t("audioSettings.stereoChannel", {
                          first: channel + 1,
                          second: channel + 2,
                          left,
                          right: names[channel + 1],
                        })}
                      </Label>
                    </div>,
                  ]
                : []
            )}
          </fieldset>
        </div>
      )}
    </div>
  )
}
