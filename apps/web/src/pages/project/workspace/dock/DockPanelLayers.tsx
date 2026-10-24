import {
  activateTab,
  findBorder,
  getBorderTabs,
  getGroups,
  type DockBorderSide,
  type DockBounds,
  type DockGroup,
  type DockLayoutJSON,
} from "./model"
import { asPanel, boxStyle, gap, strip, type DockUpdate } from "./dock-presentation"
import type { DockRegistry } from "./DockLayout"
import type { DockOverlay } from "./useDockOverlay"

interface Props {
  layout: DockLayoutJSON
  registry: DockRegistry
  root: DockBounds
  boxes: Partial<Record<DockBorderSide, DockBounds>>
  groups: ReadonlyMap<string, DockBounds>
  maximized: DockGroup | null
  visited: ReadonlySet<string>
  overlay: DockOverlay
  update: DockUpdate
}

export function DockPanelLayers({
  layout,
  registry,
  root,
  boxes,
  groups,
  maximized,
  visited,
  overlay,
  update,
}: Props) {
  const panelIds = new Set([
    ...getGroups(layout.root).flatMap(group => group.tabs),
    ...getBorderTabs(layout),
    ...layout.hidden,
  ])
  return (
    <>
      {[...panelIds].map(id => {
        if (!asPanel(id)) return null
        const side = findBorder(layout, id)
        if (side && layout.borders[side]?.selected !== id && !visited.has(id)) return null
        const group = getGroups(layout.root).find(
          item => item.active === id && (!maximized || maximized.id === item.id)
        )
        const surface =
          side && layout.borders[side]?.selected === id
            ? boxes[side]
            : group
              ? groups.get(group.id)
              : undefined
        const top = side ? 0 : strip + gap
        const visible = Boolean(surface)
        const box = surface
          ? { ...surface, y: surface.y + top, height: Math.max(0, surface.height - top) }
          : null
        return (
          <div
            key={id}
            role="tabpanel"
            aria-label={registry[id].title}
            data-testid={`dock-content-${id}`}
            data-dock-content={id}
            data-dock-surface={side}
            onPointerEnter={() => {
              if (side) overlay.hoverBorder(side)
            }}
            onPointerLeave={event => {
              if (side) overlay.leaveBorder(side, event.relatedTarget)
            }}
            className="dock-content-layer"
            data-workspace-visible={visible}
            aria-hidden={!visible}
            inert={!visible}
            style={{
              ...(box ? boxStyle(box, root) : { position: "absolute", display: "none" }),
              display: visible ? "flex" : "none",
              zIndex: side ? 9 : 5,
              background: side ? "var(--card)" : "var(--background)",
            }}
            onPointerDown={() => {
              if (group && layout.activeGroup !== group.id)
                update(current => activateTab(current, id))
            }}
          >
            {registry[id].render(visible)}
          </div>
        )
      })}
    </>
  )
}
