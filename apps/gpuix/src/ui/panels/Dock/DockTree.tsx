import { useContext, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode, RefObject } from "react"
import { useGpuix } from "@gpuix/react"
import type { KeyEvent, PublicInstance } from "@gpuix/react"
import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/ui/controls"
import { Group } from "../Group"
import { Panel } from "../Panel"
import { PanelDivider } from "../PanelDivider"
import { PanelEnvironmentContext } from "../PanelEnvironment"
import { DockTab } from "./DockTab"
import { DockGroupActions } from "./DockGroupActions"
import { splitBounds } from "./dock-geometry"
import {
  addPanel,
  getGroups,
  getBorderTabs,
  activateTab,
  closeTab,
  closeOtherTabs,
  findGroup,
  hideTab,
  moveGroupOrPanel,
  resizeSplit,
  toggleMaximize,
} from "./model"
import type { DockBorderSide, DockBounds, DockGroup, DockLayoutJSON, DockNode, DockOrientation } from "./model"
import type { DockLabels, DockPanelRegistry } from "./index"
import type { DockDragController, DockDropTarget } from "./useDockDrag"
export interface FrameProps {
  layout: DockLayoutJSON
  registry: DockPanelRegistry
  labels: DockLabels
  commit: (layout: DockLayoutJSON) => void
  drag: DockDragController
  groups: RefObject<Map<string, DockBounds>>
  tabs: RefObject<Map<string, DockBounds>>
  tabRefs: RefObject<Map<string, PublicInstance>>
  onGroupFocus: (groupId: string) => void
  onFocusChange?: (focused: boolean) => void
  onKeyDown?: (event: KeyEvent) => void
  testId: string
  bounds: DockBounds
}
function minimumSize(
  node: DockNode,
  orientation: DockOrientation,
  registry: DockPanelRegistry,
  gap: number
): number {
  if (node.kind === "group")
    return Math.max(0, ...node.tabs.map(tab => registry[tab]?.minimumSize ?? 0))
  const children = node.children.map(child => minimumSize(child, orientation, registry, gap))
  return node.orientation === orientation
    ? children.reduce((sum, value) => sum + value, 0) + gap * (children.length - 1)
    : Math.max(0, ...children)
}
export function DockTree(props: FrameProps & { node: DockNode }) {
  const theme = useTheme()
  const { node } = props
  if (node.kind === "group") return <DockFrame {...props} group={node} />
  const total = node.sizes.reduce((sum, size) => sum + size, 0)
  const boxes = splitBounds(node, props.bounds, theme.design.shape.separatorWidth)
  return (
    <Group
      key={`${node.id}:${node.children.map(child => child.id).join(":")}`}
      orientation={node.orientation}
      testId={`${props.testId}-split-${node.id}`}
      weights={node.sizes}
      extent={node.orientation === "horizontal" ? props.bounds.width : props.bounds.height}
      bounds={props.bounds}
      onLayoutChange={sizes => {
        const pixels = sizes.reduce((sum, size) => sum + size, 0)
        if (pixels <= 0 || sizes.some(size => size <= 0)) return
        if (node.sizes.every((weight, index) => Math.abs(weight / total - sizes[index] / pixels) < 0.0001)) return
        props.commit(resizeSplit(props.layout, node.id, sizes))
      }}
    >
      {node.children.flatMap((child, index) => {
        const panel = (
          <Panel
            key={child.id}
            minSize={minimumSize(child, node.orientation, props.registry, theme.design.shape.separatorWidth)}
          >
            <DockTree {...props} bounds={boxes[index]} node={child} />
          </Panel>
        )
        return index === 0
          ? [panel]
          : [
              <PanelDivider
                key={`divider-${child.id}`}
                orientation={node.orientation === "horizontal" ? "vertical" : "horizontal"}
                testId={`${props.testId}-divider-${node.id}-${index}`}
              />,
              panel,
            ]
      })}
    </Group>
  )
}
export function DockFrame({ group, borderSide, ...props }: FrameProps & { group: DockGroup; borderSide?: DockBorderSide }) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const refs = props.tabRefs
  const [hovered, setHovered] = useState(false)
  const { subscribePointer } = useContext(PanelEnvironmentContext)
  useLayoutEffect(() => subscribePointer?.(point => {
    const box = props.bounds
    setHovered(point.x >= box.x && point.x < box.x + box.width && point.y >= box.y && point.y < box.y + theme.design.dock.stripHeight)
  }), [subscribePointer, props.bounds, theme.design.dock.stripHeight])
  const compactMode = useRef(false)
  const compactActions = !borderSide && props.bounds.width < theme.design.dock.compactActionsBelow + (compactMode.current ? theme.control["--spacing-control-track"] : 0)
  useLayoutEffect(() => { compactMode.current = compactActions }, [compactActions])
  const actionsVisible = hovered
  const focus = (tabId: string) => {
    props.onFocusChange?.(true)
    props.commit(activateTab(props.layout, tabId))
  }
  const claimFocus = () => {
    props.onGroupFocus(group.id)
    props.onFocusChange?.(true)
  }
  const keyDown = (event: KeyEvent) => {
    props.drag.keyDown(event)
    if (!event.defaultPrevented) props.onKeyDown?.(event)
  }
  const visiblePanels = new Set([...getGroups(props.layout.root).flatMap(item => item.tabs), ...getBorderTabs(props.layout)])
  const availablePanels = Object.entries(props.registry).filter(([id]) => !visiblePanels.has(id))
  const menuItems = (tabId: string): ReactNode => (
    <>
      <ContextMenuItem
        onSelect={() => props.commit(closeTab(props.layout, tabId))}
      >
        {props.labels.close}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          props.commit(
            closeOtherTabs(props.layout, tabId)
          )
        }
      >
        {props.labels.closeOthers}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={group.tabs.length < 2}
        onSelect={() =>
          props.commit(
            moveGroupOrPanel(props.layout, { groupId: group.id, tabId }, group.id, "right")
          )
        }
      >
        {props.labels.splitRight}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={group.tabs.length < 2}
        onSelect={() =>
          props.commit(
            moveGroupOrPanel(props.layout, { groupId: group.id, tabId }, group.id, "bottom")
          )
        }
      >
        {props.labels.splitDown}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => props.commit(hideTab(props.layout, tabId))}>
        {props.labels.hide}
      </ContextMenuItem>
    </>
  )
  return (
    <div
      role="group"
      aria-label={props.registry[group.active]?.title}
      testId={`${props.testId}-group-${group.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: borderSide ? theme.colors.card : theme.colors.background,
      }}
    >
      <div
        testId={`${props.testId}-header-${group.id}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={event => {
          const box = props.bounds
          if (event.x !== undefined && event.y !== undefined && event.x >= box.x && event.x < box.x + box.width && event.y >= box.y && event.y < box.y + theme.design.dock.stripHeight) return
          setHovered(false)
        }}
        style={{
          display: "flex",
          flexDirection: "row",
          flexShrink: 0,
          height: theme.design.dock.stripHeight,
          minWidth: 0,
          alignItems: "center",
          paddingLeft: theme.control["--spacing-control-track-pad"],
          paddingRight: theme.control["--spacing-control-track-pad"],
          backgroundColor: theme.colors.card,
        }}
      >
        {borderSide ? (
          <text
            testId={`${props.testId}-title-${group.id}`}
            style={{
              flexGrow: 1,
              minWidth: 0,
              color: theme.colors.mutedForeground,
              fontSize: theme.control["--text-control-track"],
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {props.registry[group.active]?.title.toLocaleUpperCase()}
          </text>
        ) : (
        <div
          role="tablist"
          style={{
            display: "flex",
            flexDirection: "row",
            flexGrow: 1,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            alignItems: "center",
          }}
        >
          {group.tabs.map((tabId, index) => {
            const registration = props.registry[tabId]
            if (!registration) throw new RangeError(`Unregistered dock panel: ${tabId}`)
            const active = group.active === tabId
            return (
              <div
                key={tabId}
                testId={`${props.testId}-tab-frame-${tabId}`}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  flexShrink: 0,
                  alignItems: "center",
                  borderLeftWidth: index > 0 ? theme.design.shape.separatorWidth : 0,
                  borderColor: theme.colors.border,
                  backgroundColor: active ? theme.colors.background : "transparent",
                }}
              >
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <DockTab
                      ref={instance => {
                        if (instance) refs.current.set(tabId, instance)
                        else refs.current.delete(tabId)
                      }}
                      testId={`${props.testId}-tab-${tabId}`}
                      selected={active}
                      title={registration.title}
                      icon={registration.icon}
                      closeLabel={`${props.labels.close} ${registration.title}`}
                      closeTestId={`${props.testId}-close-${tabId}`}
                      onClose={() => props.commit(closeTab(props.layout, tabId))}
                      onFocus={claimFocus}
                      onBlur={() => {
                        props.drag.cancel()
                        props.onFocusChange?.(false)
                      }}
                      onMouseDown={event => props.drag.start({ groupId: group.id, tabId }, event)}
                      onMouseMove={props.drag.move}
                      onMouseUp={props.drag.release}
                      onClick={() => props.drag.click(() => focus(tabId))}
                      onKeyDown={event => {
                        keyDown(event)
                        if (
                          event.defaultPrevented ||
                          (event.key !== "left" && event.key !== "right")
                        )
                          return
                        if (
                          event.modifiers?.ctrl ||
                          event.modifiers?.cmd ||
                          event.modifiers?.alt ||
                          event.modifiers?.shift
                        )
                          return
                        const next =
                          group.tabs[
                            (index + (event.key === "right" ? 1 : group.tabs.length - 1)) %
                              group.tabs.length
                          ]
                        const instance = next && refs.current.get(next)
                        if (instance) renderer?.focusElement?.(instance.id)
                        consumeKey(event, "handled")
                      }}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent>{menuItems(tabId)}</ContextMenuContent>
                </ContextMenu>
              </div>
            )
          })}
        </div>
        )}
        <DockGroupActions groupId={group.id} visible={actionsVisible} compact={compactActions}
          draggable={!borderSide} maximized={props.layout.maximizedGroup === group.id}
          labels={props.labels} drag={props.drag}
          onMaximize={() => props.commit(toggleMaximize(props.layout, group.id))}
          onFocus={claimFocus} onKeyDown={keyDown} testId={props.testId}>
              {menuItems(group.active)}
              {availablePanels.length ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger testId={`${props.testId}-show-panels-${group.id}`}>
                    {props.labels.showPanels}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {availablePanels.map(([id, registration]) => (
                      <DropdownMenuItem
                        key={id}
                        testId={`${props.testId}-show-${id}`}
                        onSelect={() => props.commit(addPanel(props.layout, id, group.id))}
                      >
                        {registration.title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
        </DockGroupActions>
      </div>
      {!borderSide ? <div style={{ height: theme.design.shape.separatorWidth, flexShrink: 0, backgroundColor: theme.colors.border }} /> : null}
      <div
        style={{ flexGrow: 1, minHeight: 0, minWidth: 0 }}
      />
    </div>
  )
}
export function DropOverlay({
  target,
  box,
  root,
  tabs,
  layout,
  testId,
}: {
  target: DockDropTarget
  box?: DockBounds
  root: DockBounds
  tabs: Map<string, DockBounds>
  layout: DockLayoutJSON
  testId: string
}) {
  const theme = useTheme()
  if (!box) return null
  const left = target.position === "right" ? box.width / 2 : 0
  const top = target.position === "bottom" ? box.height / 2 : 0
  const horizontal = target.position === "left" || target.position === "right"
  const vertical = target.position === "top" || target.position === "bottom"
  const group = findGroup(layout, target.groupId)
  const first = group?.tabs[0]
  const previous = target.index !== undefined ? group?.tabs[target.index - 1] : undefined
  const previousBox = previous ? tabs.get(previous) : undefined
  const firstBox = first ? tabs.get(first) : undefined
  const insertionX = previousBox
    ? previousBox.x + previousBox.width
    : (firstBox?.x ?? box.x)
  return (
    <div
      testId={`${testId}-drop-preview`}
      style={{
        position: "absolute",
        pointerEvents: "none",
        left: target.index === undefined ? box.x - root.x + left : insertionX - root.x,
        top: box.y - root.y + top,
        width:
          target.index !== undefined
            ? theme.design.shape.separatorWidth
            : horizontal
              ? box.width / 2
              : box.width,
        height:
          target.index !== undefined
            ? theme.design.dock.stripHeight
            : vertical
              ? box.height / 2
              : box.height,
        backgroundColor: theme.colors.primary,
        opacity:
          target.index !== undefined
            ? theme.design.dock.insertionOpacity
            : target.position === "center"
              ? theme.design.dock.centerOverlayOpacity
              : theme.design.dock.edgeOverlayOpacity,
      }}
    />
  )
}
