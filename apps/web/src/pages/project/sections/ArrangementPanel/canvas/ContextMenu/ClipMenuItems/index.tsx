import { useTranslation } from "@zoeymind/i18n"
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { positionToBar } from "@zoeydaw/project-core/types"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { CanvasMenuTarget } from "@/pages/project/sections/ArrangementPanel/canvas/interactions/types"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function ClipMenuItems({
  target,
}: {
  readonly target: Extract<CanvasMenuTarget, { kind: "clip" | "clip-lane" }>
}) {
  const { t } = useTranslation()
  if (target.kind === "clip-lane") {
    const track = useProjectState
      .getState()
      .document.tracks.find(item => item.id === target.trackId)
    if (!track) {
      return null
    }
    const create = () => {
      const selected = useProjectState.getState().session.timeSelection
      const withinSelection =
        selected?.trackIds.includes(track.id) &&
        target.bar >= selected.startBar &&
        target.bar < selected.endBar
      const start = selected && withinSelection ? selected.startBar : target.bar
      const length =
        selected && withinSelection
          ? selected.endBar - selected.startBar
          : arrangementScene.get().gridPlan.cellBars
      const id = projectActions.createClip(track.id, "midi", start, length)
      if (!id) {
        return
      }

      projectActions.selectClips([id])
      arrangementScene.setSelection(new Set([id]))
      projectActions.setEditingClip(id)
    }
    return (
      <>
        <ContextMenuLabel>{track.name}</ContextMenuLabel>
        {track.kind === "midi" && (
          <ContextMenuItem onClick={create}>{t("arrangement.createMidiClip")}</ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            projectActions.beginEdit()
            projectActions.pasteClips(track.id, target.bar)
            projectActions.endEdit()
            arrangementScene.setSelection(
              new Set(useProjectState.getState().session.selectedClipIds)
            )
          }}
        >
          {t("arrangement.paste")}
        </ContextMenuItem>
      </>
    )
  }
  const state = useProjectState.getState()
  const clip = state.document.tracks
    .flatMap(track => track.clips)
    .find(item => item.id === target.clipId)
  const ids = [...target.clipIds]
  if (!clip) {
    return null
  }
  const rename = () => {
    arrangementScene.setTargetSelection({ kind: "clip", id: clip.id, phase: "renaming" })
  }
  const split = () => {
    const current = useProjectState.getState()
    const bar =
      current.session.timeSelection?.startBar ??
      positionToBar(current.session.position, current.document.transport.numerator)
    projectActions.beginEdit()
    projectActions.splitClips(ids, bar)
    projectActions.endEdit()
  }
  return (
    <>
      <ContextMenuLabel>{clip.label ?? clip.kind}</ContextMenuLabel>
      <ContextMenuItem onClick={() => projectActions.setEditingClip(clip.id)}>
        {t("detail.openClip")}
      </ContextMenuItem>
      <ContextMenuItem onClick={rename}>{t("arrangement.rename")}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() =>
          projectActions.copyClips(
            ids,
            useProjectState.getState().session.timeSelection ?? undefined
          )
        }
      >
        {t("arrangement.copy")}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          projectActions.beginEdit()
          projectActions.cutClips(
            ids,
            useProjectState.getState().session.timeSelection ?? undefined
          )
          projectActions.endEdit()
          arrangementScene.setSelection(new Set())
        }}
      >
        {t("arrangement.cut")}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          projectActions.beginEdit()
          projectActions.duplicateClips(ids)
          projectActions.endEdit()
          arrangementScene.setSelection(new Set(useProjectState.getState().session.selectedClipIds))
        }}
      >
        {t("arrangement.duplicateClip")}
      </ContextMenuItem>
      <ContextMenuItem onClick={split}>{t("arrangement.splitAtPlayhead")}</ContextMenuItem>
      <ContextMenuSeparator />
      <div className="flex gap-1 p-1" role="group" aria-label={t("arrangement.clipColor")}>
        {COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            aria-label={`${t("arrangement.clipColor")} ${index + 1}`}
            className="border-border size-5 rounded-sm border"
            style={{ background: color }}
            onClick={() => {
              projectActions.beginEdit()
              for (const id of ids) projectActions.updateClip(id, { color })
              projectActions.endEdit()
            }}
          />
        ))}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onClick={() => {
          projectActions.deleteClips(ids)
          arrangementScene.setSelection(new Set())
        }}
      >
        {t("arrangement.deleteClip")}
      </ContextMenuItem>
    </>
  )
}
