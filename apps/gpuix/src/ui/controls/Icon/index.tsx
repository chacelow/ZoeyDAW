import { icons } from "lucide"
import metronome from "@phosphor-icons/core/assets/regular/metronome.svg" with { type: "text" }
import metronomeFill from "@phosphor-icons/core/assets/fill/metronome-fill.svg" with { type: "text" }
import { serialiseSvg } from "@/shared/svg/serialise"
import { useTheme } from "@/shared/theme/ThemeProvider"

/**
 * The only way to draw an icon in gpuix. Glyphs come from the `lucide` package (the same set the
 * web app used through `lucide-react`); nothing in this repo hand-authors SVG path data.
 * gpuix paints raw SVG markup through the native `<svg source>`, so the lucide icon node is
 * serialised once per name and cached.
 */
export type LucideIconName = keyof typeof icons

/**
 * Glyphs lucide does not have, taken from Phosphor (the set the web app already used for a few
 * icons). Each is a package asset imported as text, never hand-drawn. Add one only after checking
 * that lucide has no equivalent.
 */
const PHOSPHOR_ICONS = {
  Metronome: { regular: metronome, filled: metronomeFill },
} as const
export type PhosphorIconName = keyof typeof PHOSPHOR_ICONS

export type IconName = LucideIconName | PhosphorIconName

const markupCache = new Map<string, string>()

/**
 * Serialised SVG markup for an icon name; throws for an unknown name instead of drawing nothing.
 * `filled` paints the glyph's interior with the current colour (transport play/stop/record, a
 * lit beat): lucide outlines get `fill="currentColor"`, Phosphor glyphs switch to their fill asset.
 */
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
    // Lucide assets use this fixed coordinate system; screen size comes from icon metrics.
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
  /** Pixel size; defaults to the shared control icon size so icons are uniform across controls. */
  readonly size?: number
  /** Theme-resolved colour; defaults to the muted foreground. */
  readonly color?: string
  readonly strokeWidth?: number
  /** Paint the interior with the icon colour; see `iconMarkup`. */
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
