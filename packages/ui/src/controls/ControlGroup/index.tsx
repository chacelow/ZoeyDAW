/**
 * ControlGroup — 把 2-3 个相关控件("前中后"系列)包成一张外壳卡片。
 *
 * 外壳只有 `bg-muted` + `rounded-sm`,**不加 border**,和单体控件视觉完全同族;
 * 组和组之间的区分由父级 `gap` 负责,不要靠外轮廓。
 *
 * ## 分隔符
 *
 * `separator` 决定子控件之间的视觉分隔。不默认加任何分隔,因为不是每组都该加:
 *
 * - `"slash"` → `/` 文本。拍号 `4 / 4`(真分数记号)
 * - `"dot"`   → `.` 文本。位置 `1 . 1 . 1`(bar.beat.sixteenth)
 * - `"line"`  → 1px 竖线。真的需要视觉分区但不是算式的场景
 * - `"none"`  → 无(默认)
 *
 * `icon` prop:卡片最左侧 h-9 图标单元格。
 */
import { Children, type ReactNode } from "react";
import { IconSlot } from "../IconSlot/index";
import { cn } from "#lib/utils";

export type ControlGroupSeparator = "slash" | "dot" | "line" | "none";

export interface ControlGroupProps {
  children: ReactNode;
  label?: string;
  className?: string;
  icon?: ReactNode;
  separator?: ControlGroupSeparator;
}

export function ControlGroup({
  children,
  label,
  className,
  icon,
  separator = "none",
}: ControlGroupProps) {
  const items = Children.toArray(children).filter(Boolean);

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-sm bg-muted",
        "[&>*]:rounded-none",
        className,
      )}
    >
      {icon ? (
        <IconSlot className="size-control-h bg-muted text-muted-foreground">
          {icon}
        </IconSlot>
      ) : null}
      {items.flatMap((child, i) =>
        i === 0 ? [child] : [<Sep key={`sep-${i}`} kind={separator} />, child],
      )}
    </div>
  );
}

function Sep({ kind }: { kind: ControlGroupSeparator }) {
  if (kind === "none") return null;
  if (kind === "line")
    return (
      <span aria-hidden className="w-px shrink-0 self-stretch bg-border/60" />
    );
  const glyph = kind === "slash" ? "/" : ".";
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center bg-muted text-xs leading-none text-muted-foreground"
    >
      {glyph}
    </span>
  );
}
