import { GripVertical, Maximize2, Minimize2, MoreHorizontal, X } from "lucide-react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@zoeymind/ui"
import {
  activateTab,
  closeTab,
  toggleMaximize,
  type DockBounds,
  type DockGroup,
  type DockLayoutJSON,
} from "./model"
import { asPanel, iconById, iconStyle, type DockDrag, type DockUpdate } from "./dock-presentation"
import { DockTabMenu } from "./DockTabMenu"
import type { DockLabels, DockRegistry } from "./DockLayout"
import type { DockOverlay } from "./useDockOverlay"

export interface DockTabFocus {
  focused: string | null
  setFocused: (id: string) => void
  focus: (id: string) => void
}
interface GroupProps {
  group: DockGroup
  box: DockBounds
  compact: boolean
  layout: DockLayoutJSON
  registry: DockRegistry
  labels: DockLabels
  update: DockUpdate
  drag: DockDrag
  focus: DockTabFocus
  overlay: Pick<DockOverlay, "menuCount" | "menuOpen">
}
interface TabProps extends Omit<GroupProps, "box" | "compact"> {
  id: string
  index: number
}

function DockTab({
  id,
  index,
  group,
  layout,
  registry,
  labels,
  update,
  drag,
  focus,
  overlay,
}: TabProps) {
  if (!asPanel(id)) return null
  const Icon = iconById[id]
  const tabIndex =
    focus.focused && group.tabs.includes(focus.focused)
      ? focus.focused === id
        ? 0
        : -1
      : group.active === id
        ? 0
        : -1
  const openContextMenu = (element: HTMLElement) =>
    element
      .closest(".dock-tab-frame")
      ?.querySelector<HTMLElement>(`[data-testid="dock-tab-menu-${id}"]`)
      ?.click()
  return (
    <div className="dock-tab-frame" data-dock-tab-frame={id} data-testid={`dock-tab-frame-${id}`}>
      <DropdownMenu onOpenChange={overlay.menuOpen}>
        <div className="dock-tab" data-active={group.active === id} style={{ padding: 0 }}>
          <div
            role="tab"
            aria-label={registry[id].title}
            aria-selected={group.active === id}
            tabIndex={tabIndex}
            data-active={group.active === id}
            className="dock-tab"
            data-testid={`dock-tab-${id}`}
            style={{ maxWidth: "none", flex: "1 1 auto", minWidth: 0, paddingInlineEnd: 0 }}
            onFocus={() => focus.setFocused(id)}
            onBlur={() => drag.cancel()}
            onPointerDown={event => drag.start({ groupId: group.id, tabId: id }, event)}
            onPointerMove={drag.move}
            onPointerUp={drag.release}
            onPointerCancel={drag.cancel}
            onClick={() => drag.click(() => update(current => activateTab(current, id)))}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault()
                update(current => activateTab(current, id))
              } else if (
                (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                focus.focus(
                  group.tabs[
                    (index + (event.key === "ArrowRight" ? 1 : group.tabs.length - 1)) %
                      group.tabs.length
                  ]
                )
                event.preventDefault()
              }
            }}
            onContextMenu={event => {
              event.preventDefault()
              openContextMenu(event.currentTarget)
            }}
          >
            <Icon aria-hidden="true" />
            <span className="dock-tab-title">{registry[id].title}</span>
          </div>
          <button
            type="button"
            className="dock-tab-close"
            aria-label={`${labels.close} ${registry[id].title}`}
            data-testid={`dock-close-${id}`}
            onPointerDown={event => event.stopPropagation()}
            style={{ marginInlineEnd: "var(--spacing-control-track-gap)" }}
            onKeyDown={event => {
              if (event.key === " ") event.preventDefault()
            }}
            onClick={event => {
              event.stopPropagation()
              update(current => closeTab(current, id))
            }}
            onContextMenu={event => {
              event.preventDefault()
              openContextMenu(event.currentTarget)
            }}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="dock-context-trigger"
              data-testid={`dock-tab-menu-${id}`}
              aria-label={labels.more}
            />
          }
        />
        <DropdownMenuContent className="project-workspace-menu" style={iconStyle}>
          <DockTabMenu
            id={id}
            groupId={group.id}
            layout={layout}
            registry={registry}
            labels={labels}
            update={update}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function DockGroupFrame({
  group,
  box,
  compact,
  layout,
  registry,
  labels,
  update,
  drag,
  focus,
  overlay,
}: GroupProps) {
  const maximized = layout.maximizedGroup === group.id
  return (
    <div
      className="dock-group"
      role="group"
      aria-label={asPanel(group.active) ? registry[group.active].title : undefined}
      data-testid={`dock-group-${group.id}`}
      data-dock-group={group.id}
      style={{ width: box.width, height: box.height }}
    >
      <div className="dock-group-header" data-testid={`dock-header-${group.id}`}>
        <div className="dock-group-tabs" role="tablist">
          {group.tabs.map((id, index) => (
            <DockTab
              key={id}
              id={id}
              index={index}
              group={group}
              layout={layout}
              registry={registry}
              labels={labels}
              update={update}
              drag={drag}
              focus={focus}
              overlay={overlay}
            />
          ))}
        </div>
        <div
          className="dock-group-actions"
          data-testid={`dock-actions-${group.id}`}
          data-menu-open={overlay.menuCount > 0}
        >
          {!compact && (
            <>
              <Button
                variant="ghost"
                size="control-icon"
                title={labels.dragGroup}
                aria-label={labels.dragGroup}
                data-testid={`dock-drag-group-${group.id}`}
                onPointerDown={event => drag.start({ groupId: group.id }, event)}
                onPointerMove={drag.move}
                onPointerUp={drag.release}
                onPointerCancel={drag.cancel}
              >
                <GripVertical />
              </Button>
              <Button
                variant="ghost"
                size="control-icon"
                title={maximized ? labels.restore : labels.maximize}
                aria-label={maximized ? labels.restore : labels.maximize}
                data-testid={`dock-maximize-${group.id}`}
                onClick={() => update(current => toggleMaximize(current, group.id))}
              >
                {maximized ? <Minimize2 /> : <Maximize2 />}
              </Button>
            </>
          )}
          <DropdownMenu onOpenChange={overlay.menuOpen}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="control-icon"
                  aria-label={labels.more}
                  title={labels.more}
                  data-testid={`dock-more-${group.id}`}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="project-workspace-menu"
              style={iconStyle}
              onKeyDown={event => {
                if (event.key !== " ") event.stopPropagation()
              }}
            >
              <DockTabMenu
                id={group.active}
                groupId={group.id}
                layout={layout}
                registry={registry}
                labels={labels}
                update={update}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => update(current => toggleMaximize(current, group.id))}
              >
                {maximized ? labels.restore : labels.maximize}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="dock-header-separator" />
    </div>
  )
}
