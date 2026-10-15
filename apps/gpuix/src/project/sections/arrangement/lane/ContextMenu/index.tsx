import { useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import type { EventPayload } from "@gpuix/react"
import { useGpuix } from "@gpuix/react"
import { TRACK_TITLE_HEIGHT } from "@/project/layout"
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
  const { renderer } = useGpuix()
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
        onMouseDown={event => {
          if (event.button === 2 || event.isRightClick || event.modifiers?.ctrl)
            setTarget(resolveTarget(event))
        }}
        onKeyDown={event => {
          const key = event.key?.toLowerCase()
          if (key !== "contextmenu" && !(key === "f10" && event.modifiers?.shift)) return
          const focused = renderer?.getFocusedElementId?.()
          const bounds =
            focused === undefined || focused === null ? null : renderer?.getElementBounds?.(focused)
          setTarget(
            bounds
              ? resolveTarget({
                  ...event,
                  x: bounds.x + bounds.width / 2,
                  y: bounds.y + Math.min(TRACK_TITLE_HEIGHT, bounds.height) / 2,
                })
              : null
          )
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
