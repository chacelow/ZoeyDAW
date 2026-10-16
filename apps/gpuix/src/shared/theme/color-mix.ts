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
