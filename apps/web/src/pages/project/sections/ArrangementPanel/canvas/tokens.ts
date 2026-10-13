/**
 * Resolve CSS custom properties to concrete color strings for canvas painters.
 *
 * Canvas 2D does not accept CSS variables; painters need resolved color values.
 * This helper reads a reference element once per theme change and feeds painters
 * fresh tokens through the scheduler on repaint.
 */
import type { GridTokens } from "./painters/grid"

const TOKEN_NAMES = [
  "--overlay",
  "--foreground",
  "--muted-foreground",
  "--muted",
  "--primary",
  "--destructive",
  "--arrangement-surface",
  "--arrangement-surface-alt",
  "--arrangement-ruler",
  "--arrangement-line",
  "--arrangement-grid-bar",
  "--arrangement-grid-minor",
  "--arrangement-grid-major",
  "--arrangement-automation",
  "--arrangement-meter-good",
  "--arrangement-meter-warn",
  "--arrangement-meter-danger",
  "--arrangement-clip-ink",
  "--arrangement-fade-mask",
  "--arrangement-clip-selected",
  "--arrangement-clip-paper",
  "--arrangement-clip-tint",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]
export type TokenSet = Record<TokenName, string>

export function readTokens(element: HTMLElement): TokenSet {
  const style = getComputedStyle(element)
  const out = {} as TokenSet
  const probe = document.createElement("span")
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden"
  element.append(probe)
  for (const name of TOKEN_NAMES) {
    if (name === "--arrangement-clip-tint") {
      out[name] = style.getPropertyValue(name).trim()
    } else {
      probe.style.color = `var(${name}, transparent)`
      out[name] = getComputedStyle(probe).color
    }
  }
  probe.remove()
  return out
}

/**
 * Resolve a possibly-tokenized color (`var(--chart-1)`) to a concrete color.
 *
 * Keeps fallback chain simple: `var(--x)` → tokens.--x; else return the input.
 */
export function resolveColor(
  color: string | undefined,
  tokens: TokenSet,
  fallback: string
): string {
  if (!color) return fallback
  const match = color.match(/^var\((--[a-z0-9-]+)\)$/i)
  if (!match) return color
  const name = TOKEN_NAMES.find(name => name === match[1])
  return name ? tokens[name] : fallback
}

export function gridTokens(tokens: TokenSet): GridTokens {
  return {
    foreground: tokens["--foreground"],
    mutedForeground: tokens["--muted-foreground"],
    surface: tokens["--arrangement-surface"],
    surfaceAlt: tokens["--arrangement-surface-alt"],
    ruler: tokens["--arrangement-ruler"],
    line: tokens["--arrangement-line"],
    gridBar: tokens["--arrangement-grid-bar"],
    gridMinor: tokens["--arrangement-grid-minor"],
    gridMajor: tokens["--arrangement-grid-major"],
    primary: tokens["--primary"],
  }
}

export function readThemeStamp(): string {
  const root = document.documentElement
  const classes = [...root.classList].filter(name => name !== "dragpad-dragging").join(" ")
  return `${classes}|${root.getAttribute("style")}|${root.getAttribute("data-theme")}`
}
