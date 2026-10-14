import { ContextMenuItem, ContextMenuSeparator } from "../../../../../ui/controls"
import { useTheme } from "../../../../../shared/theme/ThemeProvider"
import { sx } from "../../../../../shared/theme/style"
import type { LaneContext, LaneMenuTarget } from "../interactions/types"
import type { LaneTranslate } from "../messages"

export function AutomationMenuItems({
  target,
  context,
  t,
}: {
  target: Extract<
    LaneMenuTarget,
    { kind: "automation-point" | "automation-segment" | "automation-lane" }
  >
  context: LaneContext
  t: LaneTranslate
}) {
  const theme = useTheme()
  if (target.kind === "automation-point")
    return (
      <>
        <ContextMenuItem
          onClick={() => {
            const selection = context.scene.get().targetSelection
            const pointIds =
              selection.kind === "automation" &&
              selection.trackId === target.trackId &&
              selection.laneId === target.laneId &&
              selection.pointIds.includes(target.pointId)
                ? selection.pointIds
                : [target.pointId]
            context.scene.setTargetSelection({
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
            context.actions.resetAutomationCurve(target.trackId, target.laneId, target.pointId)
          }
        >
          {t("arrangement.resetAutomationCurve")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          style={sx({ color: theme.colors.destructive })}
          onClick={() => {
            context.actions.deleteAutomationPoint(target.trackId, target.laneId, target.pointId)
            context.scene.setTargetSelection({ kind: "none" })
          }}
        >
          {t("arrangement.deleteAutomationPoint")}
        </ContextMenuItem>
      </>
    )
  return (
    <>
      <ContextMenuItem
        onClick={() =>
          context.actions.setAutomationPoint(target.trackId, target.laneId, {
            bar: target.bar,
            value: target.value,
          })
        }
      >
        {t("arrangement.addAutomationPoint")}
      </ContextMenuItem>
      {target.kind === "automation-segment" && (
        <ContextMenuItem
          onClick={() =>
            context.actions.resetAutomationCurve(target.trackId, target.laneId, target.fromPointId)
          }
        >
          {t("arrangement.resetAutomationCurve")}
        </ContextMenuItem>
      )}
    </>
  )
}
