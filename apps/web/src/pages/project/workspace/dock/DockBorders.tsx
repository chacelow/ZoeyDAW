import { useState } from "react"
import { MoreHorizontal, MoreVertical } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@zoeymind/ui"
import {
  borderGroupId,
  borderTabs,
  closeTab,
  selectBorderTab,
  setBorderHoverReveal,
  setBorderType,
  toggleMaximize,
  type DockBorderSide,
  type DockBounds,
  type DockLayoutJSON,
} from "./model"
import {
  asPanel,
  boxStyle,
  iconById,
  iconStyle,
  type DockDrag,
  type DockUpdate,
} from "./dock-presentation"
import type { DropTarget } from "./useDockPointer"
import type { DockOverlay } from "./useDockOverlay"
import type { DockResize } from "./useDockResize"
import type { DockLabels, DockRegistry } from "./DockLayout"

interface BorderOptionsProps {
  side: DockBorderSide
  layout: DockLayoutJSON
  labels: DockLabels
  update: DockUpdate
}
function DockBorderOptions({ side, layout, labels, update }: BorderOptionsProps) {
  const border = layout.borders[side]
  return (
    <>
      <DropdownMenuItem
        data-testid={`dock-border-maximize-${side}`}
        onClick={() => update(current => toggleMaximize(current, borderGroupId(side)))}
      >
        {layout.maximizedGroup === borderGroupId(side) ? labels.restore : labels.maximize}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        data-testid={`dock-border-options-mode-${side}`}
        checked={border?.type === "overlay"}
        onCheckedChange={checked =>
          update(current => setBorderType(current, side, checked ? "overlay" : "split"))
        }
      >
        {labels.overlayMode}
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        data-testid={`dock-border-options-hover-${side}`}
        checked={border?.hoverReveal === true}
        disabled={border?.type !== "overlay"}
        onCheckedChange={checked => update(current => setBorderHoverReveal(current, side, checked))}
      >
        {labels.hoverReveal}
      </DropdownMenuCheckboxItem>
    </>
  )
}
interface RailProps extends BorderOptionsProps {
  rail: DockBounds
  root: DockBounds
  registry: DockRegistry
  drag: DockDrag
  drop: DropTarget | null
  overlay: DockOverlay
}
export function DockBorderRail({
  side,
  layout,
  labels,
  update,
  rail,
  root,
  registry,
  drag,
  drop,
  overlay,
}: RailProps) {
  const [hovered, setHovered] = useState(false)
  const border = layout.borders[side]
  if (!border) return null
  const horizontal = side === "bottom"
  return (
    <div
      className={`dock-rail dock-rail-${side}`}
      role="toolbar"
      data-testid={`dock-border-${side}`}
      data-dock-surface={side}
      style={boxStyle(rail, root)}
      onPointerEnter={() => {
        setHovered(true)
        overlay.hoverBorder(side)
      }}
      onPointerLeave={event => {
        setHovered(false)
        overlay.leaveBorder(side, event.relatedTarget)
      }}
    >
      <div className="dock-rail-tabs">
        {borderTabs(border).map((id, index) => {
          if (!asPanel(id)) return null
          const Icon = iconById[id]
          return (
            <div
              key={id}
              className="dock-rail-item"
              style={{
                marginInlineStart: horizontal && index === border.tabs.length ? "auto" : undefined,
                marginBlockStart: !horizontal && index === border.tabs.length ? "auto" : undefined,
              }}
            >
              <DropdownMenu onOpenChange={overlay.menuOpen}>
                <button
                  type="button"
                  className="dock-rail-button"
                  data-active={border.selected === id}
                  data-testid={`dock-tab-${id}`}
                  aria-label={registry[id].title}
                  aria-pressed={border.selected === id}
                  onPointerEnter={() => overlay.hoverBorder(side, id)}
                  onKeyDown={event => {
                    if (event.key === " ") event.preventDefault()
                  }}
                  onPointerDown={event =>
                    drag.start({ groupId: borderGroupId(side), tabId: id }, event)
                  }
                  onPointerMove={drag.move}
                  onPointerUp={drag.release}
                  onPointerCancel={drag.cancel}
                  onClick={() =>
                    drag.click(() =>
                      update(current =>
                        selectBorderTab(
                          current,
                          side,
                          border.selected === id &&
                            !(border.type === "overlay" && border.hoverReveal)
                            ? null
                            : id
                        )
                      )
                    )
                  }
                  onContextMenu={event => {
                    event.preventDefault()
                    event.currentTarget
                      .closest(".dock-rail-item")
                      ?.querySelector<HTMLElement>(`[data-testid="dock-rail-menu-${id}"]`)
                      ?.click()
                  }}
                >
                  <Icon aria-hidden="true" />
                </button>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="dock-context-trigger"
                      data-testid={`dock-rail-menu-${id}`}
                      aria-label={labels.more}
                    />
                  }
                />
                <DropdownMenuContent className="project-workspace-menu" style={iconStyle}>
                  <DockBorderOptions side={side} layout={layout} labels={labels} update={update} />
                  <DropdownMenuItem onClick={() => update(current => closeTab(current, id))}>
                    {labels.close}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
        {!border.end?.length && <div className="dock-rail-spacer" />}
      </div>
      <DropdownMenu onOpenChange={overlay.menuOpen}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="dock-rail-options"
              data-testid={`dock-border-options-${side}`}
              aria-label={labels.railOptions}
              title={labels.railOptions}
              data-visible={hovered || overlay.menuCount > 0}
            >
              <span>{horizontal ? <MoreHorizontal /> : <MoreVertical />}</span>
            </button>
          }
        />
        <DropdownMenuContent className="project-workspace-menu" style={iconStyle}>
          <DockBorderOptions side={side} layout={layout} labels={labels} update={update} />
        </DropdownMenuContent>
      </DropdownMenu>
      {drop?.border === side && (
        <div
          className={`dock-rail-insert ${horizontal ? "horizontal" : "vertical"}`}
          data-testid={`dock-rail-insert-${side}`}
          style={horizontal ? { left: drop.railOffset } : { top: drop.railOffset }}
        />
      )}
    </div>
  )
}

interface PanelProps {
  side: DockBorderSide
  layout: DockLayoutJSON
  box: DockBounds
  root: DockBounds
  registry: DockRegistry
  overlay: DockOverlay
  resize: DockResize
}
export function DockBorderPanel({
  side,
  layout,
  box,
  root,
  registry,
  overlay,
  resize,
}: PanelProps) {
  const border = layout.borders[side]
  if (!border?.selected || !asPanel(border.selected)) return null
  const selected = border.selected
  const vertical = side !== "bottom"
  const groupId = borderGroupId(side)
  return (
    <div
      className={cn(
        "dock-flyout",
        `dock-flyout-${side}`,
        border.type === "overlay" && "dock-overlay"
      )}
      data-testid={`dock-flyout-${side}`}
      data-dock-surface={side}
      style={boxStyle(box, root)}
      onPointerEnter={() => overlay.hoverBorder(side)}
      onPointerLeave={event => overlay.leaveBorder(side, event.relatedTarget)}
    >
      <div
        className="dock-group dock-border-group"
        role="group"
        aria-label={registry[selected].title}
        data-testid={`dock-group-${groupId}`}
        data-dock-group={groupId}
        style={{ width: box.width, height: box.height }}
      />
      <div
        role="separator"
        aria-orientation={vertical ? "vertical" : "horizontal"}
        className={`dock-border-divider dock-border-divider-${side}`}
        data-testid={`dock-border-divider-${side}`}
        onPointerDown={event =>
          resize.start(
            {
              kind: "border",
              side,
              start: vertical ? event.clientX : event.clientY,
              size: border.size,
              minimum: registry[selected].minimumSize,
              pointer: event.pointerId,
            },
            event
          )
        }
        onPointerMove={resize.move}
        onPointerUp={resize.release}
        onPointerCancel={resize.cancel}
      />
    </div>
  )
}
