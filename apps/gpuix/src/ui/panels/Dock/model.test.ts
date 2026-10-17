import { describe, expect, test } from "bun:test"
import {
  activateTab,
  addPanel,
  closeTab,
  fromJSON,
  getGroups,
  hideTab,
  moveGroupOrPanel,
  moveTab,
  reorderTab,
  resizeSplit,
  resolveDropPosition,
  splitGroup,
  toJSON,
  toggleMaximize,
  getBorderTabs,
  moveToBorder,
  resizeBorder,
  selectBorderTab,
  setBorderType,
} from "./model"
import type { DockLayoutJSON, DockNode } from "./model"

function initial(): DockLayoutJSON {
  return {
    version: 2,
    borders: {},
    hidden: [],
    activeGroup: "a",
    maximizedGroup: null,
    root: {
      kind: "split",
      id: "root",
      orientation: "horizontal",
      sizes: [1, 2],
      children: [
        { kind: "group", id: "a", tabs: ["one", "two"], active: "one" },
        { kind: "group", id: "b", tabs: ["three", "four"], active: "three" },
      ],
    },
  }
}
function assertInvariants(layout: DockLayoutJSON) {
  const ids: string[] = []
  const tabs: string[] = [...layout.hidden, ...getBorderTabs(layout)]
  const visit = (node: DockNode | null) => {
    if (!node) return
    ids.push(node.id)
    if (node.kind === "group") {
      expect(node.tabs.length).toBeGreaterThan(0)
      expect(node.tabs).toContain(node.active)
      tabs.push(...node.tabs)
    } else {
      expect(node.children.length).toBeGreaterThanOrEqual(2)
      expect(node.sizes.length).toBe(node.children.length)
      expect(node.sizes.every(size => size > 0 && Number.isFinite(size))).toBe(true)
      node.children.forEach(visit)
    }
  }
  visit(layout.root)
  expect(new Set(ids).size).toBe(ids.length)
  expect(new Set(tabs).size).toBe(tabs.length)
  expect(fromJSON(toJSON(layout))).toEqual(layout)
}
describe("dock layout model", () => {
  test("same-strip insertion adjusts the slot after removing its dragged tab", () => {
    const layout = addPanel(initial(), "five", "a")
    const moved = moveGroupOrPanel(layout, { groupId: "a", tabId: "one" }, "a", "center", 2)
    expect(getGroups(moved.root).find(group => group.id === "a")?.tabs).toEqual([
      "two",
      "one",
      "five",
    ])
    const unchanged = moveGroupOrPanel(layout, { groupId: "a", tabId: "one" }, "a", "center", 1)
    expect(getGroups(unchanged.root).find(group => group.id === "a")?.tabs).toEqual([
      "one",
      "two",
      "five",
    ])
  })
  test("moving the last tab removes its group and collapses the parent split", () => {
    let layout = moveTab(initial(), "one", "b")
    layout = moveTab(layout, "two", "b")
    expect(layout.root?.kind).toBe("group")
    expect(getGroups(layout.root)[0]?.tabs).toEqual(["three", "four", "one", "two"])
    expect(layout.root?.id).toBe("b")
    assertInvariants(layout)
  })
  test("self-split, group edge move, center merge, reorder, close and hide preserve tab identity", () => {
    let layout = splitGroup(initial(), "two", "a", "bottom")
    expect(getGroups(layout.root).length).toBe(3)
    assertInvariants(layout)
    const added = getGroups(layout.root).find(group => group.tabs.includes("two"))
    if (!added) throw new Error("Missing split group")
    layout = moveGroupOrPanel(layout, { groupId: added.id }, "b", "right")
    expect(getGroups(layout.root).find(group => group.tabs.includes("two"))?.id).toBe(added.id)
    layout = moveGroupOrPanel(layout, { groupId: added.id }, "b", "center", 1)
    layout = reorderTab(layout, "b", "two", 0)
    expect(getGroups(layout.root).find(group => group.id === "b")?.tabs).toEqual([
      "two",
      "three",
      "four",
    ])
    layout = hideTab(layout, "two")
    layout = addPanel(layout, "two", "a")
    layout = activateTab(layout, "two")
    layout = toggleMaximize(layout, "a")
    layout = closeTab(layout, "two")
    layout = closeTab(layout, "one")
    expect(layout.root?.kind).toBe("group")
    expect(layout.maximizedGroup).toBeNull()
    assertInvariants(layout)
  })
  test("seeded operation sequences maintain structural and uniqueness invariants", () => {
    let seed = 621
    let layout = initial()
    const random = (max: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed % max
    }
    for (let i = 0; i < 200; i++) {
      const groups = getGroups(layout.root)
      const source = groups[random(groups.length)]
      const target = groups[random(groups.length)]
      const tab = source?.tabs[random(source.tabs.length)]
      if (!source || !target || !tab) break
      const operation = random(5)
      if (operation === 0) layout = splitGroup(layout, tab, target.id, i % 2 ? "left" : "bottom")
      else if (operation === 1) layout = moveTab(layout, tab, target.id)
      else if (operation === 2)
        layout = reorderTab(layout, source.id, tab, random(source.tabs.length))
      else if (operation === 3) {
        layout = hideTab(layout, tab)
        layout = addPanel(layout, tab)
      } else layout = activateTab(layout, tab)
      assertInvariants(layout)
      expect(
        getGroups(layout.root)
          .flatMap(group => group.tabs)
          .sort((a, b) => a.localeCompare(b))
      ).toEqual(["four", "one", "three", "two"])
    }
  })
  test("resizing preserves caller weights without accepting malformed constraints", () => {
    expect(resizeSplit(initial(), "root", [40, 60]).root).toMatchObject({ sizes: [40, 60] })
    expect(resizeSplit(initial(), "root", [0, 1])).toEqual(initial())
  })
  test("versioned deserialization rejects duplicate tabs, ids and invalid active members", () => {
    const layout = initial()
    expect(() => fromJSON({ ...layout, version: 3 })).toThrow(TypeError)
    expect(() => fromJSON({ ...layout, hidden: ["one"] })).toThrow(TypeError)
    expect(() =>
      fromJSON({ ...layout, root: { kind: "group", id: "a", tabs: ["one", "one"], active: "one" } })
    ).toThrow(TypeError)
    expect(() =>
      fromJSON({ ...layout, root: { kind: "group", id: "a", tabs: ["one"], active: "two" } })
    ).toThrow(TypeError)
  })
  test("border moves, selection, resize, close and v1 migration preserve unique panel ownership", () => {
    const original = initial()
    expect(fromJSON({ ...original, version: 1, borders: undefined })).toEqual(original)
    let layout = moveToBorder(original, { groupId: "a", tabId: "one" }, "right", 300)
    expect(layout.borders.right).toEqual({ tabs: ["one"], end: [], visible: true, hoverReveal: false, selected: null, size: 300, type: "split" })
    layout = selectBorderTab(layout, "right", "one")
    expect(layout.borders.right?.selected).toBe("one")
    layout = selectBorderTab(layout, "right", null)
    expect(layout.borders.right?.selected).toBeNull()
    layout = resizeBorder(layout, "right", 420)
    expect(layout.borders.right?.size).toBe(420)
    expect(resizeBorder(layout, "right", -1)).toBe(layout)
    layout = moveGroupOrPanel(layout, { groupId: "border:right", tabId: "one" }, "b", "center", 1)
    expect(getGroups(layout.root).find(group => group.id === "b")?.tabs).toEqual(["three", "one", "four"])
    expect(layout.borders.right?.tabs).toEqual([])
    layout = moveToBorder(layout, { groupId: "b", tabId: "one" }, "bottom", 220)
    layout = closeTab(selectBorderTab(layout, "bottom", "one"), "one")
    expect(layout.borders.bottom).toEqual({ tabs: [], end: [], visible: true, hoverReveal: false, selected: null, size: 220, type: "split" })
    assertInvariants(layout)
    const allBorder = moveToBorder(initial(), { groupId: "a" }, "left", 240)
    const emptyMain = moveToBorder(allBorder, { groupId: "b" }, "left", 240)
    expect(emptyMain.root).toBeNull()
    const recovered = moveGroupOrPanel(emptyMain, { groupId: "border:left", tabId: "one" }, "dock-empty", "center")
    expect(getGroups(recovered.root)[0]?.tabs).toEqual(["one"])
    assertInvariants(recovered)
    expect(() => fromJSON({ ...original, borders: { right: { tabs: ["one"], selected: null, size: 300 } } })).toThrow(TypeError)
    expect(() => fromJSON({ ...original, borders: { left: { tabs: ["extra"], selected: "missing", size: 300 } } })).toThrow(TypeError)
    expect(() => fromJSON({ ...original, borders: { bottom: { tabs: [], selected: null, size: 0 } } })).toThrow(TypeError)
  })
  test("border type defaults to split and pinned selections coexist with an overlay", () => {
    let layout = moveToBorder(initial(), { groupId: "a", tabId: "one" }, "left", 240)
    layout = moveToBorder(layout, { groupId: "b", tabId: "three" }, "right", 260)
    layout = selectBorderTab(layout, "left", "one")
    layout = selectBorderTab(layout, "right", "three")
    expect(layout.borders.left?.selected).toBe("one")
    expect(layout.borders.right?.selected).toBe("three")
    layout = setBorderType(layout, "right", "overlay")
    expect(layout.borders.left?.selected).toBe("one")
    expect(fromJSON(toJSON(layout))).toEqual(layout)
    const legacy = fromJSON({ ...layout, borders: { right: { tabs: ["three"], selected: "three", size: 260 } } })
    expect(legacy.borders.right?.type).toBe("split")
    expect(legacy.borders.right?.end).toEqual([])
    expect(legacy.borders.right?.visible).toBe(true)
    expect(() => fromJSON({ ...layout, borders: { right: { tabs: ["three"], selected: null, size: 260, type: "unknown" } } })).toThrow(TypeError)
  })
  test("drop zones use normalized nearest edge, center, and reject points outside bounds", () => {
    const box = { x: 100, y: 50, width: 400, height: 200 }
    expect(resolveDropPosition(box, 110, 150, 0.2)).toBe("left")
    expect(resolveDropPosition(box, 490, 150, 0.2)).toBe("right")
    expect(resolveDropPosition(box, 300, 55, 0.2)).toBe("top")
    expect(resolveDropPosition(box, 300, 245, 0.2)).toBe("bottom")
    expect(resolveDropPosition(box, 300, 150, 0.2)).toBe("center")
    expect(resolveDropPosition(box, 100, 49, 0.2)).toBeNull()
    expect(resolveDropPosition(box, 180, 150, 0.2)).toBe("center")
  })
})
