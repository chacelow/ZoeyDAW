/**
 * DragPadNumber — 纯数字 DragPad。
 *
 * 宽度由 `AutoWidthText` 的 ghost 样本(浏览器实测)锁定,不再 ch 猜算。
 * 三交互 + inline edit 三态(idle / preEdit / editing)继承 hook 实现。
 */
import { useMemo, type ReactNode } from "react";
import { AutoWidthText } from "../AutoWidthText";
import { DragPadBase } from "../DragPadBase";
import { IconSlot } from "#components/controls/IconSlot/index";
import { EditInput } from "../EditInput";
import { useDragValue, type UseDragValueOptions } from "../useDragValue";
import { useInfoBinding } from "../useInfoBinding";
import { useInlineEdit } from "../useInlineEdit";
import { formatNumericValue } from "../formatNumericValue";

export interface DragPadNumberProps extends UseDragValueOptions {
  label: string;
  description?: string;
  format?: (value: number) => string;
  color?: string;
  className?: string;
  editable?: boolean;
  parse?: (raw: string) => number;
  size?: "default" | "compact";
  widthSamples?: string[];
  icon?: ReactNode;
}

export function DragPadNumber({
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
}: DragPadNumberProps) {
  const toStr = useMemo(
    () =>
      format ??
      formatNumericValue(dragOptions.min, dragOptions.max, dragOptions.step),
    [format, dragOptions.min, dragOptions.max, dragOptions.step],
  );
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
    format: toStr,
    parse,
    editable,
    disabled: dragOptions.disabled,
    onGestureStart: dragOptions.onGestureStart,
    onGestureEnd: dragOptions.onGestureEnd,
    onGestureCancel: dragOptions.onGestureCancel,
  });

  const { dragging, handlePointerDown, handleClick, handleDoubleClick, ref } =
    useDragValue({
      ...dragOptions,
      attached: editState !== "editing",
      onClick: beginPreEdit,
    });

  const display = toStr(dragOptions.value);
  const samples = [
    toStr(dragOptions.min),
    toStr(dragOptions.max),
    ...widthSamples,
  ];

  const infoHandlers = useInfoBinding({
    type: "number",
    description,
    dragging,
  });

  if (editState === "editing") {
    return (
      <EditInput
        ref={inputRef}
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        onCancel={cancel}
        aria-label={label}
        className={className}
        size={size}
        icon={icon}
        samples={samples}
      />
    );
  }

  const mergedClass = [
    icon ? "gap-control-gap" : "",
    editState === "preEdit" ? "ring-1 ring-inset ring-ring" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <DragPadBase
      ref={ref}
      dragging={dragging}
      disabled={dragOptions.disabled}
      color={color}
      size={size}
      className={mergedClass}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={(event) => {
        handleDoubleClick(event);
        resetPreEdit();
      }}
      aria-label={label}
      {...infoHandlers}
      onBlur={() => {
        infoHandlers.onBlur();
        cancel();
      }}
    >
      {icon ? <IconSlot size={size}>{icon}</IconSlot> : null}
      <AutoWidthText samples={samples}>{display}</AutoWidthText>
    </DragPadBase>
  );
}
