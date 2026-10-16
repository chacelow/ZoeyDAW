import { useTrackLabels } from "../labels"
import { DragPadBar, DragPadToggle, PanControl } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { projectActions, useProjectEditGesture, useProjectState } from "@/project/adapters"
import { trackControlRows, trackHeight } from "@/project/layout"
import { TrackMeter } from "../meter/TrackMeter"
import { Icon } from "@/ui/controls/Icon"
import type { ReactNode } from "react"
import type { Track } from "@/project/model/types"

function MixerLevel({
  label,
  value,
  onChange,
  disabled = false,
  icon,
  testId,
}: {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
  readonly icon?: ReactNode
  readonly testId: string
}) {
  const gesture = useProjectEditGesture(onChange)
  const theme = useTheme()
  return (
    <DragPadBar
      hideIcon={!icon}
      label={label}
      value={value}
      color={theme.colors.arrangementVolume}
      min={-60}
      max={6}
      step={0.1}
      defaultValue={0}
      disabled={disabled}
      icon={icon}
      testId={testId}
      format={db => (db <= -60 ? "−∞" : db.toFixed(1))}
      widthSamples={["−59.9", "6.0", "−∞"]}
      style={{ width: "100%", minWidth: 0 }}
      {...gesture}
    />
  )
}

export function TrackMixer({ track }: { readonly track: Track }) {
  const { t } = useTrackLabels()
  const theme = useTheme()
  const panGesture = useProjectEditGesture((pan: number) =>
    projectActions.updateTrack(track.id, { pan })
  )
  const tracks = useProjectState(state => state.document.tracks)
  const returns = tracks.filter(item => item.kind === "return")
  const index = tracks.findIndex(item => item.id === track.id) + 1
  const isMain = track.kind === "main"
  const rows = trackControlRows(track, theme.layout.track)
  const gap = theme.control["--spacing-control-track-gap"]
  const inset = theme.design.cards.controls.inset
  const height = trackHeight(track, theme.layout.track) - theme.project.trackBorder - inset * 2
  // Return labels use the Unicode code point for A; the saved ordinal is content.
  const label =
    track.kind === "return"
      ? String.fromCharCode(65 + returns.findIndex(item => item.id === track.id))
      : String(index)
  const column = { flexGrow: 1, flexBasis: 0, minWidth: 0 }
  const row = { display: "flex", gap, minWidth: 0, flexShrink: 0 }
  return (
    <div
      role="group"
      aria-label={`${t("mixer")} ${track.name}`}
      testId={`track-mixer-${track.id}`}
      style={{
        display: "flex",
        flexShrink: 0,
        minWidth: 0,
        height: "100%",
        padding: inset,
        gap,
        width:
          theme.project.controlsWidth - theme.project.identityWidth - theme.project.routingWidth,
        backgroundColor: theme.colors.arrangementSurfaceAlt,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0, gap }}>
        {isMain ? (
          <div style={row}>
            <div style={column}>
              <MixerLevel
                testId={`track-volume-${track.id}`}
                label={`${t("volume")} ${track.name}`}
                value={track.volumeDb}
                onChange={volumeDb => projectActions.updateTrack(track.id, { volumeDb })}
              />
            </div>
            <div style={column}>
              <MixerLevel
                testId={`track-cue-volume-${track.id}`}
                label={`${t("cueVolume")} ${track.name}`}
                value={track.cueVolumeDb ?? 0}
                onChange={cueVolumeDb => projectActions.updateTrack(track.id, { cueVolumeDb })}
                icon={
                  <Icon
                    name="Headphones"
                    size={theme.control["--spacing-control-icon"]}
                    color={theme.colors.mutedForeground}
                  />
                }
              />
            </div>
          </div>
        ) : (
          <div testId={`track-actions-${track.id}`} style={row}>
            <DragPadToggle
              label={`${t("trackEnabled")} ${track.name}`}
              value={!track.mute}
              onChange={enabled => projectActions.updateTrack(track.id, { mute: !enabled })}
              labelOn={label}
              labelOff={label}
              testId={`track-enabled-${track.id}`}
              style={{ ...column, flexGrow: 2 }}
            />
            <DragPadToggle
              label={`${t("solo")} ${track.name}`}
              value={track.solo}
              onChange={solo => projectActions.updateTrack(track.id, { solo })}
              labelOn="S"
              labelOff="S"
              testId={`track-solo-${track.id}`}
              style={column}
            />
            {track.kind === "audio" || track.kind === "midi" ? (
              <DragPadToggle
                label={`${t("recordArm")} ${track.name}`}
                value={track.armed}
                onChange={armed => projectActions.updateTrack(track.id, { armed })}
                testId={`track-arm-${track.id}`}
                icon={
                  <Icon
                    name="Circle"
                    filled
                    size={theme.control["--spacing-control-icon"]}
                    color={
                      track.armed ? theme.colors.primaryForeground : theme.colors.mutedForeground
                    }
                  />
                }
                style={{
                  ...column,
                  width: "auto",
                  ...(track.armed ? { backgroundColor: theme.colors.destructive } : {}),
                }}
              />
            ) : null}
            {track.kind === "group" ? (
              <div aria-hidden="true" testId={`track-arm-space-${track.id}`} style={column} />
            ) : null}
            {track.kind === "return" ? (
              <DragPadToggle
                label={`${t("post")} ${track.name}`}
                value={track.returnPost ?? true}
                onChange={returnPost => projectActions.updateTrack(track.id, { returnPost })}
                testId={`track-post-${track.id}`}
                labelOn="Post"
                labelOff="Pre"
                style={column}
              />
            ) : null}
          </div>
        )}
        {!track.collapsed ? (
          <>
            <div style={row}>
              {!isMain ? (
                <div style={column}>
                  <MixerLevel
                    testId={`track-volume-${track.id}`}
                    label={`${t("volume")} ${track.name}`}
                    value={track.volumeDb}
                    onChange={volumeDb => projectActions.updateTrack(track.id, { volumeDb })}
                  />
                </div>
              ) : null}
              <PanControl
                hideIcon
                label={`${t("pan")} ${track.name}`}
                testId={`track-pan-${track.id}`}
                value={track.pan}
                color={theme.colors.arrangementVolume}
                style={{ ...column, width: isMain ? "100%" : "auto" }}
                {...panGesture}
              />
            </div>
            {!isMain && rows > 2 ? (
              <div
                testId={`track-sends-${track.id}`}
                style={{ display: "flex", flexDirection: "column", gap, minWidth: 0 }}
              >
                {/* Two control rows precede the fixed three-column send matrix. */}
                {Array.from(
                  { length: Math.min(rows - 2, Math.ceil(returns.length / 3)) },
                  (_, sendRow) => (
                    <div key={sendRow} style={row}>
                      {Array.from({ length: 3 }, (_, sendColumn) => {
                        const destination = returns[sendRow * 3 + sendColumn]
                        return (
                          <div key={destination?.id ?? `empty-${sendColumn}`} style={column}>
                            {destination ? (
                              <MixerLevel
                                testId={`track-send-${destination.id}-${track.id}`}
                                label={`${t("send")} ${destination.name} ${track.name}`}
                                value={track.sends?.[destination.id] ?? -60}
                                disabled={destination.id === track.id}
                                onChange={sendDb =>
                                  projectActions.updateTrack(track.id, {
                                    sends: { ...track.sends, [destination.id]: sendDb },
                                  })
                                }
                              />
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <TrackMeter trackId={track.id} trackName={track.name} height={height} />
    </div>
  )
}
