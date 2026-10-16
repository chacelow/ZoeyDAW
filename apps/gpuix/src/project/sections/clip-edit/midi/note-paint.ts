import { MIN_GRID_CELL_PX } from "@/project/model/grid"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import type { MidiNote } from "@/project/model/types"
import { colorMix } from "@/shared/theme/color-mix"
import type { DerivedThemeColors } from "@/shared/theme/colors"
import { isBlackKey } from "./geometry"
import { rollGridLines, visibleRows } from "./layout"
import type { NoteRect, RollGeometry } from "./layout"
import { paintLayers } from "./paint-layers"
import type { PaintGroup } from "./paint-layers"

type Groups = Map<string, PaintGroup>
interface LabelRect extends NoteRect {
  readonly fill: string
  readonly border: string
}

function add(
  groups: Groups,
  key: string,
  color: string,
  opacity: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (width <= 0 || height <= 0) return
  let group = groups.get(key)
  if (!group) {
    group = { color, opacity, rectangles: [] }
    groups.set(key, group)
  }
  group.rectangles.push(x, y, width, height)
}

/** Preserve source paint order across overlaps, with text-bearing notes kept in their native box. */
export function notePaint({
  notes,
  rects,
  roll,
  selected,
  numerator,
  color,
  colors,
  fontSize,
  gridBeats = PREFERENCE_DEFAULTS.midi.noteGridBeats,
}: {
  notes: readonly MidiNote[]
  rects: readonly NoteRect[]
  roll: RollGeometry
  selected: ReadonlySet<number>
  numerator: number
  color: string
  colors: DerivedThemeColors
  fontSize: number
  gridBeats?: number
}) {
  const background: Groups = new Map()
  background.set("midi-row-fill", {
    color: colors.arrangementSurfaceAlt,
    opacity: 1,
    rectangles: [],
  })
  background.set("midi-row-lines", { color: colors.arrangementLine, opacity: 1, rectangles: [] })
  const { first, end } = visibleRows(roll)
  for (let row = first; row < end; row++) {
    const pitch = roll.pitches[row]
    if (pitch === undefined) continue
    const y = row * roll.rowHeight - roll.scrollY
    if (isBlackKey(pitch))
      add(
        background,
        "midi-row-fill",
        colors.arrangementSurfaceAlt,
        1,
        0,
        y,
        roll.viewWidth,
        roll.rowHeight
      )
    add(
      background,
      "midi-row-lines",
      colors.arrangementLine,
      1,
      0,
      y + roll.rowHeight - 1,
      roll.viewWidth,
      1
    )
  }
  for (const line of rollGridLines(roll, numerator, MIN_GRID_CELL_PX, gridBeats))
    add(
      background,
      `midi-grid-lines-${line.level}`,
      line.level === 2 ? colors.mutedForeground : colors.arrangementLine,
      line.level === 2 ? 0.45 : line.level === 1 ? 1 : 0.55,
      line.x - roll.scrollX,
      0,
      1,
      roll.viewHeight
    )
  const fills = new Map<number, string>()
  const selectedFills = new Map<number, string>()
  const unselectedBorder = colorMix(color, 60, colors.background)
  const history = new Map<
    number,
    { right: number; boxes: { left: number; right: number; plane: number }[] }
  >()
  const planes = new Map<number, { groups: Groups; labels: LabelRect[] }>()
  for (const rect of rects) {
    const note = notes[rect.index]
    if (!note) continue
    let row = history.get(rect.top)
    if (!row) {
      row = { right: -Infinity, boxes: [] }
      history.set(rect.top, row)
    }
    let plane = 0
    if (rect.left < row.right)
      for (const previous of row.boxes)
        if (previous.left < rect.left + rect.width && previous.right > rect.left)
          plane = Math.max(plane, previous.plane + 1)
    row.boxes.push({ left: rect.left, right: rect.left + rect.width, plane })
    row.right = Math.max(row.right, rect.left + rect.width)
    let paint = planes.get(plane)
    if (!paint) {
      paint = { groups: new Map(), labels: [] }
      planes.set(plane, paint)
    }
    const isSelected = selected.has(rect.index)
    const palette = isSelected ? selectedFills : fills
    let fill = palette.get(note.velocity)
    if (!fill) {
      fill = isSelected
        ? colorMix(color, 55 + (note.velocity / 127) * 45, colors.foreground)
        : colorMix(color, 35 + (note.velocity / 127) * 65, colors.arrangementSurface)
      palette.set(note.velocity, fill)
    }
    const border = isSelected ? colors.foreground : unselectedBorder
    if (rect.width > fontSize * 3 && rect.height > fontSize) {
      paint.labels.push({ ...rect, fill, border })
      continue
    }
    const x = rect.left - roll.scrollX
    const y = rect.top - roll.scrollY + 1
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height - 1)
    const key = `midi-note-${plane}-${isSelected ? "selected" : "plain"}-${fill}`
    let group = paint.groups.get(key)
    if (!group) {
      group = { color: fill, opacity: 1, strokeWidth: 1, strokeColor: border, rectangles: [] }
      paint.groups.set(key, group)
    }
    group.rectangles.push(x, y, width, height)
  }
  return {
    background: paintLayers(background),
    planes: [...planes]
      .sort(([a], [b]) => a - b)
      .map(([index, plane]) => ({
        index,
        layers: paintLayers(plane.groups),
        labels: plane.labels,
      })),
  }
}
