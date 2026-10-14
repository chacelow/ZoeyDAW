import { useTranslation } from "@zoeymind/i18n"
import { DropdownButton, DragPadToggle } from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { trackControlRows } from "@/pages/project/layout"
import type { Track } from "@/pages/project/model/types"

function canRouteTo(source: Track, destination: Track, tracks: Track[]): boolean {
  if (destination.kind !== "main" && destination.kind !== "group") {
    return false
  }
  const visited = new Set([source.id])
  let target: Track | undefined = destination
  while (target) {
    if (visited.has(target.id)) {
      return false
    }
    visited.add(target.id)
    target = tracks.find(candidate => candidate.id === target?.output)
  }
  return true
}

export function TrackRouting({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  const tracks = useProjectState(s => s.document.tracks)
  const outputs = [
    ...tracks
      .filter(candidate => canRouteTo(track, candidate, tracks))
      .map(candidate => ({ id: candidate.id, label: candidate.name })),
    { id: "none", label: t("arrangement.noOutput") },
    { id: "external", label: t("arrangement.externalOutput") },
  ]
  const hardwareChannels = [
    { id: "1-2", label: "1 / 2" },
    { id: "3-4", label: "3 / 4" },
    { id: "1", label: "1" },
    { id: "2", label: "2" },
  ]
  const isMain = track.kind === "main"
  const rows = trackControlRows(track)
  const hasInput = track.kind === "audio" || track.kind === "midi"
  const isShowInput = hasInput && rows >= 4
  const isShowMonitor = hasInput && (track.kind === "midi" || rows >= 3)
  const isShowOutputChannel =
    !isMain && (!hasInput || rows >= 5 || (!isShowInput && (track.kind === "audio" || rows >= 3)))
  return (
    <section
      aria-label={`${t("arrangement.routing")} ${track.name}`}
      className="arrangement-track-routing arrangement-track-controls flex min-w-0 flex-col"
    >
      {track.collapsed ? (
        isMain ? (
          <DropdownButton
            size="compact"
            label={`${t("arrangement.output")} ${track.name}`}
            value={track.outputChannel ?? "1-2"}
            onChange={outputChannel => projectActions.updateTrack(track.id, { outputChannel })}
            items={hardwareChannels}
            className="w-full min-w-0"
          />
        ) : null
      ) : (
        <>
          {isShowInput ? (
            <>
              <DropdownButton
                size="compact"
                label={`${t("arrangement.input")} ${track.name}`}
                value={track.input}
                onChange={input => projectActions.updateTrack(track.id, { input })}
                items={[
                  { id: "none", label: t("arrangement.noInput") },
                  track.kind === "midi"
                    ? { id: "all", label: t("arrangement.allInputs") }
                    : { id: "external", label: t("arrangement.externalInput") },
                ]}
                className="w-full min-w-0"
              />
              <DropdownButton
                size="compact"
                label={`${t("arrangement.inputChannel")} ${track.name}`}
                value={
                  track.input === "none"
                    ? ""
                    : (track.inputChannel ?? (track.kind === "midi" ? "all" : "1"))
                }
                onChange={inputChannel => projectActions.updateTrack(track.id, { inputChannel })}
                items={
                  track.input === "none"
                    ? [{ id: "", label: "" }]
                    : track.kind === "midi"
                      ? [
                          { id: "all", label: t("arrangement.allChannels") },
                          ...Array.from({ length: 16 }, (_, index) => ({
                            id: String(index + 1),
                            label: String(index + 1),
                          })),
                        ]
                      : hardwareChannels
                }
                disabled={track.input === "none"}
                className="w-full min-w-0"
              />
            </>
          ) : null}
          {isShowMonitor ? (
            <div
              role="group"
              aria-label={`${t("arrangement.monitor")} ${track.name}`}
              className="gap-control-track-gap flex min-w-0"
            >
              {(["in", "auto", "off"] satisfies Track["monitor"][]).map(mode => {
                return (
                  <DragPadToggle
                    size="compact"
                    key={mode}
                    label={`${t("arrangement.monitor")} ${mode} ${track.name}`}
                    value={track.monitor === mode}
                    onChange={() => projectActions.updateTrack(track.id, { monitor: mode })}
                    labelOn={mode === "auto" ? "Auto" : mode === "in" ? "In" : "Off"}
                    labelOff={mode === "auto" ? "Auto" : mode === "in" ? "In" : "Off"}
                    className="min-w-0 px-0"
                  />
                )
              })}
            </div>
          ) : null}
          {isMain ? (
            <DropdownButton
              size="compact"
              label={`${t("arrangement.cueOutput")} ${track.name}`}
              value={track.cueOutput ?? "1-2"}
              onChange={cueOutput => projectActions.updateTrack(track.id, { cueOutput })}
              items={hardwareChannels}
              className="w-full min-w-0"
            />
          ) : null}
          <DropdownButton
            size="compact"
            label={`${t("arrangement.output")} ${track.name}`}
            value={isMain ? (track.outputChannel ?? "1-2") : track.output}
            onChange={value =>
              projectActions.updateTrack(
                track.id,
                isMain ? { outputChannel: value } : { output: value }
              )
            }
            items={isMain ? hardwareChannels : outputs}
            className="w-full min-w-0"
          />
          {isShowOutputChannel ? (
            <DropdownButton
              size="compact"
              label={`${t("arrangement.outputChannel")} ${track.name}`}
              value={
                track.output === "external"
                  ? (track.outputChannel ?? (track.kind === "midi" ? "1" : "1-2"))
                  : ""
              }
              onChange={outputChannel => projectActions.updateTrack(track.id, { outputChannel })}
              items={
                track.output === "external"
                  ? track.kind === "midi"
                    ? Array.from({ length: 16 }, (_, index) => ({
                        id: String(index + 1),
                        label: String(index + 1),
                      }))
                    : hardwareChannels
                  : [{ id: "", label: "" }]
              }
              disabled={track.output !== "external"}
              className="w-full min-w-0"
            />
          ) : null}
        </>
      )}
    </section>
  )
}
