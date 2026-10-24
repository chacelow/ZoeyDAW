import { useSyncExternalStore } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { trackControlRows } from "@/pages/project/layout"
import { readNativeAudioStatus, subscribeNativeAudioStatus } from "@/shared/native/audio"
import { InputTypeRow, InputChannelRow, MonitorRow } from "./InputRows"
import { CueOutputRow, TrackOutputRow, MainOutputRow, OutputChannelRow } from "./OutputRows"
import { hardwareChannelOptions, trackOutputOptions } from "./options"
import type { RouteOption } from "./options"
import type { Track } from "@zoeydaw/project-core/types"

function ordinaryRoutingRows(
  track: Track,
  hardwareInputs: RouteOption[],
  hardwareChannels: RouteOption[],
  outputs: RouteOption[]
) {
  const hasInput = track.kind === "audio" || track.kind === "midi"
  const hasOutputChannel = track.kind === "midi" || (hasInput && track.output === "external")
  return [
    hasInput ? <InputTypeRow key="input-type" track={track} /> : null,
    hasInput && track.input !== "none" ? (
      <InputChannelRow key="input-channel" track={track} hardwareInputs={hardwareInputs} />
    ) : null,
    hasInput ? <MonitorRow key="monitor" track={track} /> : null,
    <TrackOutputRow key="output" track={track} outputs={outputs} />,
    hasOutputChannel ? (
      <OutputChannelRow key="output-channel" track={track} hardwareChannels={hardwareChannels} />
    ) : null,
  ].filter(row => row !== null)
}

export function TrackRouting({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  const tracks = useProjectState(s => s.document.tracks)
  const audio = useSyncExternalStore(subscribeNativeAudioStatus, readNativeAudioStatus)
  const configuration = audio.device?.configuration
  const hardwareChannels = hardwareChannelOptions(
    configuration?.outputStereo,
    configuration?.outputMono
  )
  const hardwareInputs = hardwareChannelOptions(
    configuration?.inputStereo,
    configuration?.inputMono
  )
  const outputs = [
    ...trackOutputOptions(track, tracks),
    { id: "none", label: t("arrangement.noOutput") },
    { id: "external", label: t("arrangement.externalOutput") },
  ]
  const isMain = track.kind === "main"
  const routingRows = isMain
    ? [
        <CueOutputRow key="cue" track={track} hardwareChannels={hardwareChannels} />,
        <MainOutputRow key="output" track={track} hardwareChannels={hardwareChannels} />,
        <OutputChannelRow key="output-channel" track={track} hardwareChannels={hardwareChannels} />,
      ]
    : ordinaryRoutingRows(track, hardwareInputs, hardwareChannels, outputs)
  // Each height step drops one whole row from the top, keeping the tail visible.
  const visibleRoutingRows = routingRows.slice(-Math.max(1, trackControlRows(track)))
  return (
    <section
      aria-label={`${t("arrangement.routing")} ${track.name}`}
      className="arrangement-track-routing arrangement-track-controls flex min-w-0 flex-col"
    >
      {track.collapsed ? (
        isMain ? (
          <MainOutputRow track={track} hardwareChannels={hardwareChannels} />
        ) : null
      ) : (
        visibleRoutingRows
      )}
    </section>
  )
}
