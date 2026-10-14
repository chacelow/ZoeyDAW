import { useTranslation } from "@zoeymind/i18n"
import { ContextMenuItem, ContextMenuSeparator } from "@zoeymind/ui"
import { projectActions } from "@/pages/project/adapters"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { CanvasMenuTarget } from "@/pages/project/sections/ArrangementPanel/canvas/interactions/types"

export function AutomationMenuItems({
  target,
}: {
  readonly target: Extract<
    CanvasMenuTarget,
    { kind: "automation-point" | "automation-segment" | "automation-lane" }
  >
}) {
  const { t } = useTranslation()
  if (target.kind === "automation-point") {
    return (
      <>
        <ContextMenuItem
          onClick={() => {
            const selection = arrangementScene.get().targetSelection
            const pointIds =
              selection.kind === "automation" &&
              selection.trackId === target.trackId &&
              selection.laneId === target.laneId &&
              selection.pointIds.includes(target.pointId)
                ? selection.pointIds
                : [target.pointId]
            arrangementScene.setTargetSelection({
              kind: "automation-value",
              trackId: target.trackId,
              laneId: target.laneId,
              pointId: target.pointId,
              pointIds,
            })
          }}
        >
          {t("arrangement.editAutomationValue")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            projectActions.resetAutomationCurve(target.trackId, target.laneId, target.pointId)
          }
        >
          {t("arrangement.resetAutomationCurve")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => {
            projectActions.deleteAutomationPoint(target.trackId, target.laneId, target.pointId)
            arrangementScene.setTargetSelection({ kind: "none" })
          }}
        >
          {t("arrangement.deleteAutomationPoint")}
        </ContextMenuItem>
      </>
    )
  }
  if (target.kind === "automation-segment") {
    return (
      <>
        <ContextMenuItem
          onClick={() => {
            return projectActions.setAutomationPoint(target.trackId, target.laneId, {
              bar: target.bar,
              value: target.value,
            })
          }}
        >
          {t("arrangement.addAutomationPoint")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            projectActions.resetAutomationCurve(target.trackId, target.laneId, target.fromPointId)
          }
        >
          {t("arrangement.resetAutomationCurve")}
        </ContextMenuItem>
      </>
    )
  }
  return (
    <ContextMenuItem
      onClick={() =>
        projectActions.setAutomationPoint(target.trackId, target.laneId, {
          bar: target.bar,
          value: target.value,
        })
      }
    >
      {t("arrangement.addAutomationPoint")}
    </ContextMenuItem>
  )
}
