/**
 * DragPadToggle — 点击开关的 DragPad。
 *
 * 适合 Mute / Solo / Record Arm / Link / Loop / Follow 等二态开关。
 * 不进 pointer lock，不响应拖动，纯点击翻转。
 * active 时底色切 `--primary`，和其它拖拉 variant 的 drag 亮色一致。
 *
 * 显示优先级：传了 `icon` 就渲染 icon；否则渲染 `labelOn`/`labelOff` 文字。
 */
import { useCallback } from "react"
import { IconSlot } from "#components/controls/IconSlot/index"
import { AutoWidthText } from "../AutoWidthText"
import { DragPadBase } from "../DragPadBase"
import { useInfoBinding } from "../useInfoBinding"
import type { ReactNode } from "react"

export interface DragPadToggleProps {
  readonly value: boolean
  readonly onChange: (value: boolean) => void
  readonly label: string
  readonly description?: string
  /**
  开时文字，默认 "ON"；传 `icon` 时忽略
  */
  readonly labelOn?: string
  /**
  关时文字，默认 "OFF"；传 `icon` 时忽略
  */
  readonly labelOff?: string
  /**
  直接渲染一个图标 / 任意 node，取代文字；通常传 `<Repeat className="size-5" />`
  */
  readonly icon?: ReactNode
  readonly color?: string
  readonly disabled?: boolean
  readonly mappable?: boolean
  readonly className?: string
  readonly size?: "default" | "compact"
}

export function DragPadToggle({
  value,
  onChange,
  label,
  description,
  labelOn = "ON",
  labelOff = "OFF",
  icon,
  color,
  disabled = false,
  mappable = true,
  className,
  size = "default",
}: DragPadToggleProps) {
  const textDisplay = value ? labelOn : labelOff
  const infoHandlers = useInfoBinding({
    type: "toggle",
    description,
  })

  const handleClick = useCallback(() => {
    if (!disabled) {
      onChange(!value)
    }
  }, [disabled, onChange, value])

  return (
    <DragPadBase
      active={value}
      disabled={disabled}
      color={color}
      mappable={mappable}
      size={size}
      iconOnly={Boolean(icon)}
      className={className}
      onClick={handleClick}
      aria-label={label}
      aria-pressed={value}
      {...infoHandlers}
    >
      {icon ? (
        <IconSlot size={size} className="relative z-10">
          {icon}
        </IconSlot>
      ) : (
        <span className="relative z-10">
          <AutoWidthText samples={[labelOn, labelOff]}>{textDisplay}</AutoWidthText>
        </span>
      )}
    </DragPadBase>
  )
}
