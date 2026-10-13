/**
 * EditInput — DragPad* 的编辑态外壳。
 *
 * **视觉完全等同 idle**:复用 chrome,不加 ring 不换色;icon 常驻;**宽度由
 * `samples` 的 ghost 文本实测锁定**(浏览器 text layout),0 ch 猜算。
 */
import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { IconSlot } from "../IconSlot/index";
import { controlInteractiveClasses } from "../classes";
import { useInfoBinding } from "./useInfoBinding";

export interface EditInputProps {
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  "aria-label": string;
  className?: string;
  style?: CSSProperties;
  icon?: ReactNode;
  size?: "default" | "compact";
  /** 决定 chrome 宽度的 ghost 文本样本(通常传 `[format(min), format(max)]`)。 */
  samples: string[];
}

export const EditInput = forwardRef<HTMLInputElement, EditInputProps>(
  function EditInput(
    {
      value,
      onChange,
      onCommit,
      onCancel,
      "aria-label": ariaLabel,
      className,
      style,
      icon,
      size = "default",
      samples,
    },
    ref,
  ) {
    const infoHandlers = useInfoBinding({ type: "number" });
    const mergedClass = [
      icon ? "gap-control-gap" : "",
      "cursor-text",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <div
        style={style}
        {...infoHandlers}
        className={controlInteractiveClasses(
          { active: false, highlight: false, size },
          mergedClass,
        )}
      >
        {icon ? <IconSlot size={size}>{icon}</IconSlot> : null}
        <span className="relative inline-grid items-center justify-center">
          {samples.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="col-start-1 row-start-1 invisible whitespace-pre tabular-nums"
            >
              {s}
            </span>
          ))}
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              }
            }}
            aria-label={ariaLabel}
            className={
              size === "compact"
                ? "absolute inset-0 min-w-0 w-full bg-transparent text-center text-control-compact tabular-nums leading-none text-current outline-hidden"
                : "absolute inset-0 min-w-0 w-full bg-transparent text-center text-control tabular-nums leading-none text-current outline-hidden"
            }
          />
        </span>
      </div>
    );
  },
);
