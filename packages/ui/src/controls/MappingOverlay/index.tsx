/**
 * MappingOverlay — mapping-mode 下盖在控件最上层的"蒙版"高亮。
 *
 * - 不改按钮自身 bg，纯 overlay 层叠加
 * - 颜色走 `--dragpad-color`，默认 `--ring`
 * - 关键帧 `mapping-pulse`：opacity 0 → 0.55 → 0（在 index.css），
 *   视觉上是"从暗到亮"的闪耀起手，而不是从显形直接半隐
 * - `pointer-events-none` 让点击/hover 正常穿透到按钮
 * - Mapping 状态从共享 ControlEnvironment 读取，由宿主提供具体状态源。
 */
import { useControlEnvironment } from "../ControlEnvironment/useControlEnvironment"

export interface MappingOverlayProps {
  /**
  这个控件是否 mappable（默认由父组件决定；一般传父组件的 mappable prop）
  */
  readonly mappable?: boolean
  readonly disabled?: boolean
  /**
  rounded-sm / rounded-md 跟父按钮形状对齐；默认 rounded-sm
  */
  readonly rounded?: "sm" | "md" | "lg" | "none"
}

const ROUNDED_CLASS: Record<NonNullable<MappingOverlayProps["rounded"]>, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
}

export function MappingOverlay({
  mappable = true,
  disabled = false,
  rounded = "sm",
}: MappingOverlayProps) {
  const { mappingActive } = useControlEnvironment()
  if (!mappable || !mappingActive || disabled) {
    return null
  }
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -inset-[2px] bg-[color:var(--dragpad-color,var(--ring))] ${ROUNDED_CLASS[rounded]}`}
      style={{ animation: "mapping-pulse 0.8s ease-in-out infinite" }}
    />
  )
}
