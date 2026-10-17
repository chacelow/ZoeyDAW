import { useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode, Ref } from "react"
import { useGpuix } from "@gpuix/react"
import type { KeyEvent, PublicInstance, StyleDesc } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"

import type { IconName } from "@/ui/controls/Icon"
import { activateTab, closeTab, findGroup, getGroups, hideTab, moveGroupOrPanel, toggleMaximize } from "./model"
import type { DockBounds, DockLayoutJSON } from "./model"
import { useDockDrag, readBounds } from "./useDockDrag"
import { DockFrame, DockTree, DropOverlay } from "./DockTree"
import type { FrameProps } from "./DockTree"

export * from "./model"
export interface DockPanelRegistration {
  readonly title: string
  readonly icon?: IconName
  readonly render: () => ReactNode
  readonly minimumSize: number
  readonly closable: boolean
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
  const { renderer } = useGpuix()
  const tabRefs = useRef(new Map<string, PublicInstance>())
  const restoreFocus = useRef(false)
  const focusedGroup = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!restoreFocus.current) return
    restoreFocus.current = false
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
  const rootBounds = useRef<DockBounds>({ x: 0, y: 0, width: 0, height: 0 })
  const [contentBounds, setContentBounds] = useState<ReadonlyMap<string, DockBounds>>(new Map())
  const commit = (next: DockLayoutJSON, restoreTabFocus = true) => {
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
    if (next !== layout) onLayoutChange(next)
  }
  const drag = useDockDrag({
    layout,
    onLayoutChange: next => commit(next),
    edgeFraction: theme.design.dock.edgeFraction,
    stripHeight: theme.design.dock.stripHeight,
    groups,
    tabs,
  })
  const groupList = getGroups(layout.root)
  useImperativeHandle(ref, () => ({
    executeCommand: command => {
      const group =
        (focusedGroup.current && findGroup(layout, focusedGroup.current)) ||
        (layout.activeGroup ? findGroup(layout, layout.activeGroup) : groupList[0])
      if (!group) return false
      if (command === "close") {
        if (!registry[group.active]?.closable) return false
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
    onContentLayout: (id, event) => {
      const box = readBounds(event)
      if (!box) return
      setContentBounds(previous => {
        const old = previous.get(id)
        if (
          old &&
          old.x === box.x &&
          old.y === box.y &&
          old.width === box.width &&
          old.height === box.height
        )
          return previous
        const next = new Map(previous)
        next.set(id, box)
        return next
      })
    },
  }
  const maximized = layout.maximizedGroup ? findGroup(layout, layout.maximizedGroup) : null
  return (
    <div
      testId={testId}
      onKeyDown={event => {
        drag.keyDown(event)
        if (!event.defaultPrevented) onKeyDown?.(event)
      }}
      onLayout={event => {
        const box = readBounds(event)
        if (box) rootBounds.current = box
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
      {maximized ? (
        <DockFrame {...shared} group={maximized} />
      ) : layout.root ? (
        <DockTree {...shared} node={layout.root} />
      ) : null}
      {Object.entries(registry).map(([tabId, registration]) => {
        if (!layout.hidden.includes(tabId) && !groupList.some(group => group.tabs.includes(tabId)))
          return null
        const group = groupList.find(
          candidate => candidate.active === tabId && (!maximized || candidate.id === maximized.id)
        )
        const box = group && contentBounds.get(group.id)
        const visible = !!box
        return (
          <div
            key={tabId}
            testId={`${testId}-content-${tabId}`}
            role="tabpanel"
            aria-label={registration.title}
            onMouseDown={() => {
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
              backgroundColor: theme.colors.background,
              color: theme.colors.foreground,
            }}
          >
            {registration.render()}
          </div>
        )
      })}
      {drag.target ? (
        <DropOverlay
          target={drag.target}
          box={groups.current.get(drag.target.groupId)}
          root={rootBounds.current}
          tabs={tabs.current}
          layout={layout}
          testId={testId}
        />
      ) : null}
    </div>
  )
}
