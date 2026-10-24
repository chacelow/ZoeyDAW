import { describe, expect, test } from "vitest"
import { borderGeometry } from "./border-geometry"
import { borderRailBounds } from "./border-rails"
import { projectDockGroups, splitBounds } from "./geometry"
import type { DockLayoutJSON, DockSplit } from "./model"

const bounds = { x: 10, y: 20, width: 600, height: 400 }
const border = (tabs: string[], selected: string | null, type: "split" | "overlay" = "split") => ({
  tabs,
  end: [],
  selected,
  type,
  size: 120,
  visible: true,
})

describe("dock geometry", () => {
  test("weighted split bounds and nested projections preserve separator space", () => {
    const split: DockSplit = {
      kind: "split",
      id: "root",
      orientation: "horizontal",
      sizes: [1, 2],
      children: [
        { kind: "group", id: "a", tabs: ["a"], active: "a" },
        { kind: "group", id: "b", tabs: ["b"], active: "b" },
      ],
    }
    expect(splitBounds(split, bounds, 6)).toEqual([
      { x: 10, y: 20, width: 198, height: 400 },
      { x: 214, y: 20, width: 396, height: 400 },
    ])
    expect([...projectDockGroups(split, bounds, 6)]).toEqual([
      ["a", { x: 10, y: 20, width: 198, height: 400 }],
      ["b", { x: 214, y: 20, width: 396, height: 400 }],
    ])
  })

  test("visible rails surround split borders while overlay does not consume main space", () => {
    const layout: Pick<DockLayoutJSON, "borders" | "maximizedGroup"> = {
      maximizedGroup: null,
      borders: {
        left: border(["a"], "a"),
        right: border(["b"], "b", "overlay"),
        bottom: border(["c"], "c"),
      },
    }
    expect([...borderRailBounds(layout, bounds, 20)]).toEqual([
      ["left", { x: 10, y: 20, width: 20, height: 400 }],
      ["right", { x: 590, y: 20, width: 20, height: 400 }],
      ["bottom", { x: 30, y: 400, width: 560, height: 20 }],
    ])
    expect(borderGeometry(layout, bounds, 20, 6, 80)).toEqual({
      main: { x: 156, y: 20, width: 434, height: 254 },
      boxes: {
        left: { x: 30, y: 20, width: 120, height: 254 },
        right: { x: 470, y: 20, width: 120, height: 254 },
        bottom: { x: 30, y: 280, width: 560, height: 120 },
      },
    })
  })
})
