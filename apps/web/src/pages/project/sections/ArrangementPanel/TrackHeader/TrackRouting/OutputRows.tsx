import { useTranslation } from "@zoeymind/i18n"
import { DropdownButton } from "@zoeymind/ui"
import { projectActions } from "@/pages/project/adapters"
import { withRouteMeters } from "./RouteMeter"
import { ProjectMeter } from "@/pages/project/components/ProjectMeter"
import { midiChannelOptions, outputChannelValue } from "./options"
import type { RouteOption } from "./options"
import type { Track } from "@zoeydaw/project-core/types"

export function CueOutputRow({
  track,
  hardwareChannels,
}: {
  readonly track: Track
  readonly hardwareChannels: RouteOption[]
}) {
  const { t } = useTranslation()
  return (
    <DropdownButton
      size="compact"
      label={`${t("arrangement.cueOutput")} ${track.name}`}
      value={track.cueOutput ?? "1-2"}
      onChange={cueOutput => projectActions.updateTrack(track.id, { cueOutput })}
      items={hardwareChannels}
      className="w-full min-w-0"
    />
  )
}

export function TrackOutputRow({
  track,
  outputs,
}: {
  readonly track: Track
  readonly outputs: RouteOption[]
}) {
  const { t } = useTranslation()
  return (
    <DropdownButton
      size="compact"
      label={`${t("arrangement.output")} ${track.name}`}
      value={track.output}
      onChange={output => projectActions.updateTrack(track.id, { output })}
      items={withRouteMeters(outputs, id =>
        id === "none" || id === "external" ? { kind: "silent" } : { kind: "track", trackId: id }
      )}
      className="w-full min-w-0"
    />
  )
}

export function MainOutputRow({
  track,
  hardwareChannels,
}: {
  readonly track: Track
  readonly hardwareChannels: RouteOption[]
}) {
  const { t } = useTranslation()
  return (
    <DropdownButton
      size="compact"
      label={`${t("arrangement.output")} ${track.name}`}
      value={track.outputChannel ?? "1-2"}
      onChange={outputChannel => projectActions.updateTrack(track.id, { outputChannel })}
      items={
        track.collapsed
          ? hardwareChannels
          : withRouteMeters(hardwareChannels, () => ({ kind: "track", trackId: track.id }))
      }
      icon={
        track.collapsed ? <ProjectMeter source={{ kind: "track", trackId: track.id }} /> : undefined
      }
      className="w-full min-w-0"
    />
  )
}

export function OutputChannelRow({
  track,
  hardwareChannels,
}: {
  readonly track: Track
  readonly hardwareChannels: RouteOption[]
}) {
  const { t } = useTranslation()
  return (
    <DropdownButton
      size="compact"
      label={`${t("arrangement.outputChannel")} ${track.name}`}
      value={outputChannelValue(track)}
      onChange={outputChannel => projectActions.updateTrack(track.id, { outputChannel })}
      items={track.kind === "midi" ? midiChannelOptions : hardwareChannels}
      className="w-full min-w-0"
    />
  )
}
