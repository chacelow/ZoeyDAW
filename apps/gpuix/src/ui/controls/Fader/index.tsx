import { Fragment, useMemo } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { consumeKey } from "@/shared/keyboard"
import { Shape } from "@/shared/svg/Shape"
import { polygonPath } from "@/shared/svg/paths"
import { useDragPad } from "../DragPad/useDragPad"
import { formatNumericValue } from "../DragPad/numberModel"
import { useInfoBinding } from "../ControlEnvironment"
import { LevelMeter, meterPosition } from "../LevelMeter"
import { PeakReadout } from "../LevelMeter/PeakReadout"
import { snapControlWidth } from "../grid"
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
  ticks: providedTicks,
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
  const meterGeometry = theme.design.editor.meter
  const { scale } = meterGeometry
  const floorDb = scale[scale.length - 1]?.db ?? options.min
  const ticks = useMemo(
    () =>
      providedTicks ??
      scale
        .filter(point => point.db >= options.min && point.position < 1)
        .map(point => ({ value: point.db, label: String(Math.abs(point.db)) })),
    [providedTicks, scale, options.min]
  )
  const readoutHeight = meter?.variant === "mixer" ? meterGeometry.readoutHeightUnits * unit : 0
  const barsTop = readoutHeight ? readoutHeight + meterGeometry.readoutGap : 0
  const travel = length - unit - barsTop
  const showTicks = travel >= meterGeometry.ticksMinHeightUnits * unit && ticks.length > 0
  const scaleWidth = showTicks ? geometry.scaleWidthUnits * unit : 0
  const tickSpace = showTicks ? meterGeometry.tickWidth + meterGeometry.tickGap : 0
  const width = snapControlWidth(
    handleWidth + handleGap + tickSpace + meterWidth + scaleWidth,
    unit
  )
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
  const position = barsTop + meterPosition(options.value, scale) * travel
  const visibleTicks = useMemo(
    () =>
      showTicks
        ? visibleFaderTicks(ticks, {
            min: options.min,
            max: options.max,
            scale,
            travel,
            lineHeight: unit,
          })
        : [],
    [showTicks, ticks, options.min, options.max, scale, travel, unit]
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
          width,
          height: length,
          flexShrink: 0,
          pointerEvents: "auto",
          userSelect: "none",
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
      {meter?.variant === "mixer" ? (
        <PeakReadout
          channels={meter.channels}
          minDb={meter.minDb}
          label={meter["aria-label"] ?? label}
          testId={testId ? `${testId}-readout` : undefined}
          style={{ position: "absolute", top: 0, left: 0, width, height: readoutHeight }}
        />
      ) : null}
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
          top: barsTop + unit / 2,
          left: handleWidth + handleGap + tickSpace,
          width: meterWidth,
          height: travel,
          pointerEvents: "none",
        }}
      >
        <LevelMeter
          {...meter}
          variant="inline"
          minDb={meter?.minDb ?? floorDb}
          maxDb={meter?.maxDb ?? options.max}
          channels={
            meter?.channels ?? [
              { rmsDb: floorDb, peakDb: floorDb, holdDb: floorDb },
              { rmsDb: floorDb, peakDb: floorDb, holdDb: floorDb },
            ]
          }
          width={meterWidth}
          height={travel}
        />
      </div>
      {visibleTicks.map(tick => (
        <Fragment key={tick.value}>
          <div
            testId={testId ? `${testId}-tick-${tick.value}` : undefined}
            aria-hidden="true"
            style={{
              position: "absolute",
              top: barsTop + meterPosition(tick.value, scale) * travel,
              left: handleWidth + handleGap + tickSpace + meterWidth,
              width: scaleWidth,
              height: unit,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              color: theme.colors.mutedForeground,
              fontSize: theme.control["--text-control-track"],
              fontFamily: theme.design.typography.numberFontFamily,
            }}
          >
            <text style={{ pointerEvents: "none" }}>{tick.label.replace(/^[-−]/, "")}</text>
          </div>
          <div
            testId={testId ? `${testId}-dash-${tick.value}` : undefined}
            aria-hidden="true"
            style={{
              position: "absolute",
              pointerEvents: "none",
              top: barsTop + unit / 2 + meterPosition(tick.value, scale) * travel,
              left: handleWidth + handleGap,
              width: meterGeometry.tickWidth,
              height: meterGeometry.zeroWidth,
              backgroundColor: theme.colors.mutedForeground,
            }}
          />
        </Fragment>
      ))}
    </div>
  )
}
