import { expect, test } from "bun:test"
import { converter, parse } from "culori"
import { createTestRoot } from "@gpuix/react/testing"
import { getThemePreset } from "@/shared/theme/presets"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Button } from "."
import type { Oklab } from "culori"

const toOklab = converter("oklab")

function color(value: unknown) {
  if (typeof value !== "string") throw new Error("Missing native style color")
  const parsed = parse(value)
  if (!parsed) throw new Error(`Invalid native style color: ${value}`)
  return toOklab(parsed)
}

function distance(a: Oklab, b: Oklab) {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b)
}

function nestedStyle(style: Record<string, unknown>, state: string) {
  const value = style[state]
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Missing native ${state} style`)
  }
  return Object.fromEntries(Object.entries(value))
}

for (const appearance of ["dark", "light"] satisfies readonly ("dark" | "light")[]) {
  test(`active Record remains danger-colored across native ${appearance} states`, () => {
    const root = createTestRoot({ width: 400, height: 120 })
    try {
      root.render(
        <ThemeProvider preset="catppuccin" appearance={appearance}>
          <div style={{ display: "flex", gap: 8 }}>
            <Button testId="record" variant="destructive" active label="Record">
              ●
            </Button>
            <Button testId="disabled-record" variant="destructive" active disabled>
              ●
            </Button>
            <Button testId="quiet-record" variant="destructive" active highlight={false}>
              ●
            </Button>
            <Button testId="play" active>
              Play
            </Button>
          </div>
        </ThemeProvider>
      )
      root.renderer.flush()
      const record = root.renderer.findByTestId("record")!
      const bounds = root.renderer.getElementBounds(record.id)!
      expect(bounds.width).toBeGreaterThan(0)
      root.renderer.nativeSimulateMouseMove(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2
      )
      root.renderer.focusElement(record.id)
      root.renderer.flush()
      const style = root.renderer.getElement(record.id)!.style
      const roles = getThemePreset("catppuccin").colors[appearance]
      const danger = color(roles.destructive)
      const primary = color(roles.primary)
      const primaryText = color(roles.primaryForeground)
      const wash = color(style.backgroundColor)
      const hover = color(nestedStyle(style, "hover").backgroundColor)
      const held = color(nestedStyle(style, "active").backgroundColor)
      const focus = nestedStyle(style, "focusVisible")
      for (const rendered of [wash, hover, held]) {
        expect(distance(rendered, danger)).toBeLessThan(distance(rendered, primary))
        expect(rendered.alpha ?? 1).toBeLessThan(1)
        expect(rendered.alpha ?? 1).toBeGreaterThan(0)
      }
      for (const rendered of [color(focus.outlineColor), color(focus.borderColor)]) {
        expect(distance(rendered, danger)).toBeLessThan(distance(rendered, primary))
        expect(rendered.alpha ?? 1).toBeLessThan(1)
        expect(rendered.alpha ?? 1).toBeGreaterThan(0)
      }
      const foreground = color(style.color)
      expect(distance(foreground, danger)).toBeLessThan(distance(foreground, primaryText))
      expect(hover.alpha ?? 1).toBeGreaterThan(wash.alpha ?? 1)
      expect(held.alpha ?? 1).toBeGreaterThanOrEqual(wash.alpha ?? 1)
      const disabled = root.renderer.findByTestId("disabled-record")!.style
      expect(disabled.opacity).toBe(0.5)
      expect(color(disabled.backgroundColor)).toEqual(wash)
      expect(color(nestedStyle(disabled, "hover").backgroundColor)).toEqual(wash)
      const quiet = root.renderer.findByTestId("quiet-record")!.style
      expect(color(nestedStyle(quiet, "hover").backgroundColor)).toEqual(wash)
      const play = root.renderer.findByTestId("play")!.style
      expect(color(play.backgroundColor)).toEqual(primary)
      expect(color(play.color)).toEqual(primaryText)
    } finally {
      root.unmount()
    }
  })
}
