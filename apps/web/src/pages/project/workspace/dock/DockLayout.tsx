import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { borderGeometry } from "./border-geometry"
import { projectDockGroups } from "./geometry"
import { borderRailBounds } from "./border-rails"
import {
  dockBorderSides,
  findGroup,
  getBorderTabs,
  getGroups,
  type DockBounds,
  type DockGroup,
  type DockLayoutJSON,
} from "./model"
import { useDockPointer } from "./useDockPointer"
import { useDockResize } from "./useDockResize"
import { useDockOverlay } from "./useDockOverlay"
import { DockGroupFrame } from "./DockGroupFrame"
import { DockRootNode } from "./DockRootNode"
import { DockBorderPanel, DockBorderRail } from "./DockBorders"
import { DockPanelLayers } from "./DockPanelLayers"
import { DockDropPreview } from "./DockDropPreview"
import {
  asPanel,
  borderDefaultSize,
  boxStyle,
  dockStyle,
  gap,
  minimumSize,
  strip,
  unit,
  type DockUpdate,
} from "./dock-presentation"
import type { SectionId } from "@/pages/project/types"

export interface DockRegistration {
  readonly title: string
  readonly render: (visible: boolean) => ReactNode
  readonly minimumSize: number
  readonly fixedContentHeight?: number
}
export type DockRegistry = Readonly<Record<SectionId, DockRegistration>>
export interface DockLabels {
  close: string
  closeOthers: string
  splitRight: string
  splitDown: string
  maximize: string
  restore: string
  hide: string
  dragGroup: string
  more: string
  showPanels: string
  overlayMode: string
  hoverReveal: string
  railOptions: string
}
interface Props {
  layout: DockLayoutJSON
  registry: DockRegistry
  labels: DockLabels
  onLayoutChange: (layout: DockLayoutJSON) => void
}
export function DockLayout({ layout, registry, labels, onLayoutChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<DockBounds>({ x: 0, y: 0, width: 0, height: 0 })
  const [preview, setPreview] = useState<DockLayoutJSON | null>(null)
  const current = preview ?? layout
  const latest = useRef(current)
  const commitRef = useRef(onLayoutChange)
  useLayoutEffect(() => {
    latest.current = current
    commitRef.current = onLayoutChange
  }, [current, onLayoutChange])
  const commit = (next: DockLayoutJSON) => {
    setPreview(null)
    if (next !== layout) commitRef.current(next)
  }
  const update: DockUpdate = transform => commit(transform(latest.current))
  const drag = useDockPointer({
    layout: current,
    commit,
    root: rootRef,
    strip,
    borderSize: borderDefaultSize,
    threshold: 3,
  })
  const resize = useDockResize({ layout, root, preview, setPreview, commit })
  const overlay = useDockOverlay({ rootRef, latest, commitRef })
  const visited = useRef(new Set<string>())
  const owned = useRef(new Set<string>())
  useLayoutEffect(() => {
    const panels = new Set([
      ...getGroups(current.root).flatMap(group => group.tabs),
      ...getBorderTabs(current),
      ...current.hidden,
    ])
    for (const id of panels) owned.current.add(id)
    for (const id of owned.current) {
      if (!panels.has(id)) {
        owned.current.delete(id)
        visited.current.delete(id)
      }
    }
  }, [current])
  useEffect(() => {
    for (const id of getGroups(layout.root).flatMap(group => group.tabs)) visited.current.add(id)
    for (const side of dockBorderSides) {
      const selected = layout.borders[side]?.selected
      if (selected) visited.current.add(selected)
    }
  }, [layout])
  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) return
    const updateBounds = () => {
      const rect = element.getBoundingClientRect()
      const next = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      setRoot(previous =>
        previous.x === next.x &&
        previous.y === next.y &&
        previous.width === next.width &&
        previous.height === next.height
          ? previous
          : next
      )
    }
    updateBounds()
    const observer = new ResizeObserver(updateBounds)
    observer.observe(element)
    window.addEventListener("resize", updateBounds)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateBounds)
    }
  }, [])
  const [focusedTab, setFocusedTab] = useState<string | null>(null)
  const focusTab = (id: string) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-testid="dock-tab-${id}"]`)?.focus()
  useLayoutEffect(() => {
    if (!focusedTab) return
    const group = getGroups(layout.root).find(item => item.tabs.includes(focusedTab))
    if (group) return
    const retained = rootRef.current?.querySelector<HTMLElement>(
      `[data-testid="dock-tab-${focusedTab}"]`
    )
    if (retained) {
      retained.focus()
      setFocusedTab(null)
      return
    }
    const next = findGroup(layout, layout.activeGroup ?? "") ?? getGroups(layout.root)[0]
    if (next) focusTab(next.active)
    else setFocusedTab(null)
  }, [layout, focusedTab])
  const fixedBottomSize = (() => {
    const selected = current.borders.bottom?.selected
    return selected && asPanel(selected) ? registry[selected].fixedContentHeight : undefined
  })()
  const { main, boxes } = useMemo(
    () => borderGeometry(current, root, strip, gap, minimumSize, fixedBottomSize),
    [current, fixedBottomSize, root]
  )
  const maximized = current.maximizedGroup
    ? (findGroup(current, current.maximizedGroup) ?? null)
    : null
  const groups = useMemo(
    () =>
      maximized ? new Map([[maximized.id, main]]) : projectDockGroups(current.root, main, gap),
    [maximized, current.root, main]
  )
  const compact = useRef<Record<string, boolean>>({})
  useLayoutEffect(() => {
    for (const [id, box] of groups)
      compact.current[id] = box.width < (compact.current[id] === true ? 19 : 18) * unit
  }, [groups])
  const rails = useMemo(() => borderRailBounds(current, root, strip), [current, root])
  const renderGroup = (group: DockGroup, box: DockBounds) => (
    <DockGroupFrame
      key={group.id}
      group={group}
      box={box}
      compact={box.width < (compact.current[group.id] === true ? 19 : 18) * unit}
      layout={current}
      registry={registry}
      labels={labels}
      update={update}
      drag={drag}
      focus={{ focused: focusedTab, setFocused: setFocusedTab, focus: focusTab }}
      overlay={overlay}
    />
  )
  return (
    <div ref={rootRef} className="project-workspace-dock" data-testid="dock" style={dockStyle}>
      <div className="dock-main" style={boxStyle(main, root)}>
        {maximized
          ? renderGroup(maximized, main)
          : current.root && (
              <DockRootNode
                node={current.root}
                box={main}
                registry={registry}
                resize={resize}
                renderGroup={renderGroup}
              />
            )}
      </div>
      {dockBorderSides.map(side => {
        const rail = rails.get(side)
        const border = current.borders[side]
        return border !== undefined && rail ? (
          <DockBorderRail
            key={side}
            side={side}
            layout={current}
            labels={labels}
            update={update}
            rail={rail}
            root={root}
            registry={registry}
            drag={drag}
            drop={drag.target}
            overlay={overlay}
          />
        ) : null
      })}
      {dockBorderSides.map(side => {
        const box = boxes[side]
        return box ? (
          <DockBorderPanel
            key={side}
            side={side}
            layout={current}
            box={box}
            root={root}
            registry={registry}
            overlay={overlay}
            resize={resize}
          />
        ) : null
      })}
      <DockPanelLayers
        layout={current}
        registry={registry}
        root={root}
        boxes={boxes}
        groups={groups}
        maximized={maximized}
        visited={visited.current}
        overlay={overlay}
        update={update}
      />
      <DockDropPreview
        drop={drag.target}
        layout={current}
        root={root}
        rootRef={rootRef}
        rails={rails}
        groups={groups}
      />
    </div>
  )
}
