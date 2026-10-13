import type { ReactNode } from "react"
import { Headphones } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { DragPadBar, DragPadToggle, PanControl } from "@zoeymind/ui"
import { TrackMeter } from "@/pages/project/sections/ArrangementPanel/canvas/TrackMeter"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import type { Track } from "@/pages/project/model/types"
import { trackControlRows } from "@/pages/project/model/selectors"

const formatDb = (db: number) => (db <= -60 ? "−∞" : db.toFixed(1))

const gesture = {
  onGestureStart: () => projectActions.beginEdit(),
  onGestureEnd: () => projectActions.endEdit(),
  onGestureCancel: () => projectActions.cancelEdit(),
}

export function TrackMixer({ track }: { track: Track }) {
  const { t } = useTranslation()
  const tracks = useProjectState(s => s.document.tracks)
  const index = tracks.findIndex(item => item.id === track.id) + 1
  const main = track.kind === "main"
  const returns = tracks.filter(item => item.kind === "return")
  const rows = trackControlRows(track)
  const level = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    disabled = false,
    icon?: ReactNode
  ) => (
    <DragPadBar
      size="compact"
      label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
      icon={icon}
      min={-60}
      max={6}
      step={0.1}
      defaultValue={0}
      format={formatDb}
      widthSamples={["−59.9", "6.0", "−∞"]}
      className="arrangement-volume-control w-full min-w-0"
      {...gesture}
    />
  )
  return (
    <section
      aria-label={`${t("arrangement.mixer")} ${track.name}`}
      className="arrangement-track-mixer arrangement-track-controls flex min-w-0"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-control-track-gap">
        {main ? (
          <div className="grid min-w-0 grid-cols-2 gap-control-track-gap">
            {level(`${t("arrangement.volume")} ${track.name}`, track.volumeDb, volumeDb =>
              projectActions.updateTrack(track.id, { volumeDb })
            )}
            {level(
              `${t("arrangement.cueVolume")} ${track.name}`,
              track.cueVolumeDb ?? 0,
              cueVolumeDb => projectActions.updateTrack(track.id, { cueVolumeDb }),
              false,
              <Headphones />
            )}
          </div>
        ) : (
          <div className="arrangement-track-actions grid min-w-0 grid-cols-4 gap-control-track-gap">
            <DragPadToggle
              size="compact"
              label={`${t("arrangement.trackEnabled")} ${track.name}`}
              value={!track.mute}
              onChange={enabled => projectActions.updateTrack(track.id, { mute: !enabled })}
              labelOn={
                track.kind === "return"
                  ? String.fromCharCode(
                      65 +
                        tracks
                          .filter(item => item.kind === "return")
                          .findIndex(item => item.id === track.id)
                    )
                  : String(index)
              }
              labelOff={
                track.kind === "return"
                  ? String.fromCharCode(
                      65 +
                        tracks
                          .filter(item => item.kind === "return")
                          .findIndex(item => item.id === track.id)
                    )
                  : String(index)
              }
              className="col-span-2 min-w-0 w-full px-0"
            />
            <DragPadToggle
              size="compact"
              label={`Solo ${track.name}`}
              value={track.solo}
              onChange={solo => projectActions.updateTrack(track.id, { solo })}
              labelOn="S"
              labelOff="S"
              className="min-w-0 w-full px-0"
            />
            {(track.kind === "audio" || track.kind === "midi") && (
              <DragPadToggle
                size="compact"
                label={`${t("arrangement.recordArm")} ${track.name}`}
                value={track.armed}
                onChange={armed => projectActions.updateTrack(track.id, { armed })}
                icon={<span className="size-3/4 rounded-full bg-current" />}
                color="var(--destructive)"
                className="min-w-0 w-full px-0"
              />
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
                className="min-w-0 w-full px-0"
              />
            )}
          </div>
        )}
        {!track.collapsed && (
          <>
            <div className="grid min-w-0 grid-cols-2 gap-control-track-gap">
              {!main &&
                level(`${t("arrangement.volume")} ${track.name}`, track.volumeDb, volumeDb =>
                  projectActions.updateTrack(track.id, { volumeDb })
                )}
              <PanControl
                size="compact"
                value={track.pan}
                onChange={pan => projectActions.updateTrack(track.id, { pan })}
                label={`${t("arrangement.pan")} ${track.name}`}
                className="arrangement-pan-control w-full min-w-0"
                {...gesture}
              />
            </div>
            {!main && rows > 2 && (
              <div className="grid min-w-0 grid-cols-3 gap-control-track-gap">
                {returns.slice(0, (rows - 2) * 3).map(destination => (
                  <div key={destination.id} className="min-w-0">
                    {level(
                      `${t("arrangement.send")} ${destination.name} ${track.name}`,
                      track.sends?.[destination.id] ?? -60,
                      sendDb =>
                        projectActions.updateTrack(track.id, {
                          sends: { ...track.sends, [destination.id]: sendDb },
                        }),
                      destination.id === track.id
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <TrackMeter trackId={track.id} className="h-full min-h-0 shrink-0" />
    </section>
  )
}
