import { useState } from "react"
import { ChevronDown, ChevronUp, Play, Square, Trash2 } from "lucide-react"
import { Button, DropdownButton, Input, cn } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { LAUNCH_QUANTIZATIONS, MAX_LAUNCHER_SCENES } from "@zoeydaw/project-core/launcher"
import { clipContents, locateClip } from "@zoeydaw/project-core/clip-content"
import { clipLabel } from "@zoeydaw/project-core/clip-label"
import { acceptsClip } from "@zoeydaw/project-core/types"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import "./session.css"

export function SessionPanel() {
  const { t } = useTranslation()
  const document = useProjectState(state => state.document)
  const observed = useProjectState(state => state.session.launcher)
  const selectedIds = useProjectState(state => state.session.selectedClipIds)
  const [selected, setSelected] = useState<{ trackId: string; sceneId: string } | null>(null)
  const tracks = document.tracks.filter(track => track.kind === "audio" || track.kind === "midi")
  const activeTrack = tracks.find(track => track.id === selected?.trackId)
  const activeScene = document.launcher.scenes.find(scene => scene.id === selected?.sceneId)
  const activeSlot = activeTrack?.clipSlots?.find(slot => slot.sceneId === activeScene?.id)
  const sources = activeTrack
    ? document.tracks.flatMap(track =>
        [...clipContents(track)]
          .filter(clip => acceptsClip(activeTrack.kind, clip.kind))
          .map(clip => ({
            id: clip.id,
            label: `${track.name} · ${clipLabel(clip, document.media)}`,
          }))
      )
    : []
  return (
    <section
      className="project-session flex min-h-0 flex-1 flex-col"
      aria-label={t("project.session.title")}
    >
      <div className="border-border flex flex-wrap items-center gap-1 border-b p-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={document.launcher.scenes.length >= MAX_LAUNCHER_SCENES}
          onClick={() =>
            projectActions.addScene(
              t("project.session.scene", { index: document.launcher.scenes.length + 1 })
            )
          }
        >
          {t("project.session.addScene")}
        </Button>
        <DropdownButton
          value={document.launcher.quantization}
          label={t("project.session.quantization")}
          items={LAUNCH_QUANTIZATIONS.map(id => ({
            id,
            label: t(`project.session.quantizationValues.${id}`),
          }))}
          onChange={projectActions.setLaunchQuantization}
        />
        <Button size="sm" variant="ghost" onClick={projectActions.stopLauncherClips}>
          {t("project.session.stopAll")}
        </Button>
        <Button size="sm" variant="ghost" onClick={projectActions.returnToArrangement}>
          {t("project.session.returnToArrangement")}
        </Button>
        {activeTrack && activeScene && (
          <>
            <DropdownButton
              value=""
              label={t("project.session.copyClip")}
              renderValue={() => t("project.session.copyClip")}
              items={sources}
              disabled={!sources.length}
              onChange={id => {
                projectActions.copyClipToSlot(id, activeTrack.id, activeScene.id)
                projectActions.selectClipSlot(activeTrack.id, activeScene.id)
              }}
            />
            {activeTrack.kind === "midi" && !activeSlot && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  projectActions.createMidiClipSlot(activeTrack.id, activeScene.id)
                  projectActions.selectClipSlot(activeTrack.id, activeScene.id)
                }}
              >
                {t("project.session.createMidi")}
              </Button>
            )}
            {activeSlot && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => projectActions.deleteClipSlot(activeTrack.id, activeScene.id)}
              >
                {t("project.session.deleteClip")}
              </Button>
            )}
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="project-session-matrix" aria-label={t("project.session.title")}>
          <thead>
            <tr>
              <th scope="col">{t("project.session.title")}</th>
              {tracks.map(track => (
                <th scope="col" key={track.id}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{track.name}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${t("project.session.stopTrack")} · ${track.name}`}
                      onClick={() => projectActions.stopLauncherTrack(track.id)}
                    >
                      <Square />
                    </Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {document.launcher.scenes.map((scene, index) => (
              <tr key={scene.id} data-scene-id={scene.id}>
                <th scope="row">
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${t("project.session.launchScene")} · ${scene.name}`}
                      onClick={() => projectActions.launchScene(scene.id)}
                    >
                      <Play />
                    </Button>
                    <Input
                      key={`${scene.id}:${scene.name}`}
                      defaultValue={scene.name}
                      aria-label={t("project.session.renameScene")}
                      onBlur={event =>
                        projectActions.updateScene(scene.id, { name: event.currentTarget.value })
                      }
                      onKeyDown={event => {
                        if (event.key === "Enter") event.currentTarget.blur()
                      }}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={t("project.session.moveUp")}
                      onClick={() => projectActions.moveScene(scene.id, index - 1)}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === document.launcher.scenes.length - 1}
                      aria-label={t("project.session.moveDown")}
                      onClick={() => projectActions.moveScene(scene.id, index + 1)}
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${t("project.session.deleteScene")} · ${scene.name}`}
                      onClick={() => projectActions.removeScene(scene.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </th>
                {tracks.map(track => {
                  const slot = track.clipSlots?.find(slot => slot.sceneId === scene.id)
                  const playback = observed?.tracks
                    .find(item => item.trackId === track.id)
                    ?.slots.find(item => item.sceneId === scene.id && item.clipId === slot?.clip.id)
                  const active = selected?.trackId === track.id && selected.sceneId === scene.id
                  const status =
                    playback?.queued === "play"
                      ? t("project.session.queuedPlay")
                      : playback?.queued === "stop"
                        ? t("project.session.queuedStop")
                        : playback?.playing
                          ? t("project.session.playing")
                          : ""
                  return (
                    <td
                      key={track.id}
                      data-track-id={track.id}
                      data-slot-clip={slot?.clip.id}
                      onDragOver={event => {
                        if (
                          event.dataTransfer.types.includes("application/x-zoeydaw-launcher-clip")
                        )
                          event.preventDefault()
                      }}
                      onDrop={event => {
                        const source = locateClip(
                          document.tracks,
                          event.dataTransfer.getData("application/x-zoeydaw-launcher-clip")
                        )
                        if (source?.kind !== "launcher") return
                        event.preventDefault()
                        projectActions.moveClipSlot(
                          source.track.id,
                          source.sceneId,
                          track.id,
                          scene.id,
                          event.ctrlKey || event.altKey
                        )
                        setSelected({ trackId: track.id, sceneId: scene.id })
                        projectActions.selectClipSlot(track.id, scene.id)
                      }}
                      data-playing={playback?.playing ?? false}
                      data-queued={playback?.queued ?? ""}
                    >
                      <div
                        className={cn(
                          "project-session-slot",
                          active && "project-session-slot-selected"
                        )}
                        draggable={!!slot}
                        onDragStart={event => {
                          if (slot)
                            event.dataTransfer.setData(
                              "application/x-zoeydaw-launcher-clip",
                              slot.clip.id
                            )
                        }}
                        style={{ borderInlineStartColor: slot?.clip.color ?? track.color }}
                      >
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${slot ? t("project.session.launchClip") : t("project.session.stopTrack")} · ${track.name} · ${scene.name}`}
                          onClick={() =>
                            slot
                              ? projectActions.launchClip(track.id, scene.id)
                              : projectActions.stopLauncherTrack(track.id)
                          }
                        >
                          {slot ? <Play /> : <Square />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-w-0 flex-1 justify-start"
                          aria-pressed={slot ? selectedIds.includes(slot.clip.id) : active}
                          aria-label={`${t("project.session.selectSlot")} · ${track.name} · ${scene.name}`}
                          onClick={() => {
                            setSelected({ trackId: track.id, sceneId: scene.id })
                            projectActions.selectClipSlot(track.id, scene.id)
                          }}
                        >
                          <span className="truncate">
                            {slot
                              ? clipLabel(slot.clip, document.media)
                              : t("project.session.emptySlot")}
                          </span>
                        </Button>
                        {status && (
                          <span className="text-muted-foreground shrink-0 text-xs">{status}</span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {document.launcher.scenes.length === 0 && (
          <p className="text-muted-foreground p-3 text-xs">{t("project.session.hint")}</p>
        )}
      </div>
    </section>
  )
}
