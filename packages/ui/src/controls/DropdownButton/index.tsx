/**
 * DropdownButton — 和 DragPad 同风格、同尺寸的点开下拉按钮。
 *
 * 菜单项支持三种 item：
 *   - normal   `{ id, label, shortcut?, disabled?, onSelect? }`
 *   - heading  `{ type: "heading", id, label }`         分组标题（不可点）
 *   - separator `{ type: "separator", id }`             分隔线
 *
 * 行走 `rowInteractiveClasses`：`min-h-7` 允许内容换行，不再强截断；
 * shortcut 右对齐，灰色辅助色；heading 大写小字 muted-foreground。
 *
 * 定位 props：`align / side / sideOffset / matchTriggerWidth`。
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#components/dropdown-menu";
import { useInfoBinding } from "../DragPad/useInfoBinding";
import { MappingOverlay } from "../MappingOverlay";
import { IconSlot } from "../IconSlot/index";
import { controlInteractiveClasses, rowInteractiveClasses } from "../classes";
import { AutoWidthText } from "../DragPad/AutoWidthText";

export interface DropdownButtonValueItem<T extends string = string> {
  id: T;
  label: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  /** 右侧键盘快捷键展示（纯显示，不绑定热键） */
  shortcut?: string;
}

export type DropdownButtonItem<T extends string = string> =
  | DropdownButtonValueItem<T>
  | { type: "heading"; id: string; label: ReactNode }
  | { type: "separator"; id: string };

function isHeading<T extends string>(
  item: DropdownButtonItem<T>,
): item is { type: "heading"; id: string; label: ReactNode } {
  return "type" in item && item.type === "heading";
}

function isSeparator<T extends string>(
  item: DropdownButtonItem<T>,
): item is { type: "separator"; id: string } {
  return "type" in item && item.type === "separator";
}

export interface DropdownButtonProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  items: DropdownButtonItem<T>[];
  label: string;
  description?: string;
  /** 按钮内显示的文字，默认取当前 value item 的 label */
  renderValue?: (item: DropdownButtonValueItem<T> | undefined) => ReactNode;
  color?: string;
  disabled?: boolean;
  mappable?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  matchTriggerWidth?: boolean;
  icon?: ReactNode;
  size?: "default" | "compact";
}

export function DropdownButton<T extends string = string>({
  value,
  onChange,
  items,
  label,
  description,
  renderValue,
  color,
  disabled = false,
  mappable = true,
  className,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  matchTriggerWidth = true,
  icon,
  size = "default",
}: DropdownButtonProps<T>) {
  const [open, setOpen] = useState(false);
  const currentValueItem = items.find(
    (item): item is DropdownButtonValueItem<T> =>
      !isHeading(item) && !isSeparator(item) && item.id === value,
  );
  const displayNode = renderValue
    ? renderValue(currentValueItem)
    : (currentValueItem?.label ?? value);
  const infoHandlers = useInfoBinding({ type: "dropdown", description });
  // 收集所有 value-item 的 label 字符串,交给 AutoWidthText 让浏览器实测宽度;
  // 不再 ch 猜,chrome 跟最宽那条标签走。
  const widestLabels: string[] = items
    .filter(
      (item): item is DropdownButtonValueItem<T> =>
        !isHeading(item) && !isSeparator(item),
    )
    .map((item) =>
      typeof item.label === "string" ? item.label : String(item.id),
    );
  const triggerStyle: CSSProperties | undefined = color
    ? ({ "--dragpad-color": color } as CSSProperties)
    : undefined;
  const contentClassName = matchTriggerWidth
    ? "min-w-[--radix-dropdown-menu-trigger-width] p-1"
    : "min-w-40 p-1";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        nativeButton
        disabled={disabled}
        render={
          <button
            type="button"
            style={triggerStyle}
            aria-label={label}
            data-mappable={mappable || undefined}
            {...infoHandlers}
            className={controlInteractiveClasses(
              { active: open, disabled, size },
              `justify-between gap-2 ${size === "compact" ? "pr-1" : "pr-2.5"} ${className ?? ""}`,
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-control-gap">
              {icon ? <IconSlot size={size}>{icon}</IconSlot> : null}
              <AutoWidthText samples={widestLabels} className="min-w-0 flex-1">
                {displayNode}
              </AutoWidthText>
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            <MappingOverlay mappable={mappable} disabled={disabled} />
          </button>
        }
      />
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={contentClassName}
      >
        {items.map((item) => {
          if (isHeading(item)) {
            return (
              <div
                key={item.id}
                className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {item.label}
              </div>
            );
          }
          if (isSeparator(item)) {
            return <DropdownMenuSeparator key={item.id} className="my-1" />;
          }
          return (
            <DropdownMenuItem
              key={item.id}
              disabled={item.disabled}
              data-active={item.id === value}
              onClick={() => {
                item.onSelect?.();
                onChange(item.id);
              }}
              className={rowInteractiveClasses(
                { active: item.id === value, disabled: item.disabled },
                "justify-between",
              )}
            >
              <span className="min-w-0 break-words">{item.label}</span>
              {item.shortcut ? (
                <span className="ml-3 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {item.shortcut}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
