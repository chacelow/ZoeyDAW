/**
 * PopupButton — 同尺寸、同风格的"点开弹出任意内容"按钮。
 *
 * 和 DropdownButton 分工：
 *   - DropdownButton：装菜单项列表（选一个值，关闭）
 *   - PopupButton：装任意 UI（迷你 knob 组、键盘图、色板、形状编辑...）
 *
 * 关键：拖动内嵌 DragPad 时**不能关闭 popup**。
 * 真因：DragPad 松手时 `setCursorPosition` warp 产生合成 pointer 事件 →
 *       base-ui Popover 的 outside-dismiss 把它判为外点 → 调 `onOpenChange(false)`。
 *       close 事件在时序上**晚于** `dragpad-dragging` class 移除，瞬时检查 class
 *       不够。改成全局 pointerup 时若 drag class 在就设 500ms grace，期间 close 丢弃。
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Popover, PopoverContent, PopoverTrigger } from "#components/popover";
import { useInfoBinding } from "../DragPad/useInfoBinding";
import { MappingOverlay } from "../MappingOverlay";
import { controlInteractiveClasses } from "../classes";

export interface PopupButtonProps {
  /** 按钮内显示的内容（通常是当前值的紧凑表示） */
  trigger: ReactNode;
  /** popup 内任意 UI */
  children: ReactNode;
  label: string;
  description?: string;
  color?: string;
  disabled?: boolean;
  mappable?: boolean;
  className?: string;
  size?: "default" | "compact";
  contentClassName?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** close grace window (ms) after any DragPad drag ends. 默认 500。 */
  closeGraceMs?: number;
}

export function PopupButton({
  trigger,
  children,
  label,
  description,
  color,
  disabled = false,
  mappable = true,
  className,
  contentClassName,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  open: openProp,
  onOpenChange,
  closeGraceMs = 500,
  size = "default",
}: PopupButtonProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const graceUntilRef = useRef(0);

  useEffect(() => {
    const handler = () => {
      if (document.documentElement.classList.contains("dragpad-dragging")) {
        graceUntilRef.current = Date.now() + closeGraceMs;
      }
    };
    document.addEventListener("pointerup", handler, true);
    document.addEventListener("pointercancel", handler, true);
    return () => {
      document.removeEventListener("pointerup", handler, true);
      document.removeEventListener("pointercancel", handler, true);
    };
  }, [closeGraceMs]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // 1) drag class 还在：直接拦
      if (
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dragpad-dragging")
      ) {
        return;
      }
      // 2) class 刚移除、还在 grace window 内：也拦
      if (Date.now() < graceUntilRef.current) return;
    }
    if (onOpenChange) onOpenChange(next);
    else setOpenInternal(next);
  };

  const infoHandlers = useInfoBinding({ type: "popup", description });
  const style = color
    ? ({ "--dragpad-color": color } as CSSProperties)
    : undefined;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        nativeButton
        disabled={disabled}
        render={
          <button
            type="button"
            style={style}
            aria-label={label}
            data-mappable={mappable || undefined}
            {...infoHandlers}
            className={controlInteractiveClasses(
              { active: open, disabled, size },
              className,
            )}
          >
            <span className="truncate">{trigger}</span>
            <MappingOverlay mappable={mappable} disabled={disabled} />
          </button>
        }
      />
      <PopoverContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={contentClassName}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
