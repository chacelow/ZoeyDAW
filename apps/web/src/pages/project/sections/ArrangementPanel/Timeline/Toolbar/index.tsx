import { Minus, Plus, Save, FolderOpen } from "lucide-react"
import { Button, DragPadNumber, DragPadToggle, DropdownButton } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { fixedGridSteps, GRID_DENSITIES, gridLabel } from "@/pages/project/model/grid"
import { effectiveDrawMode } from "@/pages/project/model/interaction-mode"
import { setDrawModeLatched } from "../drawModeKey"

export function Toolbar({ pxPerBar, zoom }: { pxPerBar: number; zoom(direction: -1 | 1): void }) {
  const { t } = useTranslation()
  const snap = useProjectState(state => state.workspace.snap)
  const grid = useProjectState(state => state.workspace.grid)
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  const automationMode = useProjectState(state => state.workspace.automationMode)
  const drawMode = useProjectState(effectiveDrawMode)
  const computerKeyboard = useProjectState(state => state.workspace.computerKeyboard)
  const midiOctave = useProjectState(state => state.session.midiOctave)
  const midiVelocity = useProjectState(state => state.session.midiVelocity)
  return (
    <div className="project-arrangement-toolbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--arrangement-line)] bg-[var(--arrangement-ruler)] px-2 py-1">
      <DragPadToggle
        value={snap}
        onChange={projectActions.setSnap}
        label={t(snap ? "arrangement.snapOn" : "arrangement.snapOff")}
        labelOn="Snap"
        labelOff="Snap"
        size="compact"
      />
      <DropdownButton
        value={grid.mode === "adaptive" ? grid.density : `fixed:${grid.bars}`}
        onChange={value => {
          if (value.startsWith("fixed:"))
            projectActions.setGrid({ mode: "fixed", bars: Number(value.slice(6)) })
          else {
            const density = GRID_DENSITIES.find(candidate => candidate === value)
            if (density) projectActions.setGrid({ mode: "adaptive", density })
          }
        }}
        items={[
          { type: "heading", id: "adaptive-heading", label: t("arrangement.adaptiveGrid") },
          ...GRID_DENSITIES.map(density => ({
            id: density,
            label: t(`arrangement.gridDensity.${density}`),
          })),
          { type: "separator", id: "grid-mode-separator" },
          { type: "heading", id: "fixed-heading", label: t("arrangement.fixedGrid") },
          ...[
            ...fixedGridSteps(numerator, denominator),
            ...(grid.mode === "fixed" &&
            !fixedGridSteps(numerator, denominator).some(step => step.bars === grid.bars)
              ? [{ bars: grid.bars, label: gridLabel(grid.bars, numerator, denominator) }]
              : []),
          ].map(step => ({
            id: `fixed:${step.bars}`,
            label:
              step.bars >= 1
                ? `${step.bars} ${t(step.bars === 1 ? "arrangement.gridBar" : "arrangement.gridBars")}`
                : step.label,
          })),
        ]}
        label={t("arrangement.gridSpacing")}
        size="compact"
        matchTriggerWidth={false}
      />
      <DragPadToggle
        value={automationMode}
        onChange={enabled => projectActions.setMode("automationMode", enabled)}
        label={t("arrangement.automationMode")}
        labelOn="A"
        labelOff="A"
        size="compact"
      />
      <DragPadToggle
        value={drawMode}
        onChange={setDrawModeLatched}
        label={t("arrangement.drawMode")}
        labelOn="B"
        labelOff="B"
        size="compact"
      />
      <Button
        variant="ghost"
        size="control-icon"
        onClick={() => zoom(-1)}
        aria-label={t("arrangement.zoomOut")}
      >
        <Minus />
      </Button>
      <Button
        variant="ghost"
        size="control-icon"
        onClick={() => zoom(1)}
        aria-label={t("arrangement.zoomIn")}
      >
        <Plus />
      </Button>
      <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
        {pxPerBar.toFixed(0)} px/bar
      </span>
      <Button
        variant="ghost"
        size="control"
        onClick={projectActions.saveSnapshot}
        aria-label={t("arrangement.saveSnapshot")}
      >
        <Save />
        {t("arrangement.saveSnapshot")}
      </Button>
      <Button
        variant="ghost"
        size="control"
        onClick={projectActions.restoreSnapshot}
        aria-label={t("arrangement.restoreSnapshot")}
      >
        <FolderOpen />
        {t("arrangement.restoreSnapshot")}
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <DragPadToggle
          value={computerKeyboard}
          onChange={enabled => projectActions.setMode("computerKeyboard", enabled)}
          label={t("arrangement.midiKeyboard")}
          labelOn="MIDI"
          labelOff="MIDI"
          size="compact"
        />
        <DragPadNumber
          value={midiOctave}
          onChange={projectActions.setMidiOctave}
          min={0}
          max={8}
          step={1}
          defaultValue={4}
          label={t("arrangement.octave")}
          format={value => `${t("arrangement.octave")} ${Math.round(value)}`}
          size="compact"
        />
        <DragPadNumber
          value={midiVelocity}
          onChange={projectActions.setMidiVelocity}
          min={1}
          max={127}
          step={1}
          defaultValue={100}
          label={t("arrangement.velocity")}
          format={value => `${t("arrangement.velocity")} ${Math.round(value)}`}
          size="compact"
        />
      </div>
    </div>
  )
}
