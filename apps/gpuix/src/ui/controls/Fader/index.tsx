import { useMemo } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { consumeKey } from "@/shared/keyboard"
import { Shape } from "@/shared/svg/Shape"
import { polygonPath } from "@/shared/svg/paths"
import { useDragPad } from "../DragPad/useDragPad"
import { formatNumericValue } from "../DragPad/numberModel"
import { useInfoBinding } from "../ControlEnvironment"
import { LevelMeter } from "../LevelMeter"
import { visibleFaderTicks } from "./ticks"
import type { FaderTick } from "./ticks"
import type { Props } from "@gpuix/react"
import type { UseDragPadOptions } from "../DragPad/useDragPad"
import type { LevelMeterProps } from "../LevelMeter"

export interface FaderProps extends Omit<UseDragPadOptions, "format" | "parse" | "editable"> {
  readonly label: string
  readonly format?: (value: number) => string
  readonly ticks?: readonly FaderTick[]
  readonly meter?: Omit<LevelMeterProps, "height" | "width">
  readonly invalid?: boolean
  readonly testId?: string
  readonly style?: Props["style"]
}

export function Fader({
  label,
  format,
  ticks = [],
  meter,
  invalid = false,
  testId,
  style,
  ...options
}: FaderProps) {
  const theme = useTheme()
  const unit = theme.control["--spacing-control-track"]
  const geometry = theme.design.fader
  const length = geometry.lengthUnits * unit
  const handleWidth = geometry.handleWidthUnits * unit
  const handleGap = geometry.handleGapUnits * unit
  const meterWidth = geometry.meterWidthUnits * unit
  const scaleWidth = ticks.length ? geometry.scaleWidthUnits * unit : 0
  const travel = length - unit
  const triangleWidth = unit * geometry.triangleWidthRatio
  const triangleHeight = unit * geometry.triangleHeightRatio
  const triangle = useMemo(
    () =>
      polygonPath([
        { x: 0, y: 0 },
        { x: triangleWidth, y: triangleHeight / 2 },
        { x: 0, y: triangleHeight },
      ]),
    [triangleWidth, triangleHeight]
  )
  const toText = useMemo(
    () => format ?? formatNumericValue(options.min, options.max, options.step),
    [format, options.min, options.max, options.step]
  )
  const pad = useDragPad({ ...options, format: toText, editable: false })
  const info = useInfoBinding({ type: "bar", dragging: pad.dragging })
  const normalized = (value: number) =>
    options.max === options.min
      ? 0
      : Math.max(0, Math.min(1, (value - options.min) / (options.max - options.min)))
  const position = (1 - normalized(options.value)) * travel
  const visibleTicks = useMemo(
    () =>
      visibleFaderTicks(ticks, { min: options.min, max: options.max, travel, lineHeight: unit }),
    [ticks, options.min, options.max, travel, unit]
  )
  return (
    <div
      testId={testId}
      role="slider"
      tabIndex={options.disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={options.min}
      aria-valuemax={options.max}
      aria-valuenow={options.value}
      aria-valuetext={pad.display}
      aria-orientation="vertical"
      aria-disabled={options.disabled}
      aria-invalid={invalid}
      style={sx(
        {
          position: "relative",
          width: handleWidth + handleGap + meterWidth + scaleWidth,
          height: length,
          flexShrink: 0,
          pointerEvents: "auto",
          opacity: options.disabled ? theme.design.states.disabledOpacity : 1,
          cursor: options.disabled
            ? theme.design.cursors.disabled
            : theme.design.cursors.verticalResize,
          keyboardFocusDim: false,
          focusVisible: {
            outlineColor: theme.colors.ring,
            outlineWidth: theme.design.shape.focusRingWidth,
            outlineOffset: theme.design.shape.focusRingWidth,
          },
        },
        style
      )}
      onMouseDown={pad.handleMouseDown}
      onMouseMove={pad.handleMouseMove}
      onMouseUp={pad.handleMouseUp}
      onScroll={pad.handleScroll}
      onKeyDown={event => {
        if (options.disabled) return
        if (event.key === "home" || event.key === "end") {
          options.onGestureStart?.()
          options.onChange(event.key === "home" ? options.min : options.max)
          options.onGestureEnd?.()
          consumeKey(event, "handled")
        } else pad.handlePreEditKeyDown(event)
      }}
      onMouseEnter={info.onMouseEnter}
      onMouseLeave={info.onMouseLeave}
      onFocus={info.onFocus}
      onBlur={() => {
        info.onBlur()
        pad.handleBlur()
      }}
    >
      <div
        testId={testId ? `${testId}-thumb` : undefined}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: position,
          left: 0,
          width: handleWidth,
          height: unit,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <Shape
          width={triangleWidth}
          height={triangleHeight}
          color={invalid ? theme.colors.destructive : theme.colors.foreground}
          paths={[{ d: triangle, fill: true }]}
          style={{ pointerEvents: "none" }}
        />
      </div>
      <div
        testId={testId ? `${testId}-meter-area` : undefined}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: unit / 2,
          left: handleWidth + handleGap,
          width: meterWidth,
          height: travel,
          pointerEvents: "none",
        }}
      >
        <LevelMeter
          {...meter}
          minDb={meter?.minDb ?? options.min}
          maxDb={meter?.maxDb ?? options.max}
          channels={
            meter?.channels ?? [
              { db: options.min, peakDb: options.min },
              { db: options.min, peakDb: options.min },
            ]
          }
          width={meterWidth}
          height={travel}
        />
      </div>
      {visibleTicks.map(tick => (
        <text
          key={tick.value}
          testId={testId ? `${testId}-tick-${tick.value}` : undefined}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: (1 - normalized(tick.value)) * travel,
            left: handleWidth + handleGap + meterWidth,
            width: scaleWidth,
            height: unit,
            pointerEvents: "none",
            color: theme.colors.mutedForeground,
            fontSize: theme.control["--text-control-track"],
            fontFamily: theme.design.typography.numberFontFamily,
          }}
        >
          {tick.label}
        </text>
      ))}
    </div>
  )
}
