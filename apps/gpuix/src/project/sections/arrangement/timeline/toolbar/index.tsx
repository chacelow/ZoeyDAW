import { Button, DragPadNumber, DragPadToggle, DropdownButton } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { projectActions, useProjectState } from "@/project/adapters"
import { fixedGridSteps, GRID_DENSITIES, gridLabel } from "@/project/model/grid"
import { effectiveDrawMode } from "@/project/model/interaction-mode"
import type { KeyboardOwner } from "../keyboard/controller"
import type { TimelineLabels } from "../labels"

export function Toolbar({
  pxPerBar,
  zoom,
  keyboard,
  labels,
}: {
  pxPerBar: number
  zoom: (direction: -1 | 1) => void
  keyboard: KeyboardOwner
  labels: TimelineLabels
}) {
  const theme = useTheme()
  const workspace = useProjectState(state => state.workspace)
  const { numerator, denominator } = useProjectState(state => state.document.transport)
  const draw = useProjectState(effectiveDrawMode)
  const octave = useProjectState(state => state.session.midiOctave)
  const velocity = useProjectState(state => state.session.midiVelocity)
  const fixed = fixedGridSteps(numerator, denominator)
  const grid = workspace.grid
  const choices = [
    ...fixed,
    ...(grid.mode === "fixed" && fixed.every(step => step.bars !== grid.bars)
      ? [{ bars: grid.bars, label: gridLabel(grid.bars, numerator, denominator) }]
      : []),
  ]
  return (
    <div
      testId="timeline-toolbar"
      style={sx({
        display: "flex",
        alignItems: "center",
        gap: theme.control["--spacing-control-track-gap"],
        width: "100%",
        flexShrink: 0,
        overflowX: "scroll",
        overflowY: "hidden",
        backgroundColor: theme.colors.editorShell,
        color: theme.colors.mutedForeground,
        padding: theme.control["--spacing-control-track-pad"],
      })}
    >
      <DragPadToggle
        value={workspace.snap}
        onChange={projectActions.setSnap}
        label={labels.snap}
        labelOn={labels.snap}
        labelOff={labels.snap}
      />
      <DropdownButton
        testId="timeline-grid-choice"
        value={grid.mode === "adaptive" ? grid.density : `fixed:${grid.bars}`}
        label={labels.grid}
        matchTriggerWidth={false}
        items={[
          { type: "heading", id: "adaptive-heading", label: labels.adaptiveGrid },
          ...GRID_DENSITIES.map(density => ({ id: density, label: labels.density[density] })),
          { type: "separator", id: "grid-mode-separator" },
          { type: "heading", id: "fixed-heading", label: labels.fixedGrid },
          ...choices.map(step => ({
            id: `fixed:${step.bars}`,
            label:
              step.bars >= 1
                ? `${step.bars} ${step.bars === 1 ? labels.bar : labels.bars}`
                : step.label,
          })),
        ]}
        onChange={value => {
          const step = choices.find(choice => `fixed:${choice.bars}` === value)
          if (step) projectActions.setGrid({ mode: "fixed", bars: step.bars })
          else {
            const density = GRID_DENSITIES.find(candidate => candidate === value)
            if (density) projectActions.setGrid({ mode: "adaptive", density })
          }
        }}
      />
      <DragPadToggle
        value={workspace.automationMode}
        onChange={enabled => projectActions.setMode("automationMode", enabled)}
        label={labels.automation}
        labelOn="A"
        labelOff="A"
      />
      <DragPadToggle
        value={draw}
        onChange={keyboard.latchDraw}
        label={labels.draw}
        labelOn="B"
        labelOff="B"
      />
      <Button
        iconOnly
        icon={<Icon name="Minus" />}
        variant="ghost"
        label={labels.zoomOut}
        onClick={() => zoom(-1)}
      />
      <Button
        iconOnly
        icon={<Icon name="Plus" />}
        variant="ghost"
        label={labels.zoomIn}
        onClick={() => zoom(1)}
      />
      <text
        style={sx({ fontSize: theme.control["--text-control-track"], flexShrink: 0 })}
      >{`${pxPerBar.toFixed(0)} ${labels.pixelsPerBar}`}</text>
      <Button
        icon={<Icon name="Save" />}
        variant="ghost"
        label={labels.save}
        onClick={projectActions.saveSnapshot}
      >
        {labels.save}
      </Button>
      <Button
        icon={<Icon name="FolderOpen" />}
        variant="ghost"
        label={labels.restore}
        onClick={projectActions.restoreSnapshot}
      >
        {labels.restore}
      </Button>
      <DragPadToggle
        value={workspace.computerKeyboard}
        onChange={enabled => projectActions.setMode("computerKeyboard", enabled)}
        label={labels.midiKeyboard}
        labelOn="MIDI"
        labelOff="MIDI"
      />
      <DragPadNumber
        value={octave}
        onChange={projectActions.setMidiOctave}
        min={0}
        max={8}
        step={1}
        defaultValue={4}
        label={labels.octave}
        format={value => `${labels.octave} ${Math.round(value)}`}
        widthSamples={[`${labels.octave} 8`]}
      />
      <DragPadNumber
        value={velocity}
        onChange={projectActions.setMidiVelocity}
        min={1}
        max={127}
        step={1}
        defaultValue={100}
        label={labels.velocity}
        format={value => `${labels.velocity} ${Math.round(value)}`}
        widthSamples={[`${labels.velocity} 127`]}
      />
    </div>
  )
}
