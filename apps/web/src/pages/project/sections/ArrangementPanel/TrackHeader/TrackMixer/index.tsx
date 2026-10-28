import { useTranslation } from "@zoeymind/i18n"
import { TrackMeter } from "@/pages/project/sections/ArrangementPanel/canvas/TrackMeter"
import { MidiActivity } from "@/pages/project/sections/ArrangementPanel/canvas/MidiActivity"
import { projectActions, useAutomationGesture, useProjectState } from "@/pages/project/adapters"
import { trackControlRows } from "@/pages/project/layout"
import { TrackActions } from "./TrackActions"
import { MainLevels, TrackLevels } from "./TrackLevels"
import { SendGrid } from "./SendGrid"
import type { Track } from "@zoeydaw/project-core/types"

export function TrackMixer({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  const panGesture = useAutomationGesture(
    track.id,
    { kind: "mixer", parameter: "pan" },
    (pan: number) => projectActions.updateTrack(track.id, { pan }),
    track.pan
  )
  const tracks = useProjectState(s => s.document.tracks)
  const isMain = track.kind === "main"
  // An instrument turns a MIDI lane into a real audio source, so it earns the
  // same volume meter as any other sounding track instead of MIDI activity.
  const hasAudioOutput =
    track.kind !== "midi" ||
    (track.devices ?? []).some(
      device => device.kind === "external" && device.plugin.role === "instrument"
    )
  const returns = tracks.filter(item => item.kind === "return")
  const rows = trackControlRows(track)
  return (
    <section
      aria-label={`${t("arrangement.mixer")} ${track.name}`}
      className="arrangement-track-mixer arrangement-track-controls flex min-w-0"
    >
      <div className="gap-control-track-gap flex min-w-0 flex-1 flex-col">
        {isMain ? <MainLevels track={track} /> : <TrackActions track={track} tracks={tracks} />}
        {hasAudioOutput && !track.collapsed && (
          <>
            <TrackLevels track={track} panGesture={panGesture} />
            {!isMain && rows > 2 && <SendGrid track={track} returns={returns} rows={rows} />}
          </>
        )}
      </div>
      {hasAudioOutput ? (
        <TrackMeter trackId={track.id} trackName={track.name} className="h-full min-h-0 shrink-0" />
      ) : (
        <MidiActivity trackName={track.name} className="h-full min-h-0 shrink-0" />
      )}
    </section>
  )
}
