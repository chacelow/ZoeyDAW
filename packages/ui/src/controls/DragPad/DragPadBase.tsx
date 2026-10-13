/**
 * DragPadBase — 所有 DragPad variant 共用的外壳。
 *
 * 样式走 `controlInteractiveClasses`，和 DropdownButton 一致。
 * `MappingOverlay` 作为最后一个子元素蓝圈 overlay，mapping 态下才渲染。
 */
import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { controlInteractiveClasses } from "../classes";
import { MappingOverlay } from "../MappingOverlay";

export interface DragPadBaseProps {
  dragging?: boolean;
  active?: boolean;
  disabled?: boolean;
  size?: "default" | "compact";
  iconOnly?: boolean;
  color?: string;
  /** 可被 automation/MIDI/key 映射;mapping mode 打开时 overlay 高亮。默认 true。 */
  mappable?: boolean;
  className?: string;
  style?: CSSProperties;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  "aria-label"?: string;
  "aria-description"?: string;
  "aria-pressed"?: boolean;
  children: ReactNode;
}

export const DragPadBase = forwardRef<HTMLButtonElement, DragPadBaseProps>(
  function DragPadBase(
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
    ref,
  ) {
    const style: CSSProperties = {
      ...(color ? ({ "--dragpad-color": color } as CSSProperties) : {}),
      ...userStyle,
    };

    return (
      <button
        ref={ref}
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
          className,
        )}
      >
        {children}
        <MappingOverlay mappable={mappable} disabled={disabled} />
      </button>
    );
  },
);
