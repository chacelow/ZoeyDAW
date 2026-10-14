import { useTranslation } from "@zoeymind/i18n"
import { ContextMenuItem, ContextMenuSeparator } from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { positionToBar } from "@/pages/project/model/types"
import { MIN_CLIP_LENGTH_BARS } from "@/pages/project/model/grid"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { CanvasMenuTarget } from "@/pages/project/sections/ArrangementPanel/canvas/interactions/types"

export function RulerMenuItems({
  target,
}: {
  readonly target: Extract<CanvasMenuTarget, { kind: "marker" | "loop" | "ruler" }>
}) {
  const { t } = useTranslation()
  const { loop } = arrangementScene.get()
  if (target.kind === "ruler") {
    return (
      <>
        <ContextMenuItem
          onClick={() => {
            const id = projectActions.addMarker(target.bar)
            if (id) {
              arrangementScene.setTargetSelection({ kind: "marker", id, phase: "selected" })
            }
          }}
        >
          {t("arrangement.addMarker")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => projectActions.setLoop({ enabled: !arrangementScene.get().loop.enabled })}
        >
          {t(loop.enabled ? "arrangement.disableLoop" : "arrangement.enableLoop")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const state = arrangementScene.get()
            const selection =
              state.timeSelection ?? useProjectState.getState().session.timeSelection
            if (
              selection &&
              Number.isFinite(selection.startBar) &&
              Number.isFinite(selection.endBar) &&
              selection.endBar > selection.startBar
            ) {
              const startBar = Math.max(
                1,
                Math.min(state.bars + 1 - MIN_CLIP_LENGTH_BARS, selection.startBar)
              )
              const endBar = Math.max(
                startBar + MIN_CLIP_LENGTH_BARS,
                Math.min(state.bars + 1, selection.endBar)
              )
              projectActions.setLoop({ enabled: true, startBar, endBar })
            } else {
              const startBar = Math.max(
                1,
                Math.min(state.bars + 1 - MIN_CLIP_LENGTH_BARS, target.bar)
              )
              projectActions.setLoop({
                enabled: true,
                startBar,
                endBar: Math.min(state.bars + 1, startBar + Math.max(1, state.gridPlan.cellBars)),
              })
            }
            arrangementScene.setTargetSelection({ kind: "loop" })
          }}
        >
          {t("arrangement.loopRegion")}
        </ContextMenuItem>
      </>
    )
  }
  if (target.kind === "loop") {
    return (
      <>
        <ContextMenuItem onClick={() => projectActions.setLoop({ enabled: !loop.enabled })}>
          {t(loop.enabled ? "arrangement.disableLoop" : "arrangement.enableLoop")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const state = arrangementScene.get()
            const selection =
              state.timeSelection ?? useProjectState.getState().session.timeSelection
            if (
              selection &&
              Number.isFinite(selection.startBar) &&
              Number.isFinite(selection.endBar) &&
              selection.endBar > selection.startBar
            ) {
              const startBar = Math.max(
                1,
                Math.min(state.bars + 1 - MIN_CLIP_LENGTH_BARS, selection.startBar)
              )
              const endBar = Math.max(
                startBar + MIN_CLIP_LENGTH_BARS,
                Math.min(state.bars + 1, selection.endBar)
              )
              projectActions.setLoop({ enabled: true, startBar, endBar })
            }
          }}
        >
          {t("arrangement.loopToSelection")}
        </ContextMenuItem>
      </>
    )
  }
  const marker = arrangementScene.get().markers.find(item => item.id === target.markerId)
  function seek(direction: -1 | 1) {
    const state = useProjectState.getState()
    const current = positionToBar(state.session.position, state.document.transport.numerator)
    const sorted = [...state.document.markers].sort((a, b) => a.bar - b.bar)
    const next =
      direction < 0
        ? sorted.reverse().find(item => item.bar < current - 1e-6)
        : sorted.find(item => item.bar > current + 1e-6)
    if (!next) {
      return
    }

    projectActions.seekBar(next.bar)
    arrangementScene.setTargetSelection({ kind: "marker", id: next.id, phase: "selected" })
  }
  return (
    <>
      <ContextMenuItem
        onClick={() =>
          arrangementScene.setTargetSelection({
            kind: "marker",
            id: target.markerId,
            phase: "renaming",
          })
        }
      >
        {t("arrangement.rename")}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          if (marker) {
            projectActions.seekBar(marker.bar)
          }
        }}
      >
        {t("arrangement.seekMarker")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => seek(-1)}>{t("arrangement.previousMarker")}</ContextMenuItem>
      <ContextMenuItem onClick={() => seek(1)}>{t("arrangement.nextMarker")}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onClick={() => {
          projectActions.deleteMarker(target.markerId)
          arrangementScene.setTargetSelection({ kind: "none" })
        }}
      >
        {t("arrangement.deleteMarker")}
      </ContextMenuItem>
    </>
  )
}
