import { useMemo } from "react"
import { Shape } from "@/shared/svg/Shape"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useInfoBinding } from "../ControlEnvironment"
import { formatNumericValue } from "../DragPad/numberModel"
import { useDragPad } from "../DragPad/useDragPad"
import { snapControlWidth } from "../grid"
import { useMeasuredTextWidth } from "../useMeasuredTextWidth"
import type { Props } from "@gpuix/react"
import type { UseDragPadOptions } from "../DragPad/useDragPad"
import type { ControlSize } from "../chrome"

export interface KnobProps extends Omit<UseDragPadOptions, "format" | "parse" | "editable"> {
  readonly label: string
  readonly description?: string
  readonly format?: (value: number) => string
  readonly bipolar?: boolean
  readonly color?: string
  readonly size?: ControlSize
  readonly testId?: string
  readonly style?: Props["style"]
}

function point(center: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180
  return `${center + radius * Math.sin(radians)} ${center - radius * Math.cos(radians)}`
}

export function arcPath(center: number, radius: number, from: number, to: number): string | null {
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  if (end - start < 0.01) return null
  const large = end - start > 180 ? 1 : 0
  return `M ${point(center, radius, start)} A ${radius} ${radius} 0 ${large} 1 ${point(center, radius, end)}`
}

export function Knob({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  dragStep,
  defaultValue,
  disabled = false,
  format,
  bipolar = false,
  color,
  size = "default",
  testId,
  style,
  onGestureStart,
  onGestureEnd,
  onGestureCancel,
}: KnobProps) {
  const theme = useTheme()
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const toText = useMemo(
    () => format ?? formatNumericValue(min, max, step),
    [format, min, max, step]
  )
  const pad = useDragPad({
    value,
    onChange,
    min,
    max,
    step,
    dragStep,
    defaultValue,
    disabled,
    editable: false,
    format: toText,
    onGestureStart,
    onGestureEnd,
    onGestureCancel,
  })
  const info = useInfoBinding({ type: "knob", description, dragging: pad.dragging })
  const { diameterRatio, sweepDegrees, strokeWidth, indicatorWidth } = theme.design.knob
  const unit = theme.control["--spacing-control-track"]
  const diameter = snapControlWidth(
    metrics["--spacing-control-track"] * Math.ceil(diameterRatio),
    unit
  )
  const fontSize = style?.fontSize ?? metrics["--text-control-track"]
  const labelMeasurement = useMeasuredTextWidth([label], {
    fontSize,
    fontFamily: style?.fontFamily,
    fontWeight: style?.fontWeight,
  })
  const valueMeasurement = useMeasuredTextWidth(
    [toText(min), toText(max), ...(defaultValue === undefined ? [] : [toText(defaultValue)])],
    { fontSize, fontFamily: theme.design.typography.numberFontFamily }
  )
  const width = snapControlWidth(
    Math.max(diameter, labelMeasurement.width, valueMeasurement.width),
    unit
  )
  const center = diameter / 2
  const radius = center - strokeWidth / 2
  const half = sweepDegrees / 2
  const normalized = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = -half + normalized * sweepDegrees
  const origin = bipolar ? 0 : -half
  const track = arcPath(center, radius, -half, half)
  const filled = arcPath(center, radius, origin, angle)
  const indicator = `M ${point(center, radius * 0.35, angle)} L ${point(center, radius, angle)}`
  const valueColor = disabled ? theme.colors.mutedForeground : (color ?? theme.colors.primary)
  return (
    <div
      testId={testId}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={description ? `${label} — ${description}` : label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={pad.display}
      aria-disabled={disabled}
      style={sx(
        {
          display: "flex",
          position: "relative",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
          gap: 0,
          width,
          height: diameter + theme.design.grid.knobTextUnits * unit,
          justifyContent: "space-between",
          fontSize: metrics["--text-control-track"],
          color: theme.colors.foreground,
          opacity: disabled ? theme.design.states.disabledOpacity : 1,
          cursor: disabled ? theme.design.cursors.disabled : theme.design.cursors.verticalResize,
          pointerEvents: "auto",
          userSelect: "none",
          keyboardFocusDim: false,
          focusVisible: disabled
            ? undefined
            : {
                outlineWidth: theme.design.shape.focusRingWidth,
                outlineColor: theme.colors.ring,
                outlineOffset: theme.design.shape.focusRingWidth,
              },
        },
        style
      )}
      onMouseDown={pad.handleMouseDown}
      onMouseMove={pad.handleMouseMove}
      onMouseUp={pad.handleMouseUp}
      onScroll={pad.handleScroll}
      onKeyDown={pad.handlePreEditKeyDown}
      onMouseEnter={info.onMouseEnter}
      onMouseLeave={info.onMouseLeave}
      onFocus={info.onFocus}
      onBlur={() => {
        info.onBlur()
        pad.handleBlur()
      }}
    >
      {labelMeasurement.sampleNodes}
      {valueMeasurement.sampleNodes}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width, height: unit, flexShrink: 0, pointerEvents: "none" }}>
      <text
        testId={testId ? `${testId}-label` : undefined}
        style={{
          pointerEvents: "none",
          color: theme.colors.mutedForeground,
          whiteSpace: "nowrap",
          width,
          textAlign: "center",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </text>
      </div>
      <div
        aria-hidden="true"
        style={{ position: "relative", width: diameter, height: diameter, flexShrink: 0, pointerEvents: "none" }}
      >
        {track ? (
          <Shape
            width={diameter}
            height={diameter}
            color={theme.colors.border}
            paths={[{ d: track, strokeWidth }]}
            style={{ position: "absolute", left: 0, top: 0 }}
          />
        ) : null}
        <Shape
          width={diameter}
          height={diameter}
          color={valueColor}
          paths={[
            ...(filled ? [{ d: filled, strokeWidth }] : []),
            { d: indicator, strokeWidth: indicatorWidth },
          ]}
          style={{ position: "absolute", left: 0, top: 0 }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width, height: unit, flexShrink: 0, pointerEvents: "none" }}>
      <text
        testId={testId ? `${testId}-value` : undefined}
        style={{
          pointerEvents: "none",
          fontFamily: theme.design.typography.numberFontFamily,
          whiteSpace: "nowrap",
          width,
          textAlign: "center",
          textOverflow: "ellipsis",
        }}
      >
        {pad.display}
      </text>
      </div>
    </div>
  )
}
