import { useMemo } from "react"
import type { CSSProperties, ReactNode } from "react"
import { IconSlot } from "../../IconSlot/index"
import { AutoWidthText } from "../AutoWidthText"
import { DragPadBase } from "../DragPadBase"
import { EditInput } from "../EditInput"
import { formatNumericValue } from "../formatNumericValue"
import { useDragValue } from "../useDragValue"
import type { UseDragValueOptions } from "../useDragValue"
import { useInfoBinding } from "../useInfoBinding"
import { useInlineEdit } from "../useInlineEdit"

export interface KnobProps extends UseDragValueOptions {
  readonly label: string
  readonly description?: string
  readonly bipolar?: boolean
  readonly format?: (value: number) => string
  readonly parse?: (raw: string) => number
  readonly editable?: boolean
  readonly icon?: ReactNode
  readonly size?: "default" | "compact"
  readonly color?: string
  readonly active?: boolean
  readonly highlight?: boolean
  readonly className?: string
  readonly widthSamples?: string[]
}

export function Knob({
  label,
  description,
  bipolar = false,
  format,
  parse,
  editable = true,
  icon,
  size = "default",
  color = "var(--primary)",
  active = false,
  highlight = true,
  className,
  widthSamples = [],
  ...options
}: KnobProps) {
  const formatValue = useMemo(
    () => format ?? formatNumericValue(options.min, options.max, options.step),
    [format, options.min, options.max, options.step]
  )
  const edit = useInlineEdit({
    ...options,
    format: formatValue,
    parse,
    editable: editable && !options.readOnly,
  })
  const drag = useDragValue({
    ...options,
    keyboardAdjust: true,
    attached: edit.state !== "editing",
    onClick: edit.beginPreEdit,
  })
  const info = useInfoBinding({
    type: bipolar ? "bipolar" : "number",
    description,
    dragging: drag.dragging,
  })
  const fraction =
    options.max === options.min
      ? 0
      : Math.max(0, Math.min(1, (options.value - options.min) / (options.max - options.min)))
  const zero =
    options.max === options.min
      ? 0
      : Math.max(0, Math.min(1, -options.min / (options.max - options.min)))
  const angle = fraction * 270
  const start = bipolar ? Math.min(zero * 270, angle) : 0
  const end = bipolar ? Math.max(zero * 270, angle) : angle
  const samples = [
    formatValue(options.min),
    formatValue(options.max),
    formatValue(0),
    ...widthSamples,
  ]
  const style: CSSProperties & { "--dragpad-color": string } = { "--dragpad-color": color }
  const dial = (
    <span
      aria-hidden
      className={
        size === "compact"
          ? "size-control-icon-compact relative shrink-0"
          : "size-control-icon-slot relative shrink-0"
      }
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 225deg, transparent 0deg ${start}deg, ${active ? "currentColor" : color} ${start}deg ${end}deg, transparent ${end}deg 360deg), conic-gradient(from 225deg, var(--border) 0deg 270deg, transparent 270deg 360deg)`,
          maskImage: "radial-gradient(circle, transparent 48%, black 52%)",
        }}
      />
      <span className="bg-background/60 absolute inset-[22%] rounded-full" />
      <span className="absolute inset-[18%]" style={{ transform: `rotate(${angle - 135}deg)` }}>
        <span className="absolute top-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-current" />
      </span>
    </span>
  )
  const leading = (
    <span className="gap-control-gap flex items-center">
      {dial}
      {icon ? <IconSlot size={size}>{icon}</IconSlot> : null}
    </span>
  )
  const raw = edit.draft.trim()
  const invalid =
    edit.state === "editing" &&
    (!raw || !Number.isFinite(parse ? parse(raw) : Number.parseFloat(raw)))
  if (edit.state === "editing") {
    return (
      <EditInput
        ref={edit.inputRef}
        value={edit.draft}
        onChange={edit.setDraft}
        onCommit={edit.commit}
        onCancel={edit.cancel}
        aria-label={label}
        leading={leading}
        size={size}
        samples={samples}
        style={style}
        active={active}
        highlight={highlight}
        invalid={invalid}
        className={["gap-control-gap", invalid ? "border-destructive" : "", className]
          .filter(Boolean)
          .join(" ")}
      />
    )
  }
  return (
    <DragPadBase
      ref={drag.ref}
      dragging={drag.dragging}
      disabled={options.disabled}
      readOnly={options.readOnly}
      active={active}
      highlight={highlight}
      color={color}
      size={size}
      className={[
        "gap-control-gap focus-visible:outline-ring focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-1px]",
        edit.state === "preEdit" ? "ring-ring ring-1 ring-inset" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={drag.handlePointerDown}
      onClick={drag.handleClick}
      onDoubleClick={event => {
        drag.handleDoubleClick(event)
        edit.resetPreEdit()
      }}
      role="slider"
      aria-label={label}
      aria-valuemin={options.min}
      aria-valuemax={options.max}
      aria-valuenow={options.value}
      aria-valuetext={formatValue(options.value)}
      {...info}
      onBlur={() => {
        info.onBlur()
        edit.cancel()
      }}
    >
      {leading}
      <AutoWidthText samples={samples}>{formatValue(options.value)}</AutoWidthText>
    </DragPadBase>
  )
}
