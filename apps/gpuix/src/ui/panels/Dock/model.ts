export type DockPosition = "left" | "right" | "top" | "bottom" | "center"
export type DockOrientation = "horizontal" | "vertical"
export interface DockGroup {
  readonly kind: "group"
  readonly id: string
  readonly tabs: readonly string[]
  readonly active: string
}
export interface DockSplit {
  readonly kind: "split"
  readonly id: string
  readonly orientation: DockOrientation
  readonly children: readonly DockNode[]
  readonly sizes: readonly number[]
}
export type DockNode = DockGroup | DockSplit
export interface DockLayoutJSON {
  readonly version: 1
  readonly root: DockNode | null
  readonly hidden: readonly string[]
  readonly activeGroup: string | null
  readonly maximizedGroup: string | null
}
export type DockDragSource = { readonly groupId: string; readonly tabId?: string }

export function getGroups(node: DockNode | null): DockGroup[] {
  if (!node) return []
  return node.kind === "group" ? [node] : node.children.flatMap(getGroups)
}
export function findGroup(layout: DockLayoutJSON, id: string) {
  return getGroups(layout.root).find(group => group.id === id)
}
function mapNode(node: DockNode, update: (node: DockNode) => DockNode | null): DockNode | null {
  if (node.kind === "group") return update(node)
  const children: DockNode[] = []
  const sizes: number[] = []
  node.children.forEach((child, index) => {
    const mapped = mapNode(child, update)
    if (mapped) {
      children.push(mapped)
      sizes.push(node.sizes[index] ?? 1)
    }
  })
  if (children.length === 0) return null
  if (children.length === 1) return children[0] ?? null
  return update({ ...node, children, sizes })
}
function withRoot(layout: DockLayoutJSON, root: DockNode | null): DockLayoutJSON {
  const groups = getGroups(root)
  return {
    ...layout,
    root,
    activeGroup: groups.some(group => group.id === layout.activeGroup)
      ? layout.activeGroup
      : (groups[0]?.id ?? null),
    maximizedGroup: groups.some(group => group.id === layout.maximizedGroup)
      ? layout.maximizedGroup
      : null,
  }
}
function updateRoot(layout: DockLayoutJSON, update: (node: DockNode) => DockNode | null) {
  return withRoot(layout, layout.root ? mapNode(layout.root, update) : null)
}
export function activateTab(layout: DockLayoutJSON, tabId: string): DockLayoutJSON {
  const group = getGroups(layout.root).find(candidate => candidate.tabs.includes(tabId))
  if (!group) return layout
  return {
    ...updateRoot(layout, node => (node.id === group.id ? { ...group, active: tabId } : node)),
    activeGroup: group.id,
  }
}
function removeTabs(layout: DockLayoutJSON, ids: readonly string[]): DockLayoutJSON {
  return updateRoot(layout, node => {
    if (node.kind !== "group") return node
    const tabs = node.tabs.filter(tab => !ids.includes(tab))
    if (tabs.length === node.tabs.length) return node
    if (tabs.length === 0) return null
    const index = node.tabs.indexOf(node.active)
    return {
      ...node,
      tabs,
      active: tabs.includes(node.active)
        ? node.active
        : (tabs[Math.min(index, tabs.length - 1)] ?? tabs[0] ?? ""),
    }
  })
}
export function closeTab(layout: DockLayoutJSON, tabId: string): DockLayoutJSON {
  return { ...removeTabs(layout, [tabId]), hidden: layout.hidden.filter(tab => tab !== tabId) }
}
export function hideTab(layout: DockLayoutJSON, tabId: string): DockLayoutJSON {
  if (!getGroups(layout.root).some(group => group.tabs.includes(tabId))) return layout
  return { ...removeTabs(layout, [tabId]), hidden: [...layout.hidden, tabId] }
}
export function closeOtherTabs(
  layout: DockLayoutJSON,
  tabId: string,
  canClose: (tabId: string) => boolean
): DockLayoutJSON {
  const group = getGroups(layout.root).find(candidate => candidate.tabs.includes(tabId))
  return group
    ? removeTabs(
        layout,
        group.tabs.filter(tab => tab !== tabId && canClose(tab))
      )
    : layout
}
export function reorderTab(
  layout: DockLayoutJSON,
  groupId: string,
  tabId: string,
  index: number
): DockLayoutJSON {
  const group = findGroup(layout, groupId)
  if (!group?.tabs.includes(tabId)) return layout
  const tabs = group.tabs.filter(tab => tab !== tabId)
  tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, tabId)
  return updateRoot(layout, node => (node.id === groupId ? { ...group, tabs } : node))
}
function uniqueId(layout: DockLayoutJSON, prefix: string): string {
  const ids = new Set<string>()
  const visit = (node: DockNode | null) => {
    if (!node) return
    ids.add(node.id)
    if (node.kind === "split") node.children.forEach(visit)
  }
  visit(layout.root)
  let index = 1
  while (ids.has(`${prefix}-${index}`)) index++
  return `${prefix}-${index}`
}
export function moveGroupOrPanel(
  layout: DockLayoutJSON,
  source: DockDragSource,
  targetId: string,
  position: DockPosition,
  index?: number
): DockLayoutJSON {
  const from = findGroup(layout, source.groupId)
  const target = findGroup(layout, targetId)
  if (!from || !target || (source.tabId && !from.tabs.includes(source.tabId))) return layout
  const tabs = source.tabId ? [source.tabId] : from.tabs
  if (from.id === target.id) {
    if (position === "center")
      return source.tabId && index !== undefined
        ? reorderTab(
            layout,
            from.id,
            source.tabId,
            index - (from.tabs.indexOf(source.tabId) < index ? 1 : 0)
          )
        : layout
    if (tabs.length === from.tabs.length) return layout
  }
  const removed = removeTabs(layout, tabs)
  if (position === "center") {
    const nextTarget = findGroup(removed, targetId)
    if (!nextTarget) return layout
    const merged = [...nextTarget.tabs]
    merged.splice(Math.max(0, Math.min(index ?? merged.length, merged.length)), 0, ...tabs)
    return {
      ...updateRoot(removed, node =>
        node.id === targetId
          ? { ...nextTarget, tabs: merged, active: source.tabId ?? from.active }
          : node
      ),
      activeGroup: targetId,
    }
  }
  const groupId = source.tabId ? uniqueId(layout, "dock-group") : from.id
  const group: DockGroup = { kind: "group", id: groupId, tabs, active: source.tabId ?? from.active }
  const orientation = position === "left" || position === "right" ? "horizontal" : "vertical"
  const before = position === "left" || position === "top"
  const splitId = uniqueId(layout, "dock-split")
  const next = updateRoot(removed, node =>
    node.id === targetId
      ? {
          kind: "split",
          id: splitId,
          orientation,
          children: before ? [group, node] : [node, group],
          sizes: [1, 1],
        }
      : node
  )
  return { ...next, activeGroup: groupId, maximizedGroup: null }
}
export function moveTab(layout: DockLayoutJSON, tabId: string, targetId: string, index?: number) {
  const source = getGroups(layout.root).find(group => group.tabs.includes(tabId))
  return source
    ? moveGroupOrPanel(layout, { groupId: source.id, tabId }, targetId, "center", index)
    : layout
}
export function splitGroup(
  layout: DockLayoutJSON,
  tabId: string,
  targetId: string,
  position: Exclude<DockPosition, "center">
) {
  const source = getGroups(layout.root).find(group => group.tabs.includes(tabId))
  return source
    ? moveGroupOrPanel(layout, { groupId: source.id, tabId }, targetId, position)
    : layout
}
export function resizeSplit(
  layout: DockLayoutJSON,
  splitId: string,
  sizes: readonly number[]
): DockLayoutJSON {
  return updateRoot(layout, node =>
    node.kind === "split" &&
    node.id === splitId &&
    sizes.length === node.children.length &&
    sizes.every(size => Number.isFinite(size) && size > 0)
      ? { ...node, sizes: [...sizes] }
      : node
  )
}
export function toggleMaximize(layout: DockLayoutJSON, groupId: string): DockLayoutJSON {
  return findGroup(layout, groupId)
    ? {
        ...layout,
        activeGroup: groupId,
        maximizedGroup: layout.maximizedGroup === groupId ? null : groupId,
      }
    : layout
}
export function addPanel(layout: DockLayoutJSON, tabId: string, targetId?: string): DockLayoutJSON {
  if (getGroups(layout.root).some(group => group.tabs.includes(tabId)))
    return activateTab(layout, tabId)
  const target = targetId ? findGroup(layout, targetId) : getGroups(layout.root)[0]
  const hidden = layout.hidden.filter(tab => tab !== tabId)
  if (target)
    return {
      ...updateRoot(layout, node =>
        node.id === target.id ? { ...target, tabs: [...target.tabs, tabId], active: tabId } : node
      ),
      hidden,
      activeGroup: target.id,
    }
  const id = uniqueId(layout, "dock-group")
  return {
    ...layout,
    hidden,
    root: { kind: "group", id, tabs: [tabId], active: tabId },
    activeGroup: id,
  }
}
export function toJSON(layout: DockLayoutJSON): DockLayoutJSON {
  return fromJSON(JSON.parse(JSON.stringify(layout)))
}
export function fromJSON(value: unknown): DockLayoutJSON {
  const nodeIds = new Set<string>()
  const tabIds = new Set<string>()
  const fail = (): never => {
    throw new TypeError("Invalid dock layout JSON")
  }
  const record = (item: unknown): Record<string, unknown> => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail()
    return Object.fromEntries(Object.entries(item))
  }
  const parse = (item: unknown): DockNode => {
    const node = record(item)
    if (typeof node.id !== "string" || !node.id || nodeIds.has(node.id)) return fail()
    nodeIds.add(node.id)
    if (node.kind === "group") {
      if (!Array.isArray(node.tabs) || !node.tabs.length || typeof node.active !== "string")
        return fail()
      const tabs = node.tabs.map((tab: unknown) => {
        if (typeof tab !== "string" || !tab || tabIds.has(tab)) return fail()
        tabIds.add(tab)
        return tab
      })
      if (!tabs.includes(node.active)) return fail()
      return { kind: "group", id: node.id, tabs, active: node.active }
    }
    if (
      node.kind !== "split" ||
      (node.orientation !== "horizontal" && node.orientation !== "vertical") ||
      !Array.isArray(node.children) ||
      node.children.length < 2 ||
      !Array.isArray(node.sizes) ||
      node.sizes.length !== node.children.length
    )
      return fail()
    const sizes = node.sizes.map((size: unknown) =>
      typeof size === "number" && Number.isFinite(size) && size > 0 ? size : fail()
    )
    return {
      kind: "split",
      id: node.id,
      orientation: node.orientation,
      children: node.children.map(parse),
      sizes,
    }
  }
  const data = record(value)
  if (data.version !== 1 || !Array.isArray(data.hidden)) return fail()
  const root = data.root === null ? null : parse(data.root)
  const hidden = data.hidden.map((tab: unknown) => {
    if (typeof tab !== "string" || !tab || tabIds.has(tab)) return fail()
    tabIds.add(tab)
    return tab
  })
  const groups = getGroups(root)
  const groupId = (id: unknown) =>
    id === null
      ? null
      : typeof id === "string" && groups.some(group => group.id === id)
        ? id
        : fail()
  return {
    version: 1,
    root,
    hidden,
    activeGroup: groupId(data.activeGroup),
    maximizedGroup: groupId(data.maximizedGroup),
  }
}

export interface DockBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
export function resolveDropPosition(
  bounds: DockBounds,
  x: number,
  y: number,
  edgeFraction: number
): DockPosition | null {
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    x < bounds.x ||
    y < bounds.y ||
    x > bounds.x + bounds.width ||
    y > bounds.y + bounds.height
  )
    return null
  const dx = (x - bounds.x) / bounds.width
  const dy = (y - bounds.y) / bounds.height
  const distances: readonly [DockPosition, number][] = [
    ["left", dx],
    ["right", 1 - dx],
    ["top", dy],
    ["bottom", 1 - dy],
  ]
  const nearest = distances.reduce<readonly [DockPosition, number]>(
    (best, entry) => (entry[1] < best[1] ? entry : best),
    ["center", 1]
  )
  return nearest[1] < edgeFraction ? nearest[0] : "center"
}
