import { useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import type { EventPayload } from "@gpuix/react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
} from "@/ui/controls"
import { fixedGridSteps, GRID_DENSITIES, gridLabel } from "@/project/model/grid"
import type { LaneContext, LaneMenuTarget } from "../interactions/types"
import type { LaneController } from "../interactions/controller"
import type { LaneTranslate } from "../messages"
import { ClipMenuItems } from "./ClipMenuItems"
import { AutomationMenuItems } from "./AutomationMenuItems"

export function LaneContextMenu({
  children,
  context,
  controller,
  resolveTarget,
  t,
}: {
  children: ReactNode
  context: LaneContext
  controller: LaneController
  resolveTarget: (event: EventPayload) => LaneMenuTarget | null
  t: LaneTranslate
}) {
  const scene = useSyncExternalStore(context.scene.subscribe, context.scene.get)
  const [target, setTarget] = useState<LaneMenuTarget | null>(null)
  const [open, setOpen] = useState(false)
  const grid = context.getState().workspace.grid
  const steps = fixedGridSteps(scene.transport.numerator, scene.transport.denominator)
  const currentSteps =
    grid.mode === "fixed" && steps.every(step => step.bars !== grid.bars)
      ? [
          ...steps,
          {
            bars: grid.bars,
            label: gridLabel(grid.bars, scene.transport.numerator, scene.transport.denominator),
          },
        ]
      : steps
  return (
    <ContextMenu open={open && target !== null} onOpenChange={setOpen}>
      <ContextMenuTrigger
        asChild
        role="application"
        onContextMenu={event => setTarget(resolveTarget(event))}
        onKeyDown={event => {
          const key = event.key?.toLowerCase()
          if (key !== "contextmenu" && !(key === "f10" && event.modifiers?.shift)) return
          setTarget(resolveKeyboardTarget(context))
        }}
      >
        {children}
      </ContextMenuTrigger>
      {target && (
        <ContextMenuContent>
          {target.kind === "clip" || target.kind === "clip-lane" ? (
            <ClipMenuItems target={target} context={context} controller={controller} t={t} />
          ) : (
            <AutomationMenuItems target={target} context={context} t={t} />
          )}
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t("arrangement.adaptiveGrid")}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup value={grid.mode === "adaptive" ? grid.density : ""}>
                {GRID_DENSITIES.map(density => (
                  <ContextMenuRadioItem
                    key={density}
                    value={density}
                    onClick={() => context.actions.setGrid({ mode: "adaptive", density })}
                  >
                    {t(`arrangement.gridDensity.${density}`)}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t("arrangement.fixedGrid")}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup value={grid.mode === "fixed" ? String(grid.bars) : ""}>
                {currentSteps.map(step => (
                  <ContextMenuRadioItem
                    key={step.bars}
                    value={String(step.bars)}
                    onClick={() => context.actions.setGrid({ mode: "fixed", bars: step.bars })}
                  >
                    {step.bars >= 1
                      ? `${step.bars} ${t(step.bars === 1 ? "arrangement.gridBar" : "arrangement.gridBars")}`
                      : step.label}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

function resolveKeyboardTarget(context: LaneContext): LaneMenuTarget | null {
  const selection = context.scene.get().targetSelection
  const { document, session } = context.getState()
  if (selection.kind === "automation" || selection.kind === "automation-value") {
    const lane = document.tracks
      .find(track => track.id === selection.trackId)
      ?.automation.find(item => item.id === selection.laneId)
    const pointId =
      selection.kind === "automation-value"
        ? selection.pointId
        : selection.pointIds.find(id => lane?.points.some(point => point.id === id))
    return pointId && lane?.points.some(point => point.id === pointId)
      ? {
          kind: "automation-point",
          trackId: selection.trackId,
          laneId: selection.laneId,
          pointId,
        }
      : null
  }
  if (selection.kind !== "clip" && selection.kind !== "none") return null
  const clipIds = session.selectedClipIds.filter(id =>
    document.tracks.some(track => track.clips.some(clip => clip.id === id))
  )
  const clipId = selection.kind === "clip" ? selection.id : clipIds[0]
  if (!clipId || !document.tracks.some(track => track.clips.some(clip => clip.id === clipId)))
    return null
  return { kind: "clip", clipId, clipIds: clipIds.includes(clipId) ? clipIds : [clipId] }
}
