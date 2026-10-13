import { useState, type ReactNode } from "react"
import { useTranslation } from "@zoeymind/i18n"
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
} from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { fixedGridSteps, GRID_DENSITIES, gridLabel } from "@/pages/project/model/grid"
import type { CanvasMenuTarget } from "../interactions/types"
import { arrangementScene } from "../scene"
import { ClipMenuItems } from "./ClipMenuItems"
import { RulerMenuItems } from "../interactions/rulers/RulerMenuItems"
import { AutomationMenuItems } from "../interactions/automation/AutomationMenuItems"

export function CanvasContextMenu({
  children,
  getTarget,
}: {
  children: ReactNode
  getTarget(event: MouseEvent): CanvasMenuTarget | null
}) {
  const { t } = useTranslation()
  const [target, setTarget] = useState<CanvasMenuTarget | null>(null)
  const grid = useProjectState(state => state.workspace.grid)
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={<div className="absolute inset-0" />}
        onContextMenuCapture={event => {
          const next = getTarget(event.nativeEvent)
          if (!next) {
            event.preventDefault()
            event.stopPropagation()
            setTarget(null)
            return
          }
          setTarget(next)
        }}
      >
        {children}
      </ContextMenuTrigger>
      {target && (
        <ContextMenuContent
          finalFocus={() => {
            const selected = arrangementScene.get().targetSelection
            if (selected.kind === "marker" && selected.phase === "renaming")
              return document.querySelector<HTMLElement>("[data-marker-editor]")
            if (selected.kind === "clip" && selected.phase === "renaming")
              return document.querySelector<HTMLElement>("[data-clip-rename]")
            if (selected.kind === "automation-value")
              return document.querySelector<HTMLElement>("[data-automation-value-editor]")
            return true
          }}
        >
          {target.kind === "clip" || target.kind === "clip-lane" ? (
            <ClipMenuItems target={target} />
          ) : target.kind === "marker" || target.kind === "ruler" || target.kind === "loop" ? (
            <RulerMenuItems target={target} />
          ) : (
            <AutomationMenuItems target={target} />
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
                    onClick={() => projectActions.setGrid({ mode: "adaptive", density })}
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
                {[
                  ...fixedGridSteps(numerator, denominator),
                  ...(grid.mode === "fixed" &&
                  !fixedGridSteps(numerator, denominator).some(step => step.bars === grid.bars)
                    ? [{ bars: grid.bars, label: gridLabel(grid.bars, numerator, denominator) }]
                    : []),
                ].map(step => (
                  <ContextMenuRadioItem
                    key={step.bars}
                    value={String(step.bars)}
                    onClick={() => projectActions.setGrid({ mode: "fixed", bars: step.bars })}
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
