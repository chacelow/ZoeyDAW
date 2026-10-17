import { memo } from "react"
import { DEFAULT_KEYMAP } from "@/platform/keyboard"
import { Button, ControlGroup, DragPadNumber, DragPadToggle, DropdownButton } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { canSaveProjectFile, projectActions, useProjectState } from "@/project/adapters"
import { fixedGridSteps, GRID_DENSITIES, gridLabel } from "@/project/model/grid"
import { effectiveDrawMode } from "@/project/model/interaction-mode"
import type { KeyboardOwner } from "../keyboard/controller"
import type { TimelineLabels } from "../labels"

export const Toolbar = memo(function Toolbar({
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
  const saveAvailable = useProjectState(canSaveProjectFile)
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
        backgroundColor: theme.colors.arrangementSurfaceAlt,
        color: theme.colors.mutedForeground,
        padding: theme.control["--spacing-control-track-pad"],
      })}
    >
      <ControlGroup variant="toolbar">
        <DragPadToggle
          size="default"
          variant="outline"
          value={workspace.snap}
          onChange={projectActions.setSnap}
          label={labels.snap}
          labelOn={labels.snap}
          labelOff={labels.snap}
        />
        <DropdownButton
          size="default"
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
      </ControlGroup>
      <ControlGroup variant="toolbar">
        <DragPadToggle
          size="default"
          variant="outline"
          value={workspace.automationMode}
          onChange={enabled => projectActions.setMode("automationMode", enabled)}
          label={labels.automation}
          labelOn={DEFAULT_KEYMAP.formatKeys("arrangement.toggleAutomation")}
          labelOff={DEFAULT_KEYMAP.formatKeys("arrangement.toggleAutomation")}
        />
        <DragPadToggle
          size="default"
          variant="outline"
          value={draw}
          onChange={keyboard.latchDraw}
          label={labels.draw}
          labelOn={DEFAULT_KEYMAP.formatKeys("arrangement.draw")}
          labelOff={DEFAULT_KEYMAP.formatKeys("arrangement.draw")}
        />
      </ControlGroup>
      <ControlGroup variant="toolbar">
        <Button
          size="default"
          iconOnly
          icon={<Icon name="Minus" />}
          variant="outline"
          label={labels.zoomOut}
          onClick={() => zoom(-1)}
        />
        <Button
          size="default"
          iconOnly
          icon={<Icon name="Plus" />}
          variant="outline"
          label={labels.zoomIn}
          onClick={() => zoom(1)}
        />
      </ControlGroup>
      <div
        style={sx({
          display: "flex",
          alignItems: "center",
          fontSize: theme.control["--text-control-track"],
          flexShrink: 0,
        })}
      >{`${labels.formats.number(pxPerBar, "integer")} ${labels.pixelsPerBar}`}</div>
      <ControlGroup variant="toolbar">
        <Button
          size="default"
          testId="timeline-save"
          icon={<Icon name="Save" />}
          variant="outline"
          label={labels.save}
          disabled={!saveAvailable}
          onClick={projectActions.save}
        >
          {labels.save}
        </Button>
        <Button
          size="default"
          testId="timeline-open"
          icon={<Icon name="FolderOpen" />}
          variant="outline"
          label={labels.open}
          onClick={projectActions.requestOpen}
        >
          {labels.open}
        </Button>
      </ControlGroup>
      <ControlGroup variant="toolbar">
        <DragPadToggle
          size="default"
          variant="outline"
          value={workspace.computerKeyboard}
          onChange={enabled => projectActions.setMode("computerKeyboard", enabled)}
          label={labels.midiKeyboard}
          labelOn="MIDI"
          labelOff="MIDI"
        />
        <DragPadNumber
          value={octave}
          onChange={projectActions.setMidiOctave}
          size="default"
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
          size="default"
          min={1}
          max={127}
          step={1}
          defaultValue={100}
          label={labels.velocity}
          format={value => `${labels.velocity} ${Math.round(value)}`}
          widthSamples={[`${labels.velocity} 127`]}
        />
      </ControlGroup>
    </div>
  )
})
