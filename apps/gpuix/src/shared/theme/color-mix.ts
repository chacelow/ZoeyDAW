/**
 * Resolves CSS `color-mix(in oklab, …)` expressions into concrete hex colors.
 *
 * gpuix's native style parser accepts hex, rgb/hsl/hwb/hsv and oklab/oklch
 * literals, but not the CSS `color-mix()` function. The current Web theme
 * derives several tokens from `color-mix`, so each one must be resolved once
 * here instead of relying on runtime CSS evaluation.
 */
import { converter, formatHex8, parse } from "culori"
import type { Oklab } from "culori"

const toOklab = converter("oklab")

function resolve(input: string): Oklab {
  const parsed = parse(input)
  if (!parsed) {
    throw new Error(`color-mix: could not parse color "${input}"`)
  }
  return toOklab(parsed)
}

/**
 * Mirrors `color-mix(in oklab, a pctA%, b)`.
 *
 * `b === "transparent"` is the common case in this theme (a translucent wash
 * of `a`): CSS treats transparent's hue/lightness/chroma as missing, so they
 * are inherited from `a`, and only alpha interpolates toward 0.
 */
export function colorMix(a: string, pctA: number, b: string): string {
  const weightA = pctA / 100
  const colorA = resolve(a)
  if (b === "transparent") {
    return formatHex8({
      ...colorA,
      alpha: (colorA.alpha ?? 1) * weightA,
    })
  }
  const colorB = resolve(b)
  const weightB = 1 - weightA
  return formatHex8({
    mode: "oklab",
    l: (colorA.l ?? 0) * weightA + (colorB.l ?? 0) * weightB,
    a: (colorA.a ?? 0) * weightA + (colorB.a ?? 0) * weightB,
    b: (colorA.b ?? 0) * weightA + (colorB.b ?? 0) * weightB,
    alpha: (colorA.alpha ?? 1) * weightA + (colorB.alpha ?? 1) * weightB,
  })
}
