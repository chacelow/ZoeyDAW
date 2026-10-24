import { Headphones } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { PanControl } from "@zoeymind/ui"
import { projectActions } from "@/pages/project/adapters"
import { MixerLevel } from "./MixerLevel"
import type { PanControlProps } from "@zoeymind/ui"
import type { Track } from "@zoeydaw/project-core/types"

export function MainLevels({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  return (
    <div className="gap-control-track-gap grid min-w-0 grid-cols-2">
      <MixerLevel
        label={`${t("arrangement.volume")} ${track.name}`}
        value={track.volumeDb}
        onChange={volumeDb => projectActions.updateTrack(track.id, { volumeDb })}
      />
      <MixerLevel
        label={`${t("arrangement.cueVolume")} ${track.name}`}
        value={track.cueVolumeDb ?? 0}
        onChange={cueVolumeDb => projectActions.updateTrack(track.id, { cueVolumeDb })}
        icon={<Headphones />}
      />
    </div>
  )
}

export function TrackLevels({
  track,
  panGesture,
}: {
  readonly track: Track
  readonly panGesture: Pick<
    PanControlProps,
    "onChange" | "onGestureStart" | "onGestureEnd" | "onGestureCancel"
  >
}) {
  const { t } = useTranslation()
  return (
    <div className="gap-control-track-gap grid min-w-0 grid-cols-2">
      {track.kind !== "main" && (
        <MixerLevel
          label={`${t("arrangement.volume")} ${track.name}`}
          value={track.volumeDb}
          onChange={volumeDb => projectActions.updateTrack(track.id, { volumeDb })}
        />
      )}
      <PanControl
        size="compact"
        value={track.pan}
        label={`${t("arrangement.pan")} ${track.name}`}
        className="arrangement-pan-control w-full min-w-0"
        {...panGesture}
      />
    </div>
  )
}
