/**
 * controls/classes — DAW 可交互 chrome 的 className 工厂。
 *
 * - 主题里 `--accent === --muted` 时 `hover:bg-accent` 看不出变化 → 用 color-mix
 *   把 muted 掺 10% / 18% foreground 作为 hover / drag 的高亮色。
 * - Mapping 高亮由 `<MappingOverlay />` 独立 overlay 层画，这里不负责。
 *
 * 状态色阶：
 *   idle      → bg-muted
 *   hover     → mix(muted, foreground 10%)
 *   dragging  → mix(muted, foreground 18%) + cursor-none
 *   active    → bg-primary
 *   disabled  → opacity-50
 */
import { cn } from "../cn"

export interface ControlClassState {
  dragging?: boolean
  active?: boolean
  disabled?: boolean
  /**
  关掉 hover 高亮层。默认 true。
  */
  highlight?: boolean
  size?: "default" | "compact"
  iconOnly?: boolean
}

const HOVER_TINT =
  "hover:bg-[color-mix(in_oklab,var(--muted),var(--foreground)_10%)] dark:hover:bg-[color-mix(in_oklab,var(--muted),var(--foreground)_10%)]"
const DRAG_TINT = "bg-[color-mix(in_oklab,var(--muted),var(--foreground)_18%)]"

export function controlInteractiveClasses(state: ControlClassState = {}, extra?: string) {
  const {
    dragging = false,
    active = false,
    disabled = false,
    highlight = true,
    size = "default",
    iconOnly = false,
  } = state
  return cn(
    "text-foreground relative inline-flex shrink-0 cursor-pointer items-center justify-center border border-[color-mix(in_oklab,var(--muted),black_25%)] transition-colors select-none",
    size === "compact"
      ? "h-control-compact px-control-pad-x text-control-compact"
      : "h-control-h px-control-pad-x text-control",
    iconOnly &&
      (size === "compact" ? "size-control-compact min-w-0 px-0" : "size-control-h min-w-0 px-0"),
    active
      ? "text-primary-foreground aria-expanded:text-primary-foreground bg-[color:var(--dragpad-color,var(--primary))] aria-expanded:bg-[color:var(--dragpad-color,var(--primary))]"
      : dragging
        ? DRAG_TINT
        : "bg-muted",
    !active && !dragging && highlight && HOVER_TINT,
    disabled && "cursor-not-allowed opacity-50",
    extra,
    dragging && "cursor-none"
  )
}

export function rowInteractiveClasses(state: ControlClassState = {}, extra?: string) {
  const { active = false, disabled = false, highlight = true } = state
  return cn(
    "text-foreground relative flex h-auto min-h-9 w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-xs leading-snug transition-colors select-none",
    active
      ? "bg-primary text-primary-foreground aria-expanded:bg-primary aria-expanded:text-primary-foreground"
      : "bg-transparent",
    !active && highlight && HOVER_TINT,
    disabled && "cursor-not-allowed opacity-50",
    extra
  )
}
