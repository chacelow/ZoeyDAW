/**
 * Standalone demo entry for DragPadNumber. Run with:
 *
 *   bun --hot src/features/drag-pad/demo.tsx
 *
 * Three instances with deliberately different ranges (BPM 20–300, pan
 * −1..1, percentage 0–100) prove the shared drag scale: the same vertical
 * distance moves every one of them by the same number of `step`s, not a
 * range-scaled amount.
 */
import { useState } from "react"
import { render } from "@gpuix/react"
import { ThemeProvider, useTheme } from "../../shared/theme/ThemeProvider"
import { sx } from "../../shared/theme/style"
import { DragPadNumber } from "./DragPadNumber"

function LabeledPad(props: {
  testId: string
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  defaultValue: number
}) {
  const theme = useTheme()
  return (
    <div style={sx({ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" })}>
      <DragPadNumber
        testId={props.testId}
        label={props.label}
        value={props.value}
        onChange={props.onChange}
        min={props.min}
        max={props.max}
        step={props.step}
        defaultValue={props.defaultValue}
      />
      <text style={{ fontSize: 10, color: theme.colors.mutedForeground }}>{props.label}</text>
    </div>
  )
}

function DragPadGallery() {
  const theme = useTheme()
  const [bpm, setBpm] = useState(120)
  const [pan, setPan] = useState(0)
  const [percent, setPercent] = useState(50)
  const [disabledValue, setDisabledValue] = useState(42)

  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "column",
        gap: theme.control["--spacing-control-gap"] * 4,
        padding: 24,
        width: "100%",
        height: "100%",
        backgroundColor: theme.colors.background,
      })}
    >
      <text style={{ color: theme.colors.foreground, fontSize: 18 }}>
        DragPadNumber — relative-drag control
      </text>
      <text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
        Drag vertically to scrub. Click (no drag) to pre-edit, type to edit live, double-click to
        reset. Hover + wheel also adjusts.
      </text>
      <text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
        Dragging hides the real OS cursor (macOS only, via native-cursor.ts) and restores it to the
        exact mouseDown pixel on release, not the end position of the drag.
      </text>
      <div style={sx({ display: "flex", flexDirection: "row", gap: 32 })}>
        <LabeledPad
          testId="pad-bpm"
          label="BPM (20–300, step 1)"
          value={bpm}
          onChange={setBpm}
          min={20}
          max={300}
          step={1}
          defaultValue={120}
        />
        <LabeledPad
          testId="pad-pan"
          label="Pan (−1..1, step 0.01)"
          value={pan}
          onChange={setPan}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
        />
        <LabeledPad
          testId="pad-percent"
          label="Percent (0–100, step 1)"
          value={percent}
          onChange={setPercent}
          min={0}
          max={100}
          step={1}
          defaultValue={50}
        />
      </div>
      <div style={sx({ display: "flex", flexDirection: "row", gap: 32, alignItems: "center" })}>
        <DragPadNumber
          testId="pad-disabled"
          label="Disabled"
          value={disabledValue}
          onChange={setDisabledValue}
          min={0}
          max={127}
          step={1}
          defaultValue={64}
          disabled
        />
        <text style={{ fontSize: 10, color: theme.colors.mutedForeground }}>Disabled</text>
      </div>
    </div>
  )
}

render(
  <ThemeProvider>
    <DragPadGallery />
  </ThemeProvider>,
  { title: "DragPadNumber demo", width: 640, height: 320 }
)
