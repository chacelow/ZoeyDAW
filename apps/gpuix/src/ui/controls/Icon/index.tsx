import { createContext, useContext } from "react"
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

/** Set by an interactive IconSlot: glyph base size, hover state and hover scale. */
export const IconInteractionContext = createContext<{
  readonly filled: boolean
  readonly hovered: boolean
  readonly size: number
  readonly scale: number
} | null>(null)

export interface IconProps {
  readonly name: IconName
  readonly size?: number
  readonly color?: string
  readonly strokeWidth?: number
  readonly filled?: boolean
}

export function Icon({ name, size, color, strokeWidth, filled }: IconProps) {
  const theme = useTheme()
  const interaction = useContext(IconInteractionContext)
  const source = iconMarkup(name, strokeWidth ?? theme.design.icon.strokeWidth, interaction?.filled || filled)
  const dimension = interaction?.size ?? size ?? theme.control["--spacing-control-icon"]
  const style = {
    width: dimension,
    height: dimension,
    color: interaction?.hovered ? theme.colors.foreground : (color ?? theme.colors.mutedForeground),
    // Hover enlarges the glyph instantly as a paint-only GPU scale; no animation either way.
    scale: interaction?.hovered ? interaction.scale : undefined,
    flexShrink: 0,
  }
  return <svg source={source} aria-hidden="true" style={style} />
}
