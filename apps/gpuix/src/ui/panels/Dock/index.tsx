import { memo, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ReactNode, Ref } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, KeyEvent, PublicInstance, StyleDesc } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { consumeKey } from "@/shared/keyboard"
import { DividerLayer } from "../DividerLayer"
import { DockBorderBars, DockBorderPanel } from "./Borders"
import { MenuActivityContext } from "@/ui/controls/Menu/context"
import { PanelEnvironmentContext } from "../PanelEnvironment"

import type { IconName } from "@/ui/controls/Icon"
import { activateTab, borderGroupId, borderTabs, closeTab, dockBorderSides, findBorder, findGroup, getBorderTabs, getGroups, hideTab, moveGroupOrPanel, selectBorderTab, toggleMaximize } from "./model"
import type { DockBorderSide, DockBounds, DockLayoutJSON } from "./model"
import { useDockDrag, readBounds } from "./useDockDrag"
import { DockFrame, DockTree, DropOverlay } from "./DockTree"
import type { FrameProps } from "./DockTree"
import { borderGeometry } from "./border-geometry"
import { projectDockGroups } from "./dock-geometry"
import { borderRailBounds } from "./border-rails"

export * from "./model"
export { DockViewMenu } from "./DockViewMenu"
export { DockLayoutToggles } from "./DockLayoutToggles"
export interface DockPanelRegistration {
  readonly title: string
  readonly icon?: IconName
  readonly render: () => ReactNode
  readonly minimumSize: number
}
export type DockPanelRegistry = Readonly<Record<string, DockPanelRegistration>>
export type DockCommand =
  "moveLeft" | "moveRight" | "moveUp" | "moveDown" | "toggleMaximize" | "close" | "hide"
export interface DockLayoutHandle {
  executeCommand: (command: DockCommand) => boolean
}
export interface DockLabels {
  readonly close: string
  readonly closeOthers: string
  readonly splitRight: string
  readonly splitDown: string
  readonly maximize: string
  readonly restore: string
  readonly hide: string
  readonly dragGroup: string
  readonly more: string
  readonly showPanels: string
  readonly view: string
  readonly pin: string
  readonly unpin: string
  readonly left: string
  readonly right: string
  readonly bottom: string
  readonly railOptions: string
  readonly overlayMode: string
  readonly hoverReveal: string
}
export interface DockLayoutProps {
  readonly layout: DockLayoutJSON
  readonly registry: DockPanelRegistry
  readonly onLayoutChange: (layout: DockLayoutJSON) => void
  readonly labels: DockLabels
  readonly ref?: Ref<DockLayoutHandle>
  readonly onFocusChange?: (focused: boolean) => void
  readonly onKeyDown?: (event: KeyEvent) => void
  readonly style?: StyleDesc
  readonly testId?: string
}
const DockContent = memo(function DockContent({ render }: { render: () => ReactNode }) { return <>{render()}</> })
export function DockLayout({
  layout,
  registry,
  onLayoutChange,
  labels,
  ref,
  onFocusChange,
  onKeyDown,
  style,
  testId = "dock",
}: DockLayoutProps) {
  const theme = useTheme()
  const { subscribePointer } = useContext(PanelEnvironmentContext)
  const { renderer } = useGpuix()
  const tabRefs = useRef(new Map<string, PublicInstance>())
  const restoreFocus = useRef(false)
  const preferredFocus = useRef<string | null>(null)
  const focusedGroup = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!restoreFocus.current) return
    restoreFocus.current = false
    if (preferredFocus.current) {
      const tab = tabRefs.current.get(preferredFocus.current)
      const side = findBorder(layout, preferredFocus.current)
      focusedGroup.current = side ? borderGroupId(side) : getGroups(layout.root).find(group => group.tabs.includes(preferredFocus.current ?? ""))?.id ?? null
      preferredFocus.current = null
      if (tab) { renderer?.focusElement?.(tab.id); return }
    }
    const active = layout.activeGroup && findGroup(layout, layout.activeGroup)
    const instance = active && tabRefs.current.get(active.active)
    if (instance) {
      focusedGroup.current = active ? active.id : null
      renderer?.focusElement?.(instance.id)
      onFocusChange?.(true)
    }
  }, [layout, renderer, onFocusChange])
  const groups = useRef(new Map<string, DockBounds>())
  const tabs = useRef(new Map<string, DockBounds>())
  const latestLayout = useRef(layout)
  useLayoutEffect(() => { latestLayout.current = layout }, [layout])
  const hoverCloseTimer = useRef<NodeJS.Timeout | undefined>(undefined)
  useEffect(() => () => clearTimeout(hoverCloseTimer.current), [])
  const openMenus = useRef(0)
  const pendingHoverLeave = useRef<(() => void) | undefined>(undefined)
  const holdMenuOpen = useCallback(() => {
    openMenus.current++
    clearTimeout(hoverCloseTimer.current)
    return () => {
      openMenus.current--
      if (openMenus.current === 0) pendingHoverLeave.current?.()
    }
  }, [])
  const borders = useRef(new Map<DockBorderSide, DockBounds>())
  const rootBounds = useRef<DockBounds>({ x: 0, y: 0, width: 0, height: 0 })
  const [root, setRootBounds] = useState<DockBounds>(rootBounds.current)
  const visitedPanels = useRef(new Set<string>())
  const commit = useCallback((next: DockLayoutJSON, restoreTabFocus = true) => {
    const currentGroup = layout.activeGroup && findGroup(layout, layout.activeGroup)
    const nextGroup = next.activeGroup && findGroup(next, next.activeGroup)
    if (
      restoreTabFocus && (
        layout.activeGroup !== next.activeGroup ||
        layout.maximizedGroup !== next.maximizedGroup ||
        (currentGroup && nextGroup && currentGroup.active !== nextGroup.active)
      )
    )
      restoreFocus.current = true
    for (const side of dockBorderSides) {
      if (layout.borders[side]?.selected !== next.borders[side]?.selected) {
        restoreFocus.current = true
        if (next.borders[side]?.selected) preferredFocus.current = next.borders[side]?.selected ?? null
      }
    }
    for (const side of dockBorderSides) {
      const previous = layout.borders[side]?.selected
      if (previous && !dockBorderSides.some(candidate => next.borders[candidate]?.selected) && borderTabs(next.borders[side]).includes(previous)) preferredFocus.current = previous
    }
    const maximizedSide = dockBorderSides.find(side => borderGroupId(side) === (next.maximizedGroup ?? layout.maximizedGroup))
    if (maximizedSide && next.borders[maximizedSide]?.selected) preferredFocus.current = next.borders[maximizedSide]?.selected ?? null
    if (next !== layout) onLayoutChange(next)
  }, [layout, onLayoutChange])
  const drag = useDockDrag({
    layout,
    onLayoutChange: next => commit(next),
    tabRefs,
    edgeFraction: theme.design.dock.edgeFraction,
    stripHeight: theme.design.dock.stripHeight,
    groups,
    tabs,
    borders,
    borderSize: theme.design.dock.borderSize,
    rootBounds,
  })
  const groupList = getGroups(layout.root)
  useImperativeHandle(ref, () => ({
    executeCommand: command => {
      const side = dockBorderSides.find(candidate => borderGroupId(candidate) === focusedGroup.current)
      const selected = side ? layout.borders[side]?.selected : null
      if (selected && (command === "close" || command === "hide")) {
        commit(command === "close" ? closeTab(layout, selected) : hideTab(layout, selected))
        return true
      }
      if (side && selected && command === "toggleMaximize") { commit(toggleMaximize(layout, borderGroupId(side))); return true }
      const group =
        (focusedGroup.current && findGroup(layout, focusedGroup.current)) ||
        (layout.activeGroup ? findGroup(layout, layout.activeGroup) : groupList[0])
      if (!group) return false
      if (command === "close") {
        if (!Object.hasOwn(registry, group.active)) return false
        commit(closeTab(layout, group.active))
      } else if (command === "hide") commit(hideTab(layout, group.active))
      else if (command === "toggleMaximize") commit(toggleMaximize(layout, group.id))
      else {
        const from = groups.current.get(group.id)
        if (!from) return false
        const direction =
          command === "moveLeft"
            ? "left"
            : command === "moveRight"
              ? "right"
              : command === "moveUp"
                ? "top"
                : "bottom"
        const horizontal = direction === "left" || direction === "right"
        const origin = horizontal ? from.x + from.width / 2 : from.y + from.height / 2
        const candidates = groupList
          .flatMap(candidate => {
            const box = groups.current.get(candidate.id)
            if (!box || candidate.id === group.id) return []
            const delta = (horizontal ? box.x + box.width / 2 : box.y + box.height / 2) - origin
            if (direction === "left" || direction === "top" ? delta >= 0 : delta <= 0) return []
            const cross = horizontal
              ? Math.abs(box.y + box.height / 2 - from.y - from.height / 2)
              : Math.abs(box.x + box.width / 2 - from.x - from.width / 2)
            return [{ id: candidate.id, distance: Math.abs(delta) + cross }]
          })
          .sort((a, b) => a.distance - b.distance)
        const target = candidates[0]
        if (!target) return false
        commit(
          moveGroupOrPanel(layout, { groupId: group.id, tabId: group.active }, target.id, "center")
        )
      }
      return true
    },
  }))
  const maximized = layout.maximizedGroup ? findGroup(layout, layout.maximizedGroup) : null
  const overlaySide = dockBorderSides.find(side => layout.borders[side]?.selected && layout.borders[side]?.visible !== false && layout.borders[side]?.type === "overlay")
  const { main, boxes } = useMemo(() => borderGeometry({ borders: layout.borders, maximizedGroup: layout.maximizedGroup }, root, theme.design.dock.stripHeight, theme.design.shape.separatorWidth, theme.design.dock.minimumSize), [layout.borders, layout.maximizedGroup, root, theme.design.dock.stripHeight, theme.design.shape.separatorWidth, theme.design.dock.minimumSize])
  const projectedGroups = useMemo(() => maximized ? new Map([[maximized.id, main]]) : projectDockGroups(layout.root, main, theme.design.shape.separatorWidth), [maximized, layout.root, main, theme.design.shape.separatorWidth])
  const projectedBorders = useMemo(() => borderRailBounds({ borders: layout.borders }, root, theme.design.dock.stripHeight), [layout.borders, root, theme.design.dock.stripHeight])
  useLayoutEffect(() => { groups.current = projectedGroups; borders.current = projectedBorders }, [projectedGroups, projectedBorders])
  useLayoutEffect(() => {
    for (const group of getGroups(layout.root)) for (const id of group.tabs) visitedPanels.current.add(id)
    for (const side of dockBorderSides) {
      const selected = layout.borders[side]?.selected
      if (selected) visitedPanels.current.add(selected)
    }
  }, [layout])
  const shared: FrameProps = {
    layout,
    registry,
    labels,
    commit,
    drag,
    groups,
    tabs,
    tabRefs,
    onGroupFocus: groupId => {
      focusedGroup.current = groupId
    },
    onFocusChange,
    onKeyDown,
    testId,
    bounds: main,
  }
  const hoverBorder = useCallback((side: DockBorderSide, tabId?: string) => {
    clearTimeout(hoverCloseTimer.current)
    hoverCloseTimer.current = undefined
    pendingHoverLeave.current = undefined
    const border = layout.borders[side]
    if (tabId && border?.type === "overlay" && border.hoverReveal && border.selected !== tabId) commit(selectBorderTab(layout, side, tabId), false)
  }, [layout, commit])
  const leaveBorder = useCallback((side: DockBorderSide, event: EventPayload) => {
    const surfaces = [boxes[side], projectedBorders.get(side)]
    if (event.x !== undefined && event.y !== undefined && surfaces.some(box => box && event.x !== undefined && event.y !== undefined && event.x >= box.x && event.x <= box.x + box.width && event.y >= box.y && event.y <= box.y + box.height)) return
    const border = layout.borders[side]
    if (border?.type !== "overlay" || !border.hoverReveal) return
    clearTimeout(hoverCloseTimer.current)
    const scheduleClose = () => {
      clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = setTimeout(() => {
        hoverCloseTimer.current = undefined
        pendingHoverLeave.current = undefined
        const latest = latestLayout.current
        if (openMenus.current === 0 && latest.borders[side]?.type === "overlay" && latest.borders[side]?.hoverReveal) commit(selectBorderTab(latest, side, null), false)
      }, theme.design.motion.dockHoverCloseDelayMs)
    }
    pendingHoverLeave.current = scheduleClose
    scheduleClose()
  }, [boxes, projectedBorders, layout.borders, commit, theme.design.motion.dockHoverCloseDelayMs])
  useLayoutEffect(() => subscribePointer?.(position => {
    const side = dockBorderSides.find(candidate => {
      const border = layout.borders[candidate]
      return border?.visible !== false && border?.type === "overlay" && border.hoverReveal && border.selected
    })
    if (!side) return
    const surfaces = [boxes[side], projectedBorders.get(side)]
    if (surfaces.some(box => box && position.x >= box.x && position.x <= box.x + box.width && position.y >= box.y && position.y <= box.y + box.height)) hoverBorder(side)
    else if (!pendingHoverLeave.current) leaveBorder(side, { ...position, elementId: 0, eventType: "mouseMove" })
  }), [subscribePointer, layout.borders, boxes, projectedBorders, hoverBorder, leaveBorder])
  const borderProps = { layout, registry, labels, commit, drag, borders, tabRefs, testId, frame: shared, hoverBorder, leaveBorder, openMenus }
  const panelIds = [...Object.keys(registry).filter(id => !findBorder(layout, id)), ...getBorderTabs(layout)]
  return (
    <MenuActivityContext.Provider value={holdMenuOpen}>
    <DividerLayer
      testId={testId}
      onKeyDown={event => {
        drag.keyDown(event)
        if (event.key === "escape" && overlaySide && !event.defaultPrevented) {
          commit(selectBorderTab(layout, overlaySide, null))
          consumeKey(event, "handled")
        }
        if (!event.defaultPrevented) onKeyDown?.(event)
      }}
      onLayout={event => {
        const box = readBounds(event)
        if (box) {
          rootBounds.current = box
          setRootBounds(previous => previous.x === box.x && previous.y === box.y && previous.width === box.width && previous.height === box.height ? previous : box)
        }
      }}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ position: "absolute", top: main.y - root.y, left: main.x - root.x, width: main.width, height: main.height, minWidth: 0, minHeight: 0 }}>
      {maximized ? (
        <DockFrame {...shared} group={maximized} />
      ) : layout.root ? (
        <DockTree {...shared} node={layout.root} />
      ) : null}
      </div>
      <DockBorderBars {...borderProps} root={root} />
      {dockBorderSides.map(side => {
        const box = boxes[side]
        return box ? <DockBorderPanel key={side} {...borderProps} side={side} box={box} root={root} /> : null
      })}
      {panelIds.map(tabId => {
        const registration = registry[tabId]
        if (!registration) return null
        const side = findBorder(layout, tabId)
        if (side && layout.borders[side]?.selected !== tabId && !visitedPanels.current.has(tabId)) return null
        if (!layout.hidden.includes(tabId) && !side && !groupList.some(group => group.tabs.includes(tabId))) return null
        const group = groupList.find(candidate => candidate.active === tabId && (!maximized || candidate.id === maximized.id))
        const surface = side && layout.borders[side]?.selected === tabId ? boxes[side] : group ? projectedGroups.get(group.id) : undefined
        const header = theme.design.dock.stripHeight + (side ? 0 : theme.design.shape.separatorWidth)
        const box = surface ? { ...surface, y: surface.y + header, height: Math.max(0, surface.height - header) } : undefined
        const visible = !!box
        return (
          <div
            key={tabId}
            testId={`${testId}-content-${tabId}`}
            role="tabpanel"
            aria-label={registration.title}
            onMouseEnter={() => { if (side) hoverBorder(side) }}
            onMouseLeave={event => { if (side) leaveBorder(side, event) }}
            onMouseDown={() => {
              if (side) { focusedGroup.current = borderGroupId(side); return }
              if (!group) return
              focusedGroup.current = group.id
              if (layout.activeGroup !== group.id) commit(activateTab(layout, tabId), false)
            }}
            style={{
              position: "absolute",
              display: visible ? "flex" : "none",
              flexDirection: "column",
              left: box ? box.x - rootBounds.current.x : 0,
              top: box ? box.y - rootBounds.current.y : 0,
              width: box?.width ?? 0,
              height: box?.height ?? 0,
              overflow: "hidden",
              backgroundColor: side ? theme.colors.card : theme.colors.background,
              color: theme.colors.foreground,
            }}
          >
            <DockContent render={registration.render} />
          </div>
        )
      })}
      {drag.target ? (
        <DropOverlay
          target={drag.target}
          box={drag.target.border ? projectedBorders.get(drag.target.border) : layout.root ? projectedGroups.get(drag.target.groupId) : rootBounds.current}
          root={rootBounds.current}
          tabs={tabs.current}
          layout={layout}
          testId={testId}
        />
      ) : null}
    </DividerLayer>
    </MenuActivityContext.Provider>
  )
}
