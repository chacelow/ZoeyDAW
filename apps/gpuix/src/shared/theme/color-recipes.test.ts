import { expect, test } from "bun:test"
import { colorMix } from "./color-mix"
import { DEFAULT_COLOR_RECIPES, velocityNoteBorder, velocityNoteFill } from "./color-recipes"
import { derive } from "./colors"
import { getThemePreset } from "./presets"

const base = getThemePreset("default").baseColors

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme} preserves the original semantic mixes and editor colors`, () => {
    const colors = derive(base[scheme], scheme)
    expect(colors.editorShell).toBe(colorMix(base[scheme].muted, 30, base[scheme].background))
    expect(colors.canvasScrollbar).toBe(colorMix(colors.foreground, 10, "transparent"))
    expect(colors.canvasScrollbarHover).toBe(colorMix(colors.foreground, 18, "transparent"))
    expect(colors.canvasScrollbarActive).toBe(colorMix(colors.foreground, 26, "transparent"))
    expect(colors.scrollbarTrack).toBe(colorMix(colors.foreground, 4, colors.background))
    expect(colors.arrangementSurfaceSelected).toBe(colorMix(colors.card, 78, colors.foreground))
    expect(colors.arrangementSurface).toBe(colorMix(colors.card, 86, colors.foreground))
    expect(colors.arrangementSurfaceAlt).toBe(colorMix(colors.card, 84, colors.foreground))
    expect(colors.arrangementFadeMask).toBe(colorMix(colors.arrangementClipInk, 50, "transparent"))
    expect(colors.destructiveActive).toBe(
      colorMix(colors.destructive, scheme === "dark" ? 20 : 10, "transparent")
    )
    expect(colors.destructiveHighlight).toBe(
      colorMix(colors.destructive, scheme === "dark" ? 30 : 20, "transparent")
    )
    expect(colors.destructiveFocusBorder).toBe(colorMix(colors.destructive, 40, "transparent"))
    expect(colors.destructiveFocusOutline).toBe(
      colorMix(colors.destructive, scheme === "dark" ? 40 : 20, "transparent")
    )
    expect(colors.listRowHover).toBe(colorMix(colors.muted, 90, colors.foreground))
    expect(colors.dialogBackdrop).toBe(colorMix(colors.foreground, 10, "transparent"))
    expect(colors.editorOverviewViewport).toBe(colorMix(colors.primary, 12, "transparent"))
    expect(colors.editorAudioLoop).toBe(colorMix(colors.primary, 45, "transparent"))
    expect(colors.editorMarkerHover).toBe(colorMix(colors.primary, 30, "transparent"))
    expect(colors.editorMarquee).toBe(colorMix(colors.primary, 20, "transparent"))
    expect(colors.pianoIvory).toBe(
      scheme === "dark" ? colorMix(colors.foreground, 75, colors.background) : colors.background
    )
    expect(colors.pianoEbony).toBe(
      scheme === "dark"
        ? colorMix(colors.background, 80, colors.foreground)
        : colorMix(colors.foreground, 80, colors.background)
    )
    expect(colors.arrangementLine).toBe(scheme === "dark" ? colors.muted : colors.border)
    expect(colors.arrangementAutomation).toBe(colors.destructive)
    expect(colors.arrangementVolume).toBe(colors.chart2)
    expect(colors.arrangementMeterGood).toBe(colors.chart2)
    expect(colors.arrangementMeterWarn).toBe(scheme === "dark" ? colors.chart3 : colors.chart4)
    expect(colors.arrangementMeterClip).toBe("#ff0000")
    expect(colors.arrangementMeterPeak).toBe(colors.mutedForeground)
    expect(colors.arrangementClipInk).toBe(scheme === "dark" ? colors.card : colors.foreground)
  })
}

test("complete recipe override controls every mix and semantic alias", () => {
  const source = { ...base.dark, success: "#aabbcc" }
  const recipes = {
    ...DEFAULT_COLOR_RECIPES,
    editorShell: 41,
    canvasScrollbar: 11,
    canvasScrollbarHover: 19,
    canvasScrollbarActive: 27,
    scrollbarTrack: 7,
    arrangementSurfaceSelected: 71,
    arrangementSurface: 81,
    arrangementSurfaceAlt: 82,
    arrangementFadeMask: 47,
    destructive: {
      active: { light: 12, dark: 23 },
      highlight: { light: 21, dark: 32 },
      focusBorder: 42,
      focusOutline: { light: 24, dark: 43 },
    },
    listRowHover: 83,
    dialogBackdrop: 13,
    editor: {
      overviewViewport: 17,
      audioLoop: 49,
      markerHover: 31,
      marquee: 22,
      pianoIvoryDark: 72,
      pianoEbony: 77,
      velocityNoteBorder: 61,
      velocitySelected: { base: 54, range: 44 },
      velocityUnselected: { base: 34, range: 64 },
    },
    aliases: {
      arrangementLine: { light: "input", dark: "ring" },
      arrangementAutomation: "primary",
      arrangementVolume: "chart5",
      arrangementMeterGood: "success",
      arrangementMeterWarn: { light: "chart1", dark: "chart4" },
      arrangementMeterClip: "accent",
      arrangementMeterPeak: "secondaryForeground",
      arrangementClipInk: { light: "primaryForeground", dark: "popoverForeground" },
    },
  } satisfies typeof DEFAULT_COLOR_RECIPES
  const colors = derive(source, "dark", recipes)
  expect(colors.editorShell).toBe(colorMix(source.muted, 41, source.background))
  expect(colors.canvasScrollbar).toBe(colorMix(source.foreground, 11, "transparent"))
  expect(colors.canvasScrollbarHover).toBe(colorMix(source.foreground, 19, "transparent"))
  expect(colors.canvasScrollbarActive).toBe(colorMix(source.foreground, 27, "transparent"))
  expect(colors.scrollbarTrack).toBe(colorMix(source.foreground, 7, source.background))
  expect(colors.arrangementSurfaceSelected).toBe(colorMix(source.card, 71, source.foreground))
  expect(colors.arrangementSurface).toBe(colorMix(source.card, 81, source.foreground))
  expect(colors.arrangementSurfaceAlt).toBe(colorMix(source.card, 82, source.foreground))
  expect(colors.arrangementFadeMask).toBe(colorMix(source.popoverForeground, 47, "transparent"))
  expect(colors.destructiveActive).toBe(colorMix(source.destructive, 23, "transparent"))
  expect(colors.destructiveHighlight).toBe(colorMix(source.destructive, 32, "transparent"))
  expect(colors.destructiveFocusBorder).toBe(colorMix(source.destructive, 42, "transparent"))
  expect(colors.destructiveFocusOutline).toBe(colorMix(source.destructive, 43, "transparent"))
  expect(colors.listRowHover).toBe(colorMix(source.muted, 83, source.foreground))
  expect(colors.dialogBackdrop).toBe(colorMix(source.foreground, 13, "transparent"))
  expect(colors.editorOverviewViewport).toBe(colorMix(source.primary, 17, "transparent"))
  expect(colors.editorAudioLoop).toBe(colorMix(source.primary, 49, "transparent"))
  expect(colors.editorMarkerHover).toBe(colorMix(source.primary, 31, "transparent"))
  expect(colors.editorMarquee).toBe(colorMix(source.primary, 22, "transparent"))
  expect(colors.pianoIvory).toBe(colorMix(source.foreground, 72, source.background))
  expect(colors.pianoEbony).toBe(colorMix(source.background, 77, source.foreground))
  expect(colors.arrangementLine).toBe(source.ring)
  expect(colors.arrangementAutomation).toBe(source.primary)
  expect(colors.arrangementVolume).toBe(source.chart5)
  expect(colors.arrangementMeterGood).toBe(source.success)
  expect(colors.arrangementMeterWarn).toBe(source.chart4)
  expect(colors.arrangementMeterClip).toBe(source.accent)
  expect(colors.arrangementMeterPeak).toBe(source.secondaryForeground)
  expect(colors.arrangementClipInk).toBe(source.popoverForeground)
  expect(velocityNoteBorder(source.primary, source.background, recipes.editor)).toBe(
    colorMix(source.primary, 61, source.background)
  )
  expect(velocityNoteFill("#ff0000", 100, "#0000ff", true, recipes.editor)).toBe(
    colorMix("#ff0000", 54 + (100 / 127) * 44, "#0000ff")
  )
  expect(velocityNoteFill("#ff0000", 100, "#0000ff", false, recipes.editor)).toBe(
    colorMix("#ff0000", 34 + (100 / 127) * 64, "#0000ff")
  )
})

test("semantic base colors can diverge from chart aliases and survive derivation", () => {
  const changed = {
    ...base.light,
    success: "#123456",
    arrangementClipSelected: "#234567",
    arrangementClipPaper: "#345678",
  }
  const colors = derive(changed, "light")
  expect(colors.success).toBe("#123456")
  expect(colors.chart2).toBe(base.light.chart2)
  expect(colors.arrangementClipSelected).toBe("#234567")
  expect(colors.arrangementClipPaper).toBe("#345678")
})

test("MIDI velocity default paint matches both selected and ordinary notes", () => {
  const colors = derive(base.light, "light")
  const color = "#5a78a6"
  const recipe = DEFAULT_COLOR_RECIPES.editor
  expect(velocityNoteBorder(color, colors.background, recipe)).toBe(
    colorMix(color, 60, colors.background)
  )
  for (const velocity of [0, 64, 127]) {
    expect(velocityNoteFill(color, velocity, colors.foreground, true, recipe)).toBe(
      colorMix(color, 55 + (velocity / 127) * 45, colors.foreground)
    )
    expect(velocityNoteFill(color, velocity, colors.arrangementSurface, false, recipe)).toBe(
      colorMix(color, 35 + (velocity / 127) * 65, colors.arrangementSurface)
    )
  }
})

test("light scheme honors its own destructive and piano recipes", () => {
  const recipes = {
    ...DEFAULT_COLOR_RECIPES,
    destructive: {
      ...DEFAULT_COLOR_RECIPES.destructive,
      active: { light: 16, dark: 20 },
      highlight: { light: 29, dark: 30 },
      focusOutline: { light: 36, dark: 40 },
    },
    editor: { ...DEFAULT_COLOR_RECIPES.editor, pianoIvoryDark: 72, pianoEbony: 73 },
    aliases: {
      ...DEFAULT_COLOR_RECIPES.aliases,
      arrangementLine: { light: "ring", dark: "muted" },
      arrangementMeterWarn: { light: "chart1", dark: "chart3" },
      arrangementClipInk: { light: "cardForeground", dark: "card" },
    },
  } satisfies typeof DEFAULT_COLOR_RECIPES
  const colors = derive(base.light, "light", recipes)
  expect(colors.destructiveActive).toBe(colorMix(base.light.destructive, 16, "transparent"))
  expect(colors.destructiveHighlight).toBe(colorMix(base.light.destructive, 29, "transparent"))
  expect(colors.destructiveFocusOutline).toBe(colorMix(base.light.destructive, 36, "transparent"))
  expect(colors.pianoIvory).toBe(base.light.background)
  expect(colors.pianoEbony).toBe(colorMix(base.light.foreground, 73, base.light.background))
  expect(colors.arrangementLine).toBe(base.light.ring)
  expect(colors.arrangementMeterWarn).toBe(base.light.chart1)
  expect(colors.arrangementClipInk).toBe(base.light.cardForeground)
})

for (const scheme of ["light", "dark"] as const)
  test(`custom ${scheme} palettes override saturated meter clipping independently of destructive`, () => {
    const source = { ...base[scheme], arrangementMeterClip: "#ff2200", destructive: "#660000" }
    expect(derive(source, scheme).arrangementMeterClip).toBe("#ff2200")
  })
