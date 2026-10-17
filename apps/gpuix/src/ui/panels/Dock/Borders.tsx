import { Fragment, useContext, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, Props, PublicInstance } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { consumeKey } from "@/shared/keyboard"
import {
  ToolbarIconButton,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconSlot,
} from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import type { IconName } from "@/ui/controls/Icon"
import { DividerHitArea } from "../Separator/DividerHitArea"
import { useDividerDrag } from "../useDividerDrag"
import { useResizeCommit } from "../useResizeCommit"
import { PanelEnvironmentContext } from "../PanelEnvironment"
import { DockFrame } from "./DockTree"
import type { FrameProps } from "./DockTree"
import {
  borderGroupId,
  borderTabs,
  closeTab,
  dockBorderSides,
  resizeBorder,
  selectBorderTab,
  setBorderType,
  setBorderHoverReveal,
} from "./model"
import type { DockBorderSide, DockBounds, DockLayoutJSON } from "./model"
import type { DockLayoutProps } from "./index"
import { borderRailBounds } from "./border-rails"
import type { DockDragController } from "./useDockDrag"

type BorderProps = Pick<DockLayoutProps, "layout" | "registry" | "labels"> & {
  preview: (layout: DockLayoutJSON | null) => void
  commit: DockLayoutProps["onLayoutChange"]
  drag: DockDragController
  borders: RefObject<Map<DockBorderSide, DockBounds>>
  tabRefs: RefObject<Map<string, PublicInstance>>
  testId: string
  frame: FrameProps
  hoverBorder: (side: DockBorderSide, tabId?: string) => void
  leaveBorder: (side: DockBorderSide, event: EventPayload) => void
  openMenus: RefObject<number>
}
function DockRailButton({
  label,
  icon,
  selected = false,
  indicator = true,
  bottom,
  onClick,
  onKeyDown,
  ...props
}: Props & {
  label: string
  icon: IconName
  selected?: boolean
  bottom: boolean
  indicator?: boolean
}) {
  const theme = useTheme()
  return (
    <div
      {...props}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      tabIndex={props.tabIndex ?? 0}
      onClick={onClick}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (!event.defaultPrevented && event.key === "enter") {
          onClick?.(event)
          consumeKey(event, "handled")
        }
      }}
      style={{
        display: "flex",
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
        width: theme.design.dock.stripHeight,
        height: theme.design.dock.stripHeight,
        flexShrink: 0,
        color: selected ? theme.colors.foreground : theme.colors.mutedForeground,
        backgroundColor: "transparent",
        cursor: theme.design.cursors.action,
        userSelect: "none",
        keyboardFocusDim: false,
        hover: { backgroundColor: theme.colors.secondary, color: theme.colors.foreground },
        focusVisible: {
          outlineWidth: theme.design.shape.focusRingWidth,
          outlineColor: theme.colors.ring,
          outlineOffset: -theme.design.shape.focusRingWidth,
        },
      }}
    >
      <div style={{ pointerEvents: "none" }}>
        <IconSlot>
          <Icon name={icon} />
        </IconSlot>
      </div>
      {selected && indicator ? (
        <div
          testId={`${props.testId}-indicator`}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: bottom ? "100%" : theme.design.dock.activeIndicatorWidth,
            height: bottom ? theme.design.dock.activeIndicatorWidth : "100%",
            backgroundColor: theme.colors.primary,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  )
}
function BorderOptions({
  side,
  prefix,
  ...props
}: BorderProps & { side: DockBorderSide; prefix: string }) {
  const border = props.layout.borders[side]
  if (!border) return null
  return (
    <>
      <DropdownMenuCheckboxItem
        testId={`${prefix}-mode-${side}`}
        checked={border.type === "overlay"}
        onCheckedChange={checked =>
          props.commit(setBorderType(props.layout, side, checked ? "overlay" : "split"))
        }
      >
        {props.labels.overlayMode}
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        testId={`${prefix}-hover-${side}`}
        checked={border.hoverReveal === true}
        disabled={border.type !== "overlay"}
        onCheckedChange={checked => props.commit(setBorderHoverReveal(props.layout, side, checked))}
      >
        {props.labels.hoverReveal}
      </DropdownMenuCheckboxItem>
    </>
  )
}

export function DockBorderBars(props: BorderProps & { root: DockBounds }) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const [hovered, setHovered] = useState<DockBorderSide | null>(null)
  const [menuOpen, setMenuOpen] = useState<DockBorderSide | null>(null)
  const [focusedOptions, setFocusedOptions] = useState<DockBorderSide | null>(null)
  const { subscribePointer } = useContext(PanelEnvironmentContext)
  const rails = useMemo(
    () => borderRailBounds(props.layout, props.root, theme.design.dock.stripHeight),
    [props.layout, props.root, theme.design.dock.stripHeight]
  )
  useLayoutEffect(
    () =>
      subscribePointer?.(point => {
        const side = dockBorderSides.find(candidate => {
          const box = rails.get(candidate)
          return (
            box &&
            point.x >= box.x &&
            point.x < box.x + box.width &&
            point.y >= box.y &&
            point.y < box.y + box.height
          )
        })
        setHovered(side ?? null)
      }),
    [subscribePointer, rails]
  )
  return dockBorderSides.map(side => {
    const border = props.layout.borders[side]
    if (!border) return null
    const rail = rails.get(side)
    if (!rail) return null
    const bottom = side === "bottom"
    return (
      <div
        key={side}
        testId={`${props.testId}-border-${side}`}
        role="toolbar"
        onMouseEnter={() => {
          setHovered(side)
          props.hoverBorder(side)
        }}
        onMouseLeave={event => {
          const inside =
            event.x !== undefined &&
            event.y !== undefined &&
            event.x >= rail.x &&
            event.x < rail.x + rail.width &&
            event.y >= rail.y &&
            event.y < rail.y + rail.height
          if (!inside) setHovered(current => (current === side ? null : current))
          props.leaveBorder(side, event)
        }}
        style={{
          display: "flex",
          position: "absolute",
          flexDirection: bottom ? "row" : "column",
          left: rail.x - props.root.x,
          top: rail.y - props.root.y,
          width: rail.width,
          height: rail.height,
          backgroundColor:
            props.drag.target?.border === side ? theme.colors.muted : theme.colors.card,
          borderColor: theme.colors.border,
          borderLeftWidth: side === "right" ? theme.design.shape.separatorWidth : 0,
          borderRightWidth: side === "left" ? theme.design.shape.separatorWidth : 0,
          borderTopWidth: bottom ? theme.design.shape.separatorWidth : 0,
          overflow: "hidden",
          userSelect: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: bottom ? "row" : "column",
            flexGrow: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          {borderTabs(border).map((tabId, index) => {
            const panel = props.registry[tabId]
            if (!panel) return null
            return (
              <Fragment key={tabId}>
                {index === border.tabs.length ? <div style={{ flexGrow: 1 }} /> : null}
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <DockRailButton
                      ref={instance => {
                        if (instance) props.tabRefs.current.set(tabId, instance)
                        else props.tabRefs.current.delete(tabId)
                      }}
                      testId={`${props.testId}-tab-${tabId}`}
                      label={panel.title}
                      selected={border.selected === tabId}
                      icon={panel.icon ?? "PanelRight"}
                      onMouseEnter={() => props.hoverBorder(side, tabId)}
                      bottom={bottom}
                      onFocus={() => {
                        props.frame.onGroupFocus(borderGroupId(side))
                        props.frame.onFocusChange?.(true)
                      }}
                      onBlur={() => {
                        const focused = renderer?.getFocusedElementId?.()
                        props.frame.onFocusChange?.(
                          [...props.tabRefs.current.values()].some(
                            instance => instance.id === focused
                          )
                        )
                      }}
                      onKeyDown={event => {
                        props.drag.keyDown(event)
                        if (!event.defaultPrevented) props.frame.onKeyDown?.(event)
                      }}
                      onMouseDown={event =>
                        props.drag.start({ groupId: borderGroupId(side), tabId }, event)
                      }
                      onMouseMove={props.drag.move}
                      onMouseUp={props.drag.release}
                      onClick={() =>
                        props.drag.click(() =>
                          props.commit(
                            selectBorderTab(
                              props.layout,
                              side,
                              border.selected === tabId &&
                                !(border.type === "overlay" && border.hoverReveal)
                                ? null
                                : tabId
                            )
                          )
                        )
                      }
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent
                    side={side === "left" ? "right" : side === "right" ? "left" : "top"}
                  >
                    <BorderOptions
                      {...props}
                      side={side}
                      prefix={`${props.testId}-border-context`}
                    />
                    <ContextMenuItem onSelect={() => props.commit(closeTab(props.layout, tabId))}>
                      {props.labels.close}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </Fragment>
            )
          })}
          {(border.end?.length ?? 0) === 0 ? <div style={{ flexGrow: 1 }} /> : null}
        </div>
        <div
          testId={`${props.testId}-border-options-slot-${side}`}
          style={{
            width: theme.design.dock.stripHeight,
            height: theme.design.dock.stripHeight,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DropdownMenu onOpenChange={open => setMenuOpen(open ? side : null)}>
            <DropdownMenuTrigger asChild>
              <ToolbarIconButton
                testId={`${props.testId}-border-options-${side}`}
                label={props.labels.railOptions}
                onFocus={() => setFocusedOptions(side)}
                onBlur={() => setFocusedOptions(null)}
                style={{
                  opacity: hovered === side || menuOpen === side || focusedOptions === side ? 1 : 0,
                }}
              >
                <IconSlot>
                  <Icon name={bottom ? "Ellipsis" : "EllipsisVertical"} />
                </IconSlot>
              </ToolbarIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={side === "left" ? "right" : side === "right" ? "left" : "top"}
            >
              <BorderOptions {...props} side={side} prefix={`${props.testId}-border-options`} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {props.drag.target?.border === side ? (
          <div
            testId={`${props.testId}-rail-insert-${side}`}
            style={{
              position: "absolute",
              pointerEvents: "none",
              backgroundColor: theme.colors.ring,
              ...(bottom
                ? {
                    left: props.drag.target.railOffset,
                    top: 0,
                    width: theme.design.shape.separatorWidth,
                    height: "100%",
                  }
                : {
                    top: props.drag.target.railOffset,
                    left: 0,
                    height: theme.design.shape.separatorWidth,
                    width: "100%",
                  }),
            }}
          />
        ) : null}
      </div>
    )
  })
}

export function DockBorderPanel({
  side,
  box,
  root,
  ...props
}: BorderProps & { side: DockBorderSide; box: DockBounds; root: DockBounds }) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const border = props.layout.borders[side]
  const vertical = side !== "bottom"
  const tabRefs = useRef(new Map<string, PublicInstance>())
  const updates = useResizeCommit((size: number) =>
    props.preview(resizeBorder(props.layout, side, size))
  )
  const finalSize = useRef(border?.size ?? theme.design.dock.borderSize)
  const offset =
    (side === "left" ? box.x - root.x + box.width : vertical ? box.x - root.x : box.y - root.y) -
    (border?.type === "split" && side !== "left" ? theme.design.shape.separatorWidth : 0)
  const drag = useDividerDrag({
    orientation: vertical ? "vertical" : "horizontal",
    start: () => {
      const size = border?.size ?? theme.design.dock.borderSize
      finalSize.current = size
      return size
    },
    move: (size, delta) => {
      const minimum =
        props.registry[border?.selected ?? ""]?.minimumSize ?? theme.design.dock.minimumSize
      const next = Math.max(
        minimum,
        Math.min(
          (vertical ? root.width : root.height) -
            theme.design.dock.stripHeight -
            theme.design.dock.minimumSize,
          size + (side === "left" ? delta : -delta)
        )
      )
      finalSize.current = next
      updates.schedule(next)
    },
    finish: () => {
      updates.flush()
      props.commit(resizeBorder(props.layout, side, finalSize.current))
    },
    restore: () => {
      updates.cancel()
      props.preview(null)
    },
  })
  if (!border?.selected) return null
  const selected = border.selected
  const close = () => {
    props.commit(selectBorderTab(props.layout, side, null))
    const tab = props.tabRefs.current.get(selected)
    if (tab) renderer?.focusElement?.(tab.id)
  }
  return (
    <div
      testId={`${props.testId}-flyout-${side}`}
      tabIndex={-1}
      onMouseEnter={() => props.hoverBorder(side)}
      onMouseLeave={event => props.leaveBorder(side, event)}
      onMouseDownOutside={event => {
        if (props.openMenus.current > 0) return
        if (border.type !== "overlay") return
        const bar = props.borders.current.get(side)
        if (
          bar &&
          event.x !== undefined &&
          event.y !== undefined &&
          event.x >= bar.x &&
          event.x <= bar.x + bar.width &&
          event.y >= bar.y &&
          event.y <= bar.y + bar.height
        )
          return
        if (event.x !== undefined && event.y !== undefined) {
          const pointer = vertical ? event.x : event.y
          const cross = vertical ? event.y : event.x
          const start = vertical ? box.y : box.x
          const length = vertical ? box.height : box.width
          if (
            Math.abs(pointer - offset - (vertical ? root.x : root.y)) <=
              theme.project.panelGap / 2 &&
            cross >= start &&
            cross <= start + length
          )
            return
        }
        close()
      }}
      onKeyDown={event => {
        if (event.key === "escape" && border.type === "overlay") {
          close()
          consumeKey(event, "handled")
        }
      }}
      style={{
        position: "absolute",
        left: box.x - root.x,
        top: box.y - root.y,
        width: box.width,
        height: box.height,
        backgroundColor: theme.colors.card,
        userSelect: drag.dragging ? "none" : "auto",
      }}
    >
      <DockFrame
        {...props.frame}
        bounds={box}
        borderSide={side}
        tabRefs={tabRefs}
        group={{
          kind: "group",
          id: borderGroupId(side),
          tabs: borderTabs(border),
          active: selected,
        }}
        testId={`${props.testId}-border-panel-${side}`}
      />
      <DividerHitArea
        orientation={vertical ? "vertical" : "horizontal"}
        offset={offset}
        style={
          vertical
            ? { top: box.y - root.y, height: box.height }
            : { left: box.x - root.x, width: box.width }
        }
        {...drag}
        testId={`${props.testId}-border-divider-${side}`}
      />
    </div>
  )
}
