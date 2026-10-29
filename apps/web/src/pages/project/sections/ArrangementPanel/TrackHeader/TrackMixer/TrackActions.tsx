import { useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { DragPadToggle } from "@zoeymind/ui"
import { projectActions } from "@/pages/project/adapters"
import type { Track } from "@zoeydaw/project-core/types"

export function TrackActions({
  track,
  tracks,
}: {
  readonly track: Track
  readonly tracks: readonly Track[]
}) {
  const armAdditive = useRef(false)
  const { t } = useTranslation()
  const label =
    track.kind === "return"
      ? String.fromCharCode(
          65 + tracks.filter(item => item.kind === "return").findIndex(item => item.id === track.id)
        )
      : String(tracks.findIndex(item => item.id === track.id) + 1)
  return (
    <div className="arrangement-track-actions gap-control-track-gap grid min-w-0 grid-cols-4">
      <DragPadToggle
        size="compact"
        label={`${t("arrangement.trackEnabled")} ${track.name}`}
        value={!track.mute}
        onChange={enabled => projectActions.updateTrack(track.id, { mute: !enabled })}
        labelOn={label}
        labelOff={label}
        className="col-span-2 w-full min-w-0 px-0"
      />
      <DragPadToggle
        size="compact"
        label={`Solo ${track.name}`}
        value={track.solo}
        onChange={solo => projectActions.updateTrack(track.id, { solo })}
        labelOn="S"
        labelOff="S"
        className="w-full min-w-0 px-0"
      />
      {(track.kind === "audio" || track.kind === "midi") && (
        <span
          className="contents"
          onPointerDownCapture={event => {
            armAdditive.current = event.ctrlKey || event.metaKey
          }}
        >
          <DragPadToggle
            size="compact"
            label={`${t("arrangement.recordArm")} ${track.name}`}
            value={track.armed}
            onChange={armed => projectActions.setTrackArmed(track.id, armed, armAdditive.current)}
            icon={<span className="size-3/4 rounded-full bg-current" />}
            color="var(--destructive)"
            className="w-full min-w-0 px-0"
          />
        </span>
      )}
      {track.kind === "group" && <span aria-hidden className="min-w-0" />}
      {track.kind === "return" && (
        <DragPadToggle
          size="compact"
          label={`Post ${track.name}`}
          value={track.returnPost ?? true}
          onChange={returnPost => projectActions.updateTrack(track.id, { returnPost })}
          labelOn="Post"
          labelOff="Pre"
          className="w-full min-w-0 px-0"
        />
      )}
    </div>
  )
}
