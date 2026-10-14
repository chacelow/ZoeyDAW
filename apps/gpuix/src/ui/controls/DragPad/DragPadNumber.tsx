import { useMemo } from "react"
import { useTheme } from "../../../shared/theme/ThemeProvider"
import { sv, sx } from "../../../shared/theme/style"
import { controlChrome } from "../chrome"
import { useInfoBinding } from "../ControlEnvironment"
import { DragPadIcon } from "./icon"
import { formatNumericValue } from "./numberModel"
import { useDragPad } from "./useDragPad"
import { useMeasuredTextWidth } from "../useMeasuredTextWidth"
import type { Props } from "@gpuix/react"
import type { ReactNode } from "react"
import type { UseDragPadOptions } from "./useDragPad"
import type { ControlSize } from "../chrome"

export interface DragPadNumberProps extends Omit<UseDragPadOptions, "format"> {
  readonly label: string
  readonly description?: string
  readonly format?: (value: number) => string
  readonly variant?: ControlSize
  readonly size?: ControlSize
  readonly icon?: ReactNode
  readonly hideIcon?: boolean
  readonly testId?: string
  readonly widthSamples?: readonly string[]
  readonly color?: string
  readonly highlight?: boolean
  readonly style?: Props["style"]
}

export function NumericPad({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  defaultValue,
  format,
  parse,
  disabled = false,
  editable = true,
  variant = "default",
  size = variant,
  icon,
  hideIcon = false,
  testId,
  widthSamples = [],
  color,
  highlight = true,
  style,
  onGestureStart,
  onGestureEnd,
  onGestureCancel,
  displayVariant = "number",
}: DragPadNumberProps & { readonly displayVariant?: "number" | "bar" | "bipolar" }) {
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
    defaultValue,
    disabled,
    editable,
    format: toText,
    parse,
    onGestureStart,
    onGestureEnd,
    onGestureCancel,
  })
  const info = useInfoBinding({ type: displayVariant, description, dragging: pad.dragging })
  const fontSize = metrics["--text-control-track"]
  const iconSize = metrics["--spacing-control-icon"]
  const iconGap = metrics["--spacing-control-gap"]
  const trackPad = metrics["--spacing-control-track-pad"]
  const samples = [
    toText(min),
    toText(max),
    ...(defaultValue === undefined ? [] : [toText(defaultValue)]),
    ...widthSamples,
  ]
  const measurement = useMeasuredTextWidth(samples, { fontSize, fontFamily: "Menlo" })
  const width = Math.ceil(
    measurement.width + (hideIcon ? 0 : iconSize + iconGap) + trackPad * 2 + 2
  )
  const innerWidth = width - 2
  const shell = sx(
    controlChrome(
      theme,
      size
    )({
      dragging: pad.dragging ? "on" : "off",
      disabled: disabled ? "on" : "off",
      highlight: highlight ? "on" : "off",
    }),
    {
      width,
      borderColor: pad.mode === "preEdit" ? theme.colors.ring : theme.colors.border,
      cursor: disabled ? "not-allowed" : pad.mode === "idle" ? "ns-resize" : "text",
      overflow: "hidden",
    },
    style
  )
  const normalized = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)))
  const bipolar =
    max === min ? 0 : Math.max(-1, Math.min(1, value / Math.max(Math.abs(min), Math.abs(max))))
  const fill = sv({
    base: {
      position: "absolute",
      top: 0,
      bottom: 0,
      backgroundColor: color ?? theme.colors.primary,
      opacity: 0.3,
      pointerEvents: "none",
    },
    variants: {
      display: {
        number: { width: 0 },
        bar: { left: 0, width: normalized * innerWidth },
        bipolar: {
          left: bipolar >= 0 ? innerWidth / 2 : ((1 + bipolar) * innerWidth) / 2,
          width: (Math.abs(bipolar) * innerWidth) / 2,
        },
      },
    },
  })
  const iconNode = icon ?? <DragPadIcon size={iconSize} color={theme.colors.mutedForeground} />
  const contents = (
    <>
      {measurement.sampleNodes}
      <div
        aria-hidden="true"
        testId={testId ? `${testId}-fill` : undefined}
        style={fill({ display: displayVariant })}
      />
      {displayVariant === "bipolar" ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: innerWidth / 2,
            top: 2,
            bottom: 2,
            width: 1,
            backgroundColor: theme.colors.border,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {hideIcon ? (
        pad.mode !== "idle" ? (
          <div
            aria-hidden="true"
            testId={testId ? `${testId}-edit-indicator` : undefined}
            style={{
              position: "absolute",
              left: 0,
              top: trackPad,
              bottom: trackPad,
              width: 1,
              backgroundColor: theme.colors.foreground,
              pointerEvents: "none",
            }}
          />
        ) : null
      ) : (
        iconNode
      )}
      {pad.mode === "editing" ? (
        <input
          ref={info.ref}
          testId={testId ? `${testId}-value` : undefined}
          autoFocus
          aria-label={label}
          aria-disabled={disabled}
          value={pad.draft}
          onChange={event => pad.handleEditChange(event.value ?? "")}
          onSubmit={pad.commitEditing}
          onBlur={pad.commitEditing}
          onKeyDown={pad.handleEditKeyDown}
          style={{
            flexGrow: 1,
            minWidth: 0,
            fontSize,
            fontFamily: "Menlo",
            color: theme.colors.foreground,
            textAlign: "center",
            cursor: "text",
          }}
        />
      ) : (
        <text
          testId={testId ? `${testId}-value` : undefined}
          style={{ fontSize, fontFamily: "Menlo", color: theme.colors.foreground }}
        >
          {pad.display}
        </text>
      )}
    </>
  )
  if (pad.mode === "editing")
    return (
      <div testId={testId} style={shell}>
        {contents}
      </div>
    )
  return (
    <div
      ref={info.ref}
      testId={testId}
      role="spinbutton"
      aria-label={description ? `${label} — ${description}` : label}
      aria-valuetext={pad.display}
      aria-disabled={disabled}
      tabIndex={0}
      style={shell}
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
      {contents}
    </div>
  )
}

export function DragPadNumber(props: DragPadNumberProps) {
  return <NumericPad {...props} />
}
