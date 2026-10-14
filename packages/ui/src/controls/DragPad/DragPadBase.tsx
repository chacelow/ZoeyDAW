/**
 * DragPadBase — 所有 DragPad variant 共用的外壳。
 *
 * 样式走 `controlInteractiveClasses`，和 DropdownButton 一致。
 * `MappingOverlay` 作为最后一个子元素蓝圈 overlay，mapping 态下才渲染。
 */
import { forwardRef } from "react"
import { controlInteractiveClasses } from "../classes"
import { MappingOverlay } from "../MappingOverlay"
import type { CSSProperties, ReactNode } from "react"

export interface DragPadBaseProps {
  readonly dragging?: boolean
  readonly active?: boolean
  readonly disabled?: boolean
  readonly size?: "default" | "compact"
  readonly iconOnly?: boolean
  readonly color?: string
  /**
  可被 automation/MIDI/key 映射;mapping mode 打开时 overlay 高亮。默认 true。
  */
  readonly mappable?: boolean
  readonly className?: string
  readonly style?: CSSProperties
  readonly onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
  readonly onDoubleClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  readonly onPointerEnter?: () => void
  readonly onPointerLeave?: () => void
  readonly onFocus?: () => void
  readonly onBlur?: () => void
  readonly "aria-label"?: string
  readonly "aria-description"?: string
  readonly "aria-pressed"?: boolean
  readonly children: ReactNode
}

export const DragPadBase = forwardRef<HTMLButtonElement, DragPadBaseProps>(
  (
    {
      dragging = false,
      active = false,
      disabled = false,
      size = "default",
      iconOnly = false,
      color,
      mappable = true,
      className,
      style: userStyle,
      onPointerDown,
      onDoubleClick,
      onClick,
      onPointerEnter,
      onPointerLeave,
      onFocus,
      onBlur,
      "aria-label": ariaLabel,
      "aria-description": ariaDescription,
      "aria-pressed": ariaPressed,
      children,
    },
    reference
  ) => {
    const style: CSSProperties = {
      ...(color && ({ "--dragpad-color": color } as CSSProperties)),
      ...userStyle,
    }

    return (
      <button
        ref={reference}
        type="button"
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        style={style}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-description={ariaDescription}
        aria-pressed={ariaPressed}
        data-mappable={mappable || undefined}
        className={controlInteractiveClasses(
          { dragging, active, disabled, size, iconOnly },
          className
        )}
      >
        {children}
        <MappingOverlay mappable={mappable} disabled={disabled} />
      </button>
    )
  }
)
DragPadBase.displayName = "DragPadBase"
