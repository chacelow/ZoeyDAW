import { icons } from "lucide"
import { serialiseSvg } from "@/shared/svg/serialise"
import { useTheme } from "@/shared/theme/ThemeProvider"

/**
 * The only way to draw an icon in gpuix. Glyphs come from the `lucide` package (the same set the
 * web app used through `lucide-react`); nothing in this repo hand-authors SVG path data.
 * gpuix paints raw SVG markup through the native `<svg source>`, so the lucide icon node is
 * serialised once per name and cached.
 */
export type IconName = keyof typeof icons

const markupCache = new Map<string, string>()

/** Serialised SVG markup for an icon name; throws for an unknown name instead of drawing nothing. */
export function iconMarkup(name: IconName, strokeWidth = 2): string {
  const key = `${name}:${strokeWidth}`
  const cached = markupCache.get(key)
  if (cached) {
    return cached
  }
  const node = icons[name]
  if (!node) {
    throw new RangeError(`Unknown lucide icon: ${String(name)}`)
  }
  const markup = serialiseSvg(node, {
    viewBox: "0 0 24 24",
    attributes: {
      fill: "none",
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
}

export function Icon({ name, size, color, strokeWidth }: IconProps) {
  const theme = useTheme()
  const dimension = size ?? theme.control["--spacing-control-icon"]
  return (
    <svg
      source={iconMarkup(name, strokeWidth)}
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
