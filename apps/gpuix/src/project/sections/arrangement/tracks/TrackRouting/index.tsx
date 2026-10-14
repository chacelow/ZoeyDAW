import { useTrackLabels } from "../labels"
import { DropdownButton, DragPadToggle } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { projectActions, useProjectState } from "@/project/adapters"
import { trackControlRows } from "@/project/layout"
import { routingDestinations } from "@/project/model/track-routing"
import type { Track } from "@/project/model/types"

const HARDWARE_CHANNELS = [
  { id: "1-2", label: "1 / 2" },
  { id: "3-4", label: "3 / 4" },
  { id: "1", label: "1" },
  { id: "2", label: "2" },
]
const MIDI_CHANNELS = Array.from({ length: 16 }, (_, index) => ({
  id: String(index + 1),
  label: String(index + 1),
}))
const EMPTY_CHANNEL = [{ id: "", label: "" }]

export function TrackRouting({ track }: { readonly track: Track }) {
  const { t } = useTrackLabels()
  const theme = useTheme()
  const tracks = useProjectState(state => state.document.tracks)
  const outputs = [
    ...routingDestinations(track, tracks).map(destination => ({
      id: destination.id,
      label: destination.name,
    })),
    { id: "none", label: t("noOutput") },
    { id: "external", label: t("externalOutput") },
  ]
  const isMain = track.kind === "main"
  const rows = trackControlRows(track)
  const hasInput = track.kind === "audio" || track.kind === "midi"
  const showInput = hasInput && rows >= 4
  const showMonitor = hasInput && (track.kind === "midi" || rows >= 3)
  const showOutputChannel =
    !isMain && (!hasInput || rows >= 5 || (!showInput && (track.kind === "audio" || rows >= 3)))
  return (
    <div
      role="group"
      aria-label={`${t("routing")} ${track.name}`}
      testId={`track-routing-${track.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        width: theme.project.routingWidth,
        minWidth: 0,
        height: "100%",
        padding: theme.control["--spacing-control-track-gap"],
        gap: theme.control["--spacing-control-track-gap"],
        overflow: "hidden",
        backgroundColor: theme.colors.card,
      }}
    >
      {track.collapsed ? (
        isMain ? (
          <DropdownButton
            label={`${t("output")} ${track.name}`}
            testId={`track-output-${track.id}`}
            value={track.outputChannel ?? "1-2"}
            items={HARDWARE_CHANNELS}
            onChange={outputChannel => projectActions.updateTrack(track.id, { outputChannel })}
          />
        ) : null
      ) : (
        <>
          {showInput ? (
            <>
              <DropdownButton
                label={`${t("input")} ${track.name}`}
                testId={`track-input-${track.id}`}
                value={track.input}
                onChange={input => projectActions.updateTrack(track.id, { input })}
                items={[
                  { id: "none", label: t("noInput") },
                  track.kind === "midi"
                    ? { id: "all", label: t("allInputs") }
                    : { id: "external", label: t("externalInput") },
                ]}
              />
              <DropdownButton
                label={`${t("inputChannel")} ${track.name}`}
                testId={`track-input-channel-${track.id}`}
                value={
                  track.input === "none"
                    ? ""
                    : (track.inputChannel ?? (track.kind === "midi" ? "all" : "1"))
                }
                onChange={inputChannel => projectActions.updateTrack(track.id, { inputChannel })}
                disabled={track.input === "none"}
                items={
                  track.input === "none"
                    ? EMPTY_CHANNEL
                    : track.kind === "midi"
                      ? [{ id: "all", label: t("allChannels") }, ...MIDI_CHANNELS]
                      : HARDWARE_CHANNELS
                }
              />
            </>
          ) : null}
          {showMonitor ? (
            <div
              role="group"
              aria-label={`${t("monitor")} ${track.name}`}
              testId={`track-monitor-${track.id}`}
              style={{
                display: "flex",
                gap: theme.control["--spacing-control-track-gap"],
                minWidth: 0,
              }}
            >
              {(["in", "auto", "off"] satisfies Track["monitor"][]).map(mode => (
                <DragPadToggle
                  key={mode}
                  label={`${t("monitor")} ${mode} ${track.name}`}
                  testId={`track-monitor-${mode}-${track.id}`}
                  value={track.monitor === mode}
                  onChange={() => projectActions.updateTrack(track.id, { monitor: mode })}
                  labelOn={mode === "auto" ? "Auto" : mode === "in" ? "In" : "Off"}
                  labelOff={mode === "auto" ? "Auto" : mode === "in" ? "In" : "Off"}
                  style={{
                    flexGrow: 1,
                    flexBasis: 0,
                    minWidth: 0,
                    paddingLeft: 0,
                    paddingRight: 0,
                  }}
                />
              ))}
            </div>
          ) : null}
          {isMain ? (
            <DropdownButton
              label={`${t("cueOutput")} ${track.name}`}
              testId={`track-cue-output-${track.id}`}
              value={track.cueOutput ?? "1-2"}
              items={HARDWARE_CHANNELS}
              onChange={cueOutput => projectActions.updateTrack(track.id, { cueOutput })}
            />
          ) : null}
          <DropdownButton
            label={`${t("output")} ${track.name}`}
            testId={`track-output-${track.id}`}
            value={isMain ? (track.outputChannel ?? "1-2") : track.output}
            items={isMain ? HARDWARE_CHANNELS : outputs}
            onChange={value =>
              projectActions.updateTrack(
                track.id,
                isMain ? { outputChannel: value } : { output: value }
              )
            }
          />
          {showOutputChannel ? (
            <DropdownButton
              label={`${t("outputChannel")} ${track.name}`}
              testId={`track-output-channel-${track.id}`}
              value={
                track.output === "external"
                  ? (track.outputChannel ?? (track.kind === "midi" ? "1" : "1-2"))
                  : ""
              }
              onChange={outputChannel => projectActions.updateTrack(track.id, { outputChannel })}
              items={
                track.output === "external"
                  ? track.kind === "midi"
                    ? MIDI_CHANNELS
                    : HARDWARE_CHANNELS
                  : EMPTY_CHANNEL
              }
              disabled={track.output !== "external"}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
