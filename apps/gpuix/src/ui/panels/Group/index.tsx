import { Children, isValidElement, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ReactElement, ReactNode } from "react"
import type { StyleDesc } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { DividerOffsetContext, GroupContext, SlotContext } from "../context"
import type { GroupState, LayoutSnapshot } from "../context"
import { computeLayout } from "../layout/computeLayout"
import { initialLayout, reflowLayout, resolveConstraints, snapSize } from "../layout/sizes"
import { Panel } from "../Panel"
import type { PanelProps } from "../Panel"
import { useElementSize } from "../useElementSize"
import { useResizeCommit } from "../useResizeCommit"
import { DividerLayer } from "../DividerLayer"
import type { DividerBounds } from "../DividerLayer"

export interface GroupProps {
  orientation: "horizontal" | "vertical"
  children: ReactNode
  style?: StyleDesc
  id?: string
  testId?: string
  weights?: readonly number[]
  extent?: number
  bounds?: DividerBounds
  onLayoutChange?: (sizes: readonly number[]) => void
}

export function Group({ orientation, children, style, id, testId, weights, extent, bounds, onLayoutChange }: GroupProps) {
  const theme = useTheme()
  const measurement = useElementSize()
  const nodes = useMemo(() => Children.toArray(children), [children])
  const panels = useMemo(() => nodes.filter((node): node is ReactElement<PanelProps> => isValidElement<PanelProps>(node) && node.type === Panel), [nodes])
  const dividers = nodes.filter(node => isValidElement<{ hidden?: boolean }>(node) && node.type !== Panel && !node.props.hidden).length
  const available = Math.max(0, (extent ?? (orientation === "horizontal" ? measurement.width : measurement.height)) - dividers * theme.design.shape.separatorWidth)
  const [stored, setStored] = useState<{ total: number; sizes: number[] } | null>(null)
  const anchor = useRef<LayoutSnapshot | null>(null)
  const total = anchor.current?.total ?? (available > 0 ? available : stored?.total ?? 0)
  const constraints = useMemo(() => total > 0 ? resolveConstraints(panels.map(panel => panel.props), total) : [], [panels, total])
  const defaults = useMemo(() => {
    if (!weights) return panels.map(panel => panel.props.defaultSize)
    const sum = weights.reduce((value, weight) => value + weight, 0)
    return weights.map(weight => `${weight / sum * 100}%`)
  }, [weights, panels])
  const sizes = useMemo(() => {
    if (total <= 0) return []
    if (weights || stored?.sizes.length !== panels.length) return initialLayout(defaults, constraints, total)
    return stored.total === total ? stored.sizes : reflowLayout(stored.sizes, constraints, total, panels.map(panel => typeof panel.props.defaultSize === "number"))
  }, [weights, stored, panels, total, defaults, constraints])
  const live = useRef<LayoutSnapshot>({ sizes, constraints, total })
  const onChange = useRef(onLayoutChange)
  useLayoutEffect(() => { onChange.current = onLayoutChange }, [onLayoutChange])
  useLayoutEffect(() => {
    if (anchor.current) return
    live.current = { sizes, constraints, total }
    if (!weights && total > 0) setStored(previous => previous?.total === total && previous.sizes === sizes ? previous : { total, sizes })
  }, [sizes, constraints, total, weights])
  useLayoutEffect(() => { if (!anchor.current && sizes.length) onChange.current?.(sizes) }, [sizes])
  const commit = (next: LayoutSnapshot) => {
    if (weights) onChange.current?.(next.sizes)
    else setStored(previous => previous?.total === next.total && previous.sizes === next.sizes ? previous : next)
  }
  const updates = useResizeCommit(commit)
  const state: GroupState = {
    orientation, sizes, constraints, total, proportional: total === available,
    resizePanel: (index, pixels) => {
      const current = live.current
      if (!current.sizes.length) return
      const desired = snapSize(pixels, current.constraints[index])
      const separator = index < current.sizes.length - 1 ? index : index - 1
      const delta = (desired - current.sizes[index]) * (separator === index ? 1 : -1)
      const next = { ...current, sizes: current.sizes.length === 1 ? [Math.min(current.total, desired)] : computeLayout(current.sizes, current.constraints, { separator, delta }) }
      live.current = next
      commit(next)
    },
    beginDrag: () => { anchor.current = live.current; return live.current },
    preview: (snapshot, separator, delta) => {
      const next = { ...snapshot, sizes: computeLayout(snapshot.sizes, snapshot.constraints, { separator, delta }) }
      live.current = next
      updates.schedule(next)
      return next
    },
    endDrag: restore => {
      if (restore) { updates.cancel(); live.current = restore; commit(restore) }
      else updates.flush()
      anchor.current = null
    },
  }
  let index = -1
  let offset = 0
  return (
    <GroupContext.Provider value={state}>
      <DividerLayer layoutBounds={bounds} onLayout={extent === undefined ? measurement.onLayout : undefined} role="group" testId={testId ?? id}
        style={sx({ width: "100%", height: "100%" }, style, { display: "flex", flexDirection: orientation === "horizontal" ? "row" : "column", minWidth: 0, minHeight: 0, overflow: "hidden" })}>
        {nodes.map(node => {
          const panel = isValidElement(node) && node.type === Panel
          if (panel) index++
          const dividerOffset = offset
          offset += panel ? sizes[index] ?? 0 : isValidElement<{ hidden?: boolean }>(node) && !node.props.hidden ? theme.design.shape.separatorWidth : 0
          return <SlotContext.Provider key={isValidElement(node) ? node.key : index} value={index}><DividerOffsetContext.Provider value={dividerOffset}>{node}</DividerOffsetContext.Provider></SlotContext.Provider>
        })}
      </DividerLayer>
    </GroupContext.Provider>
  )
}
