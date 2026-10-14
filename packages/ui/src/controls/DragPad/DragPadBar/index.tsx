/**
 * DragPadBar — 0 → max 单向填充 + 中央数字,宽度由 ghost sizer 实测锁定。
 */
import { useMemo } from "react"
import { IconSlot } from "#components/controls/IconSlot/index"
import { AutoWidthText } from "../AutoWidthText"
import { DragPadBase } from "../DragPadBase"
import { EditInput } from "../EditInput"
import { useDragValue } from "../useDragValue"
import { useInfoBinding } from "../useInfoBinding"
import { useInlineEdit } from "../useInlineEdit"
import { formatNumericValue } from "../formatNumericValue"
import type { UseDragValueOptions } from "../useDragValue"
import type { ReactNode } from "react"

export interface DragPadBarProps extends UseDragValueOptions {
  readonly label: string
  readonly description?: string
  readonly format?: (value: number) => string
  readonly color?: string
  readonly className?: string
  readonly editable?: boolean
  readonly parse?: (raw: string) => number
  readonly icon?: ReactNode
  readonly size?: "default" | "compact"
  readonly widthSamples?: string[]
}

export function DragPadBar({
  label,
  description,
  format,
  color,
  className,
  editable = true,
  parse,
  icon,
  size = "default",
  widthSamples = [],
  ...dragOptions
}: DragPadBarProps) {
  const toString_ = useMemo(() => {
    return format ?? formatNumericValue(dragOptions.min, dragOptions.max, dragOptions.step)
  }, [format, dragOptions.min, dragOptions.max, dragOptions.step])
  const {
    state: editState,
    draft,
    setDraft,
    beginPreEdit,
    resetPreEdit,
    commit,
    cancel,
    inputRef,
  } = useInlineEdit({
    value: dragOptions.value,
    onChange: dragOptions.onChange,
    min: dragOptions.min,
    max: dragOptions.max,
    step: dragOptions.step,
    format: toString_,
    parse,
    editable,
    disabled: dragOptions.disabled,
    onGestureStart: dragOptions.onGestureStart,
    onGestureEnd: dragOptions.onGestureEnd,
    onGestureCancel: dragOptions.onGestureCancel,
  })

  const { dragging, handlePointerDown, handleClick, handleDoubleClick, ref } = useDragValue({
    ...dragOptions,
    attached: editState !== "editing",
    onClick: beginPreEdit,
  })

  const display = toString_(dragOptions.value)
  const samples = [toString_(dragOptions.min), toString_(dragOptions.max), ...widthSamples]
  const normalized = Math.max(
    0,
    Math.min(1, (dragOptions.value - dragOptions.min) / (dragOptions.max - dragOptions.min))
  )
  const infoHandlers = useInfoBinding({
    type: "bar",
    description,
    dragging,
  })

  if (editState === "editing") {
    return (
      <EditInput
        ref={inputRef}
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        onCancel={cancel}
        aria-label={label}
        size={size}
        className={className}
        icon={icon}
        samples={samples}
      />
    )
  }

  const mergedClass = [
    icon ? "gap-control-gap" : "",
    editState === "preEdit" ? "ring-1 ring-inset ring-ring" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <DragPadBase
      ref={ref}
      dragging={dragging}
      disabled={dragOptions.disabled}
      size={size}
      color={color}
      className={mergedClass}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={event => {
        handleDoubleClick(event)
        resetPreEdit()
      }}
      aria-label={label}
      {...infoHandlers}
      onBlur={() => {
        infoHandlers.onBlur()
        cancel()
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <span
          className="absolute inset-y-0 left-0 bg-[color:var(--dragpad-color,var(--primary))] opacity-30"
          style={{ width: `${normalized * 100}%` }}
        />
      </span>
      {icon ? <IconSlot size={size}>{icon}</IconSlot> : null}
      <span className="relative z-10">
        <AutoWidthText samples={samples}>{display}</AutoWidthText>
      </span>
    </DragPadBase>
  )
}
