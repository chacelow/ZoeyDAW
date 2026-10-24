import { useTranslation } from "@zoeymind/i18n"
import { projectActions } from "@/pages/project/adapters"
import { MixerLevel } from "./MixerLevel"
import type { Track } from "@zoeydaw/project-core/types"

export function SendGrid({
  track,
  returns,
  rows,
}: {
  readonly track: Track
  readonly returns: readonly Track[]
  readonly rows: number
}) {
  const { t } = useTranslation()
  return (
    <div className="gap-control-track-gap grid min-w-0 grid-cols-3">
      {returns.slice(0, (rows - 2) * 3).map(destination => (
        <div key={destination.id} className="min-w-0">
          <MixerLevel
            label={`${t("arrangement.send")} ${destination.name} ${track.name}`}
            value={track.sends?.[destination.id] ?? -60}
            onChange={sendDb =>
              projectActions.updateTrack(track.id, {
                sends: { ...track.sends, [destination.id]: sendDb },
              })
            }
            disabled={destination.id === track.id}
          />
        </div>
      ))}
    </div>
  )
}
