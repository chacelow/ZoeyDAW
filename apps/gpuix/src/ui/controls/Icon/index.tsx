import { icons } from "lucide"
import metronome from "@phosphor-icons/core/assets/regular/metronome.svg" with { type: "text" }
import metronomeFill from "@phosphor-icons/core/assets/fill/metronome-fill.svg" with { type: "text" }
import { serialiseSvg } from "@/shared/svg/serialise"
import { useTheme } from "@/shared/theme/ThemeProvider"

export type LucideIconName = keyof typeof icons

const PHOSPHOR_ICONS = {
  Metronome: { regular: metronome, filled: metronomeFill },
} as const
export type PhosphorIconName = keyof typeof PHOSPHOR_ICONS

export type IconName = LucideIconName | PhosphorIconName

const markupCache = new Map<string, string>()

export function iconMarkup(name: IconName, strokeWidth: number, filled = false): string {
  const key = `${name}:${strokeWidth}:${filled ? "fill" : "line"}`
  const cached = markupCache.get(key)
  if (cached) {
    return cached
  }
  const phosphor = PHOSPHOR_ICONS[name as PhosphorIconName]
  if (phosphor) {
    const markup = filled ? phosphor.filled : phosphor.regular
    markupCache.set(key, markup)
    return markup
  }
  const node = icons[name as LucideIconName]
  if (!node) {
    throw new RangeError(`Unknown icon: ${String(name)}`)
  }
  const markup = serialiseSvg(node, {
    viewBox: "0 0 24 24",
    attributes: {
      fill: filled ? "currentColor" : "none",
      stroke: "currentColor",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-width": strokeWidth,
    },
  })
  markupCache.set(key, markup)
  return markup
}

export interface IconProps {
  readonly name: IconName
  readonly size?: number
  readonly color?: string
  readonly strokeWidth?: number
  readonly filled?: boolean
}

export function Icon({ name, size, color, strokeWidth, filled }: IconProps) {
  const theme = useTheme()
  const dimension = size ?? theme.control["--spacing-control-icon"]
  return (
    <svg
      source={iconMarkup(name, strokeWidth ?? theme.design.icon.strokeWidth, filled)}
      aria-hidden="true"
      style={{
        width: dimension,
        height: dimension,
        color: color ?? theme.colors.mutedForeground,
        flexShrink: 0,
      }}
    />
  )
}
