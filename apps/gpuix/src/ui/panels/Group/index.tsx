import { Children, isValidElement, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ReactElement, ReactNode } from "react"
import type { StyleDesc } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { GroupContext, SlotContext } from "../context"
import type { GroupState, LayoutSnapshot } from "../context"
import { computeLayout } from "../layout/computeLayout"
import { initialLayout, reflowLayout, resolveConstraints, snapSize } from "../layout/sizes"
import { Panel } from "../Panel"
import type { PanelProps } from "../Panel"
import { useElementSize } from "../useElementSize"

export interface GroupProps {
  orientation: "horizontal" | "vertical"
  children: ReactNode
  style?: StyleDesc
  id?: string
  testId?: string
}

export function Group({ orientation, children, style, id, testId }: GroupProps) {
  const theme = useTheme()
  const measurement = useElementSize()
  const nodes = useMemo(() => Children.toArray(children), [children])
  const panels = useMemo(
    () =>
      nodes.filter(
        (node): node is ReactElement<PanelProps> =>
          isValidElement<PanelProps>(node) && node.type === Panel
      ),
    [nodes]
  )
  const dividers = nodes.filter(
    node => isValidElement<{ hidden?: boolean }>(node) && node.type !== Panel && !node.props.hidden
  ).length
  const extent = orientation === "horizontal" ? measurement.width : measurement.height
  const available = Math.max(0, extent - dividers * theme.project.panelGap)
  const [stored, setStored] = useState<{ total: number; sizes: number[] } | null>(null)
  const dragging = useRef(false)
  const total =
    dragging.current && stored ? stored.total : available > 0 ? available : (stored?.total ?? 0)
  const constraints = useMemo(
    () =>
      total > 0
        ? resolveConstraints(
            panels.map(panel => panel.props),
            total
          )
        : [],
    [panels, total]
  )
  const sizes = useMemo(
    () =>
      stored?.sizes.length === panels.length
        ? stored.total === total
          ? stored.sizes
          : reflowLayout(
              stored.sizes,
              constraints,
              total,
              panels.map(panel => typeof panel.props.defaultSize === "number")
            )
        : total > 0
          ? initialLayout(
              panels.map(panel => panel.props.defaultSize),
              constraints,
              total
            )
          : [],
    [stored, panels, total, constraints]
  )
  const live = useRef<LayoutSnapshot>({ sizes, constraints, total })
  useLayoutEffect(() => {
    live.current = { sizes, constraints, total }
    if (total > 0 && (!stored || stored.total !== total || stored.sizes !== sizes)) {
      setStored({ total, sizes })
    }
  }, [sizes, constraints, total, stored])
  const state: GroupState = {
    orientation,
    sizes,
    constraints,
    total,
    resizePanel: (index, pixels) => {
      const current = live.current
      if (current.sizes.length === 0) return
      const desired = snapSize(pixels, current.constraints[index])
      const separator = index < current.sizes.length - 1 ? index : index - 1
      const delta = (desired - current.sizes[index]) * (separator === index ? 1 : -1)
      const next = {
        ...current,
        sizes:
          current.sizes.length === 1
            ? [Math.min(current.total, desired)]
            : computeLayout(current.sizes, current.constraints, { separator, delta }),
      }
      live.current = next
      setStored(next)
    },
    beginDrag: () => {
      dragging.current = true
      return live.current
    },
    preview: (snapshot, separator, delta) => {
      const next = {
        ...snapshot,
        sizes: computeLayout(snapshot.sizes, snapshot.constraints, { separator, delta }),
      }
      live.current = next
      setStored(next)
    },
    endDrag: restore => {
      dragging.current = false
      const next = restore ?? live.current
      live.current = next
      setStored({ total: next.total, sizes: [...next.sizes] })
    },
  }
  let index = -1
  return (
    <GroupContext.Provider value={state}>
      <div
        onLayout={measurement.onLayout}
        role="group"
        testId={testId ?? id}
        style={sx({ width: "100%", height: "100%" }, style, {
          // Full extents and zero minima are flex containment rules, not density preferences.
          display: "flex",
          flexDirection: orientation === "horizontal" ? "row" : "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        })}
      >
        {nodes.map(node => {
          if (isValidElement(node) && node.type === Panel) index++
          return (
            <SlotContext.Provider key={isValidElement(node) ? node.key : index} value={index}>
              {node}
            </SlotContext.Provider>
          )
        })}
      </div>
    </GroupContext.Provider>
  )
}
