import { useLayoutEffect, useRef, useState } from "react"
import type { ReactNode, RefObject } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, KeyEvent, PublicInstance } from "@gpuix/react"
import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  ContextMenu,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  ContextMenuContent,
  ContextMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  IconSlot,
} from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { Group } from "../Group"
import { Panel } from "../Panel"
import type { PanelImperativeHandle } from "../Panel"
import { PanelDivider } from "../PanelDivider"
import {
  addPanel,
  getGroups,
  activateTab,
  closeTab,
  closeOtherTabs,
  findGroup,
  hideTab,
  moveGroupOrPanel,
  resizeSplit,
  toggleMaximize,
} from "./model"
import type { DockBounds, DockGroup, DockLayoutJSON, DockNode, DockOrientation } from "./model"
import type { DockLabels, DockPanelRegistry } from "./index"
import { readBounds } from "./useDockDrag"
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
  onContentLayout: (id: string, event: EventPayload) => void
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
  const measurements = useRef<number[]>([])
  const panels = useRef(new Map<string, PanelImperativeHandle>())
  useLayoutEffect(() => {
    if (node.kind !== "split") return
    const weights = node.sizes.reduce((sum, size) => sum + size, 0)
    const pixels = node.children.reduce(
      (sum, child) => sum + (panels.current.get(child.id)?.getSize().inPixels ?? 0),
      0
    )
    if (pixels <= 0) return
    node.children.forEach((child, index) => {
      const panel = panels.current.get(child.id)
      const target = ((node.sizes[index] ?? 1) / weights) * pixels
      if (panel && Math.abs(panel.getSize().inPixels - target) > 0.01) panel.resize(target)
    })
  }, [node])
  if (node.kind === "group") return <DockFrame {...props} group={node} />
  const total = node.sizes.reduce((sum, size) => sum + size, 0)
  return (
    <Group
      key={`${node.id}:${node.children.map(child => child.id).join(":")}`}
      orientation={node.orientation}
      testId={`${props.testId}-split-${node.id}`}
    >
      {node.children.flatMap((child, index) => {
        const panel = (
          <Panel
            key={child.id}
            panelRef={instance => {
              if (instance) panels.current.set(child.id, instance)
              else panels.current.delete(child.id)
            }}
            defaultSize={`${((node.sizes[index] ?? 1) / total) * 100}%`}
            minSize={minimumSize(child, node.orientation, props.registry, theme.project.panelGap)}
            onResize={size => {
              measurements.current[index] = size.asPercentage
              if (
                measurements.current.length !== node.children.length ||
                measurements.current.some(value => !Number.isFinite(value) || value <= 0)
              )
                return
              const sum = measurements.current.reduce((value, item) => value + item, 0)
              if (Math.abs(sum - 100) > 0.01) return
              if (
                node.sizes.every(
                  (value, i) =>
                    Math.abs((value / total) * 100 - (measurements.current[i] ?? 0)) < 0.01
                )
              )
                return
              props.commit(resizeSplit(props.layout, node.id, measurements.current))
            }}
          >
            <DockTree {...props} node={child} />
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
export function DockFrame({ group, ...props }: FrameProps & { group: DockGroup }) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const refs = props.tabRefs
  const [hovered, setHovered] = useState(false)
  const [compactActions, setCompactActions] = useState(false)
  const actionsVisible = hovered || props.layout.activeGroup === group.id
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
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)
  const visiblePanels = new Set(getGroups(props.layout.root).flatMap(item => item.tabs))
  const availablePanels = Object.entries(props.registry).filter(([id]) => !visiblePanels.has(id))
  const menuItems = (tabId: string): ReactNode => (
    <>
      <ContextMenuItem
        disabled={!props.registry[tabId]?.closable}
        onSelect={() => props.commit(closeTab(props.layout, tabId))}
      >
        {props.labels.close}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          props.commit(
            closeOtherTabs(props.layout, tabId, id => props.registry[id]?.closable ?? false)
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
      onLayout={event => {
        const box = readBounds(event)
        if (box) props.groups.current.set(group.id, box)
        if (box) setCompactActions(box.width < theme.design.dock.compactActionsBelow)
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        borderWidth: theme.design.shape.panelBorderWidth,
        borderColor: theme.colors.border,
        borderRadius: theme.design.shape.panelRadius,
        backgroundColor: theme.colors.background,
      }}
    >
      <div
        testId={`${props.testId}-header-${group.id}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          flexDirection: "row",
          flexShrink: 0,
          height: theme.design.dock.stripHeight,
          minWidth: 0,
          backgroundColor: theme.colors.card,
          borderBottomWidth: theme.project.panelBorder,
          borderColor: theme.colors.border,
        }}
      >
        <div
          role="tablist"
          style={{
            display: "flex",
            flexDirection: "row",
            flexGrow: 1,
            minWidth: 0,
            gap: theme.project.panelBorder,
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
                onMouseEnter={() => setHoveredTab(tabId)}
                onMouseLeave={() => setHoveredTab(current => (current === tabId ? null : current))}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  flexShrink: 0,
                  alignItems: "center",
                  backgroundColor: active ? theme.colors.background : "transparent",
                  borderRadius: theme.design.shape.controlRadius,
                }}
              >
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <Button
                      ref={instance => {
                        if (instance) refs.current.set(tabId, instance)
                        else refs.current.delete(tabId)
                      }}
                      testId={`${props.testId}-tab-${tabId}`}
                      role="tab"
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      variant="ghost"
                      active={false}
                      label={registration.title}
                      icon={registration.icon ? <Icon name={registration.icon} /> : undefined}
                      style={{
                        height: theme.design.dock.stripHeight,
                        maxWidth: theme.design.dock.tabMaxWidth,
                        paddingLeft: theme.design.dock.tabPadding,
                        paddingRight: theme.design.dock.tabPadding,
                        flexShrink: 0,
                        borderWidth: 0,
                        backgroundColor: "transparent",
                        color: active ? theme.colors.foreground : theme.colors.mutedForeground,
                        hover: {
                          backgroundColor: theme.colors.muted,
                          color: theme.colors.foreground,
                        },
                        active: {
                          backgroundColor: theme.colors.muted,
                          color: theme.colors.foreground,
                        },
                      }}
                      onLayout={event => {
                        const box = readBounds(event)
                        if (box) props.tabs.current.set(tabId, box)
                      }}
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
                    >
                      {registration.title}
                    </Button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>{menuItems(tabId)}</ContextMenuContent>
                </ContextMenu>
                {registration.closable ? (
                  <Button
                    iconOnly
                    variant="ghost"
                    tabIndex={active ? 0 : -1}
                    label={`${props.labels.close} ${registration.title}`}
                    testId={`${props.testId}-close-${tabId}`}
                    style={{
                      opacity: active || hoveredTab === tabId ? 1 : 0,
                      pointerEvents: active || hoveredTab === tabId ? "auto" : "none",
                      height: theme.design.dock.stripHeight - theme.project.panelBorder * 2,
                      width: theme.design.dock.stripHeight - theme.project.panelBorder * 2,
                    }}
                    onFocus={claimFocus}
                    onKeyDown={keyDown}
                    onClick={() => props.commit(closeTab(props.layout, tabId))}
                  >
                    <IconSlot>
                      <Icon name="X" />
                    </IconSlot>
                  </Button>
                ) : null}
              </div>
            )
          })}
        </div>
        <div
          testId={`${props.testId}-actions-${group.id}`}
          style={{
            display: "flex",
            flexDirection: "row",
            flexShrink: 0,
            alignItems: "center",
            opacity: actionsVisible ? 1 : 0,
            pointerEvents: actionsVisible ? "auto" : "none",
          }}
        >
          {!compactActions ? (
            <>
              <Button
                iconOnly
                variant="ghost"
                label={props.labels.dragGroup}
                testId={`${props.testId}-drag-group-${group.id}`}
                onMouseDown={event => props.drag.start({ groupId: group.id }, event)}
                onMouseMove={props.drag.move}
                onMouseUp={props.drag.release}
                onKeyDown={keyDown}
                onBlur={props.drag.cancel}
                onFocus={claimFocus}
              >
                <IconSlot>
                  <Icon name="GripVertical" />
                </IconSlot>
              </Button>
              <Button
                iconOnly
                variant="ghost"
                label={
                  props.layout.maximizedGroup === group.id
                    ? props.labels.restore
                    : props.labels.maximize
                }
                testId={`${props.testId}-maximize-${group.id}`}
                onFocus={claimFocus}
                onKeyDown={keyDown}
                onClick={() => props.commit(toggleMaximize(props.layout, group.id))}
              >
                <IconSlot>
                  <Icon
                    name={props.layout.maximizedGroup === group.id ? "Minimize2" : "Maximize2"}
                  />
                </IconSlot>
              </Button>
            </>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                iconOnly
                variant="ghost"
                label={props.labels.more}
                testId={`${props.testId}-more-${group.id}`}
                onFocus={claimFocus}
                onKeyDown={keyDown}
              >
                <IconSlot>
                  <Icon name="Ellipsis" />
                </IconSlot>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {menuItems(group.active)}
              <DropdownMenuItem
                testId={`${props.testId}-maximize-menu-${group.id}`}
                onSelect={() => props.commit(toggleMaximize(props.layout, group.id))}
              >
                {props.layout.maximizedGroup === group.id
                  ? props.labels.restore
                  : props.labels.maximize}
              </DropdownMenuItem>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        onLayout={event => props.onContentLayout(group.id, event)}
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
  const tab = target.index !== undefined ? group?.tabs[target.index] : undefined
  const tabBox = tab ? tabs.get(tab) : undefined
  const last = group?.tabs.at(-1)
  const lastBox = last ? tabs.get(last) : undefined
  const insertionX = tabBox?.x ?? (lastBox ? lastBox.x + lastBox.width : box.x)
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
            ? theme.project.panelBorder
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
