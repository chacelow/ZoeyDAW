import { expect, test } from "bun:test"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { derive } from "@/shared/theme/colors"
import { DEFAULT_THEME_PRESET, getThemePreset } from "@/shared/theme/presets"
import { velocityNoteBorder, velocityNoteFill } from "@/shared/theme/color-recipes"
import { notePaint } from "./note-paint"
import type { RollGeometry } from "./layout"

const roll: RollGeometry = {
  pitches: [61, 60],
  rowHeight: 18,
  width: 256,
  scrollX: 0,
  scrollY: 0,
  viewWidth: 256,
  viewHeight: 36,
  window: { sourceOffsetBeats: 0, totalBeats: 4 },
}
const notes = [{ id: "short", pitch: 60, startBeat: 1, lengthBeats: 0.125, velocity: 64 }]
const rects = [{ index: 0, left: 64, top: 18, width: 8, height: 18 }]

function paint(design = DEFAULT_DESIGN_TOKENS, project = PROJECT_METRICS, selected = false) {
  const colors = derive(
    getThemePreset(DEFAULT_THEME_PRESET).baseColors.dark,
    "dark",
    design.colorRecipes
  )
  return notePaint({
    notes,
    rects,
    roll,
    selected: new Set(selected ? [0] : []),
    numerator: 4,
    color: colors.primary,
    colors,
    fontSize: 9,
    design,
    project,
  })
}

function note(design = DEFAULT_DESIGN_TOKENS, project = PROJECT_METRICS, selected = false) {
  const layer = paint(design, project, selected).planes[0]?.layers[0]
  if (!layer) throw new Error("Missing compact note paint")
  return layer
}

for (const field of ["noteInset", "dividerStrokeWidth", "gridMinorStrokeWidth"] as const) {
  test(`MIDI pure paint consumes editor ${field}`, () => {
    const design = {
      ...DEFAULT_DESIGN_TOKENS,
      editor: { ...DEFAULT_DESIGN_TOKENS.editor, [field]: 3 },
    }
    const actual = paint(design)
    if (field === "noteInset") {
      expect(Array.from(note(design).rectangles())).toEqual([64, 21, 8, 15])
    } else {
      const layer = actual.background.find(
        entry =>
          entry.key === (field === "dividerStrokeWidth" ? "midi-row-lines" : "midi-grid-lines-0")
      )
      if (!layer) throw new Error(`Missing ${field} paint`)
      const rectangles = Array.from(layer.rectangles())
      expect(rectangles[field === "dividerStrokeWidth" ? 3 : 2]).toBe(3)
      if (field === "dividerStrokeWidth") expect(rectangles[1]).toBe(15)
    }
  })
}

test("MIDI pure paint consumes control border width", () => {
  const design = {
    ...DEFAULT_DESIGN_TOKENS,
    shape: { ...DEFAULT_DESIGN_TOKENS.shape, controlBorderWidth: 3 },
  }
  expect(note(design).strokeWidth).toBe(3)
})

for (const [field, level] of [
  ["gridMajorOpacity", 2],
  ["gridMinorOpacity", 0],
] as const) {
  test(`MIDI pure paint consumes project ${field}`, () => {
    const layer = paint(DEFAULT_DESIGN_TOKENS, {
      ...PROJECT_METRICS,
      [field]: 0.23,
    }).background.find(entry => entry.key === `midi-grid-lines-${level}`)
    expect(layer?.opacity).toBe(0.23)
  })
}

test("MIDI pure paint consumes major grid width", () => {
  const layer = paint(DEFAULT_DESIGN_TOKENS, {
    ...PROJECT_METRICS,
    arrangementGridMajorLineWidth: 4,
  }).background.find(entry => entry.key === "midi-grid-lines-2")
  if (!layer) throw new Error("Missing major grid")
  expect(layer.rectangles()[2]).toBe(4)
})

for (const field of ["velocityNoteBorder", "velocitySelected", "velocityUnselected"] as const) {
  const members = field === "velocityNoteBorder" ? ["percentage"] : ["base", "range"]
  for (const member of members) {
    test(`MIDI pure paint consumes recipe ${field}.${member}`, () => {
      const recipe = {
        ...DEFAULT_DESIGN_TOKENS.colorRecipes.editor,
        [field]:
          field === "velocityNoteBorder"
            ? 17
            : {
                ...DEFAULT_DESIGN_TOKENS.colorRecipes.editor[field],
                [member]: 17,
              },
      }
      const design: DesignTokens = {
        ...DEFAULT_DESIGN_TOKENS,
        colorRecipes: {
          ...DEFAULT_DESIGN_TOKENS.colorRecipes,
          editor: recipe,
        },
      }
      const colors = derive(
        getThemePreset(DEFAULT_THEME_PRESET).baseColors.dark,
        "dark",
        design.colorRecipes
      )
      const selected = field === "velocitySelected"
      const layer = note(design, PROJECT_METRICS, selected)
      if (field === "velocityNoteBorder") {
        expect(layer.strokeColor).toBe(
          velocityNoteBorder(colors.primary, colors.background, recipe)
        )
        expect(layer.strokeColor).not.toBe(note().strokeColor)
      } else {
        expect(layer.color).toBe(
          velocityNoteFill(
            colors.primary,
            64,
            selected ? colors.foreground : colors.arrangementSurface,
            selected,
            recipe
          )
        )
        expect(layer.color).not.toBe(note(DEFAULT_DESIGN_TOKENS, PROJECT_METRICS, selected).color)
      }
    })
  }
}
