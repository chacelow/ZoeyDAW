import { useTrackLabels } from "../labels"
import { Button, DragPadBar, DragPadToggle, PanControl } from "@/ui/controls"
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
  const { formats } = useTrackLabels()
  const gesture = useProjectEditGesture(onChange)
  const theme = useTheme()
  return (
    <DragPadBar
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
      format={formats.db}
      parse={formats.parseDb}
      widthSamples={formats.widthSamples.db}
      style={{ width: "100%", minWidth: 0 }}
      {...gesture}
    />
  )
}

export function TrackMixer({ track }: { readonly track: Track }) {
  const { t, formats } = useTrackLabels()
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
  const height = trackHeight(track, theme.layout.track) - theme.layout.track.border - inset * 2
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
          theme.layout.track.controlsWidth -
          theme.project.identityWidth -
          theme.project.routingWidth,
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
            <Button
              tone="activator"
              label={`${t("trackEnabled")} ${track.name}`}
              active={!track.mute}
              onActiveChange={enabled => projectActions.updateTrack(track.id, { mute: !enabled })}
              testId={`track-enabled-${track.id}`}
              style={{ ...column, flexGrow: 2 }}
            >
              {label}
            </Button>
            <Button
              tone="solo"
              label={`${t("solo")} ${track.name}`}
              active={track.solo}
              onActiveChange={solo => projectActions.updateTrack(track.id, { solo })}
              testId={`track-solo-${track.id}`}
              style={column}
            >
              {t("soloShort")}
            </Button>
            {track.kind === "audio" || track.kind === "midi" ? (
              <Button
                tone="arm"
                iconOnly
                label={`${t("recordArm")} ${track.name}`}
                active={track.armed}
                onActiveChange={armed => projectActions.updateTrack(track.id, { armed })}
                testId={`track-arm-${track.id}`}
                icon={<Icon name="Circle" filled color={track.armed ? theme.colors.primaryForeground : theme.colors.mutedForeground} />}
                style={{ ...column, width: "auto" }}
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
                labelOn={t("postShort")}
                labelOff={t("preShort")}
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
                label={`${t("pan")} ${track.name}`}
                testId={`track-pan-${track.id}`}
                value={track.pan}
                format={value => formats.pan(value, "control")}
                parse={formats.parsePan}
                widthSamples={formats.widthSamples.pan}
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
