/**
 * EditInput — DragPad* 的编辑态外壳。
 *
 * **视觉完全等同 idle**:复用 chrome,不加 ring 不换色;icon 常驻;**宽度由
 * `samples` 的 ghost 文本实测锁定**(浏览器 text layout),0 ch 猜算。
 */
import { forwardRef } from "react"
import { IconSlot } from "../IconSlot/index"
import { controlInteractiveClasses } from "../classes"
import { useInfoBinding } from "./useInfoBinding"
import type { CSSProperties, ReactNode } from "react"

export interface EditInputProps {
  readonly value: string
  readonly onChange: (next: string) => void
  readonly onCommit: () => void
  readonly onCancel: () => void
  readonly "aria-label": string
  readonly className?: string
  readonly style?: CSSProperties
  readonly icon?: ReactNode
  readonly leading?: ReactNode
  readonly size?: "default" | "compact"
  readonly invalid?: boolean
  readonly active?: boolean
  readonly highlight?: boolean
  /**
  决定 chrome 宽度的 ghost 文本样本(通常传 `[format(min), format(max)]`)。
  */
  readonly samples: string[]
}

export const EditInput = forwardRef<HTMLInputElement, EditInputProps>(
  (
    {
      value,
      onChange,
      onCommit,
      onCancel,
      "aria-label": ariaLabel,
      className,
      style,
      icon,
      leading,
      size = "default",
      invalid = false,
      active = false,
      highlight = false,
      samples,
    },
    reference
  ) => {
    const infoHandlers = useInfoBinding({ type: "number" })
    const mergedClass = [icon || leading ? "gap-control-gap" : "", "cursor-text", className ?? ""]
      .filter(Boolean)
      .join(" ")
    return (
      <div
        style={style}
        {...infoHandlers}
        className={controlInteractiveClasses({ active, highlight, size }, mergedClass)}
      >
        {leading ?? (icon ? <IconSlot size={size}>{icon}</IconSlot> : null)}
        <span className="relative inline-grid items-center justify-center">
          {samples.map((s, index) => (
            <span
              key={index}
              aria-hidden
              className="invisible col-start-1 row-start-1 whitespace-pre tabular-nums"
            >
              {s}
            </span>
          ))}
          <input
            ref={reference}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault()
                onCommit()
              } else if (e.key === "Escape") {
                e.preventDefault()
                onCancel()
              }
            }}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            className={
              size === "compact"
                ? "text-control-compact absolute inset-0 w-full min-w-0 bg-transparent text-center leading-none text-current tabular-nums outline-hidden"
                : "text-control absolute inset-0 w-full min-w-0 bg-transparent text-center leading-none text-current tabular-nums outline-hidden"
            }
          />
        </span>
      </div>
    )
  }
)
EditInput.displayName = "EditInput"
