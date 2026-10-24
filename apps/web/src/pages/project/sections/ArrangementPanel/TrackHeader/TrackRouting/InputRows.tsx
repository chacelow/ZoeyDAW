import { useTranslation } from "@zoeymind/i18n"
import { DropdownButton, DragPadToggle } from "@zoeymind/ui"
import { projectActions } from "@/pages/project/adapters"
import { withRouteMeters } from "./RouteMeter"
import { inputChannelOptions, inputChannelValue } from "./options"
import type { RouteOption } from "./options"
import type { Track } from "@zoeydaw/project-core/types"

export function InputTypeRow({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  return (
    <DropdownButton
      size="compact"
      label={`${t("arrangement.input")} ${track.name}`}
      value={track.input}
      onChange={input => projectActions.updateTrack(track.id, { input })}
      items={[
        { type: "heading", id: "input-type", label: t("arrangement.inputType") },
        ...withRouteMeters(
          [
            { id: "none", label: t("arrangement.noInput") },
            track.kind === "midi"
              ? { id: "all", label: t("arrangement.allInputs") }
              : { id: "external", label: t("arrangement.externalInput") },
          ],
          track.id
        ),
      ]}
      className="w-full min-w-0"
    />
  )
}

export function InputChannelRow({
  track,
  hardwareInputs,
}: {
  readonly track: Track
  readonly hardwareInputs: RouteOption[]
}) {
  const { t } = useTranslation()
  return (
    <DropdownButton
      size="compact"
      label={`${t("arrangement.inputChannel")} ${track.name}`}
      value={inputChannelValue(track)}
      onChange={inputChannel => projectActions.updateTrack(track.id, { inputChannel })}
      items={withRouteMeters(
        inputChannelOptions(track, hardwareInputs, t("arrangement.allChannels")),
        track.id
      )}
      disabled={track.input === "none"}
      className="w-full min-w-0"
    />
  )
}

const MONITOR_MODES = [
  { mode: "in", label: "In" },
  { mode: "auto", label: "Auto" },
  { mode: "off", label: "Off" },
] satisfies { mode: Track["monitor"]; label: string }[]

export function MonitorRow({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      aria-label={`${t("arrangement.monitor")} ${track.name}`}
      className="gap-control-track-gap flex min-w-0"
    >
      {MONITOR_MODES.map(({ mode, label }) => (
        <DragPadToggle
          size="compact"
          key={mode}
          label={`${t("arrangement.monitor")} ${mode} ${track.name}`}
          value={track.monitor === mode}
          onChange={() => projectActions.updateTrack(track.id, { monitor: mode })}
          labelOn={label}
          labelOff={label}
          className="min-w-0 px-0"
        />
      ))}
    </div>
  )
}
