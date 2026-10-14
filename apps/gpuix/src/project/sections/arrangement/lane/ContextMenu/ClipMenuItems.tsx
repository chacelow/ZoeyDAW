import { Button, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { acceptsClip, positionToBar } from "@/project/model/types"
import type { Clip } from "@/project/model/types"
import type { LaneContext, LaneMenuTarget } from "../interactions/types"
import type { LaneController } from "../interactions/controller"
import type { LaneTranslate } from "../messages"
import { resolveContentColor, CONTENT_PALETTE } from "@/shared/theme/content-color"

export function ClipMenuItems({
  target,
  context,
  controller,
  t,
}: {
  target: Extract<LaneMenuTarget, { kind: "clip" | "clip-lane" }>
  context: LaneContext
  controller: LaneController
  t: LaneTranslate
}) {
  const theme = useTheme()
  const state = context.getState()
  if (target.kind === "clip-lane") {
    const track = state.document.tracks.find(item => item.id === target.trackId)
    if (!track) return null
    const create = (kind: Clip["kind"]) => {
      const selected = context.getState().session.timeSelection
      const grid = context.scene.get().gridPlan.cellBars
      const length =
        selected?.trackIds.includes(track.id) &&
        target.bar >= selected.startBar &&
        target.bar <= selected.endBar
          ? selected.endBar - target.bar
          : grid
      context.actions.createClip(track.id, kind, target.bar, Math.max(grid, length))
      const created = context
        .getState()
        .document.tracks.find(item => item.id === track.id)
        ?.clips.at(-1)
      if (created) {
        context.actions.selectClips([created.id])
        context.scene.setSelection(new Set([created.id]))
      }
    }
    return (
      <>
        <ContextMenuLabel>{track.name}</ContextMenuLabel>
        {(["audio", "midi", "pattern"] satisfies Clip["kind"][])
          .filter(kind => acceptsClip(track.kind, kind))
          .map(kind => (
            <ContextMenuItem key={kind} onClick={() => create(kind)}>
              {t(
                kind === "audio"
                  ? "arrangement.createAudioClip"
                  : kind === "midi"
                    ? "arrangement.createMidiClip"
                    : "arrangement.createPatternClip"
              )}
            </ContextMenuItem>
          ))}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => controller.clipboard("paste", "clip")}>
          {t("arrangement.paste")}
        </ContextMenuItem>
      </>
    )
  }
  const owner = state.document.tracks.find(track =>
    track.clips.some(clip => clip.id === target.clipId)
  )
  const clip = owner?.clips.find(item => item.id === target.clipId)
  if (!clip) return null
  const ids = [...target.clipIds]
  const splitBar =
    state.session.timeSelection?.startBar ??
    state.session.insertionPoint?.bar ??
    positionToBar(state.session.position, state.document.transport.numerator)
  const canSplit = state.document.tracks.some(track =>
    track.clips.some(
      item =>
        ids.includes(item.id) &&
        splitBar > item.startBar &&
        splitBar < item.startBar + item.lengthBars
    )
  )
  return (
    <>
      <ContextMenuLabel>{clip.label ?? clip.kind}</ContextMenuLabel>
      <ContextMenuItem onClick={() => context.actions.setEditingClip(clip.id)}>
        {t("detail.openClip")}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() =>
          context.scene.setTargetSelection({ kind: "clip", id: clip.id, phase: "renaming" })
        }
      >
        {t("arrangement.rename")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => controller.clipboard("copy", "clip")}>
        {t("arrangement.copy")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => controller.clipboard("cut", "clip")}>
        {t("arrangement.cut")}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          context.actions.beginEdit()
          context.actions.duplicateClips(ids)
          context.actions.endEdit()
          context.scene.setSelection(new Set(context.getState().session.selectedClipIds))
        }}
      >
        {t("arrangement.duplicateClip")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!canSplit}
        onClick={() => {
          context.actions.beginEdit()
          context.actions.splitClips(ids, splitBar)
          context.actions.endEdit()
        }}
      >
        {t("arrangement.splitAtPlayhead")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <div
        role="group"
        aria-label={t("arrangement.clipColor")}
        style={sx({
          display: "flex",
          gap: theme.control["--spacing-control-gap"],
          padding: theme.control["--spacing-control-gap"],
        })}
      >
        {CONTENT_PALETTE.map((color, index) => (
          <Button
            key={color}
            iconOnly
            aria-label={`${t("arrangement.clipColor")} ${index + 1}`}
            active={clip.color === color}
            style={sx({ backgroundColor: resolveContentColor(color, theme.colors) })}
            onClick={() => {
              context.actions.beginEdit()
              for (const id of ids) context.actions.updateClip(id, { color })
              context.actions.endEdit()
            }}
          />
        ))}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem
        style={sx({ color: theme.colors.destructive })}
        onClick={() => {
          context.actions.deleteClips(ids)
          context.scene.setSelection(new Set())
        }}
      >
        {t("arrangement.deleteClip")}
      </ContextMenuItem>
    </>
  )
}
