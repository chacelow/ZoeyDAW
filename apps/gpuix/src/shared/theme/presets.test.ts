import { describe, expect, test } from "bun:test"
import { converter, parse } from "culori"
import { DEFAULT_THEME_PRESET, THEME_PRESETS, getThemePreset, isThemePresetId } from "./presets"
import { PRESET_DATA } from "./presets.data"
import type { DerivedThemeColors } from "./colors"

const toRgb = converter("rgb")
const toOklab = converter("oklab")
const SCHEMES = ["light", "dark"] as const

/** Compile-time exhaustive: adding or removing a role without updating this table fails `tsc`. */
const DERIVED_ROLES: Record<keyof DerivedThemeColors, true> = {
  background: true,
  foreground: true,
  card: true,
  cardForeground: true,
  popover: true,
  popoverForeground: true,
  primary: true,
  primaryForeground: true,
  secondary: true,
  secondaryForeground: true,
  muted: true,
  mutedForeground: true,
  accent: true,
  accentForeground: true,
  success: true,
  destructive: true,
  border: true,
  input: true,
  ring: true,
  chart1: true,
  chart2: true,
  chart3: true,
  chart4: true,
  chart5: true,
  arrangementClipSelected: true,
  arrangementClipPaper: true,
  editorShell: true,
  canvasScrollbar: true,
  canvasScrollbarHover: true,
  canvasScrollbarActive: true,
  scrollbarTrack: true,
  arrangementSurfaceSelected: true,
  arrangementSurface: true,
  arrangementSurfaceAlt: true,
  arrangementLine: true,
  arrangementAutomation: true,
  arrangementVolume: true,
  arrangementMeterGood: true,
  arrangementMeterWarn: true,
  arrangementMeterDanger: true,
  arrangementMeterPeak: true,
  arrangementClipInk: true,
  arrangementFadeMask: true,
  destructiveActive: true,
  destructiveHighlight: true,
  destructiveFocusBorder: true,
  destructiveFocusOutline: true,
  listRowHover: true,
  dialogBackdrop: true,
  editorOverviewViewport: true,
  editorAudioLoop: true,
  editorMarkerHover: true,
  editorMarquee: true,
  pianoIvory: true,
  pianoEbony: true,
}

/** Literal forms gpuix's native parser (csscolorparser) is tested against. */
const GPUIX_COLOR = /^(?:#[0-9a-f]{6}(?:[0-9a-f]{2})?|oklch\([^)]+\))$/i

const lightness = (color: string) => {
  const parsed = parse(color)
  if (!parsed) throw new Error(`unparsable ${color}`)
  return toOklab(parsed).l
}

const cases = THEME_PRESETS.flatMap(preset =>
  SCHEMES.map(scheme => ({ id: preset.id, scheme, colors: preset.colors[scheme] }))
)

test("the Web preset list is migrated whole: Default plus 42 tweakcn presets, unique ids", () => {
  expect(THEME_PRESETS).toHaveLength(43)
  expect(THEME_PRESETS[0].id).toBe(DEFAULT_THEME_PRESET)
  expect(new Set(THEME_PRESETS.map(preset => preset.id)).size).toBe(THEME_PRESETS.length)
})

test("every preset provides the complete color model in both schemes", () => {
  const expected = new Set(Object.keys(PRESET_DATA[0].light))
  for (const preset of PRESET_DATA) {
    for (const scheme of SCHEMES) {
      expect({ id: preset.id, scheme, keys: new Set(Object.keys(preset[scheme])) }).toEqual({
        id: preset.id,
        scheme,
        keys: expected,
      })
    }
  }
})

describe.each(cases)("$id/$scheme", ({ colors }) => {
  test("derives every role as a finite, gpuix-parsable color", () => {
    expect(new Set(Object.keys(colors))).toEqual(new Set(Object.keys(DERIVED_ROLES)))
    for (const [role, value] of Object.entries(colors)) {
      expect({ role, value }).toEqual({ role, value: expect.stringMatching(GPUIX_COLOR) })
      const parsed = parse(value)
      if (!parsed) throw new Error(`${role}: unparsable ${value}`)
      const { r, g, b, alpha = 1 } = toRgb(parsed)
      for (const channel of [r, g, b, alpha]) expect(Number.isFinite(channel)).toBe(true)
    }
  })
})

describe("scheme orientation matches Default in every preset", () => {
  test.each(THEME_PRESETS.map(preset => [preset.id, preset] as const))("%s", (_, preset) => {
    const { light, dark } = preset.colors
    // Swapping light/dark data flips both of these.
    expect(lightness(light.background)).toBeGreaterThan(lightness(dark.background))
    expect(lightness(light.foreground)).toBeLessThan(lightness(dark.foreground))
    // Arrangement surfaces step toward the foreground: darker in light, lighter in dark.
    expect(lightness(light.arrangementSurfaceAlt)).toBeLessThan(lightness(light.arrangementSurface))
    expect(lightness(light.arrangementSurfaceSelected)).toBeLessThan(
      lightness(light.arrangementSurfaceAlt)
    )
    expect(lightness(dark.arrangementSurfaceAlt)).toBeGreaterThan(
      lightness(dark.arrangementSurface)
    )
    expect(lightness(dark.arrangementSurfaceSelected)).toBeGreaterThan(
      lightness(dark.arrangementSurfaceAlt)
    )
    // Clip ink must read on clip paper in both schemes.
    expect(lightness(light.arrangementClipInk)).toBeLessThan(lightness(light.arrangementClipPaper))
    expect(lightness(dark.arrangementClipInk)).toBeLessThan(lightness(dark.arrangementClipPaper))
  })
})

test("Default derives the same roles as the Web root theme", () => {
  const { light, dark } = getThemePreset(DEFAULT_THEME_PRESET).colors
  expect(light.background).toBe("oklch(100% 0 0deg)")
  expect(dark.border).toBe("oklch(100% 0 0deg / 10%)")
  expect(light.arrangementLine).toBe(light.border)
  expect(dark.arrangementLine).toBe(dark.muted)
  expect(light.arrangementMeterWarn).toBe(light.chart4)
  expect(dark.arrangementMeterWarn).toBe(dark.chart3)
})

test("isThemePresetId accepts listed ids only", () => {
  expect(isThemePresetId("catppuccin")).toBe(true)
  expect(isThemePresetId("")).toBe(false)
  expect(isThemePresetId("constructor")).toBe(false)
  expect(isThemePresetId("removed-preset")).toBe(false)
})
