import { useContext, useImperativeHandle, useLayoutEffect, useRef } from "react"
import type { ReactNode, Ref } from "react"
import type { StyleDesc } from "@gpuix/react"
import { sx } from "@/shared/theme/style"
import { SlotContext, usePanelGroup } from "../context"
import { toPixels } from "../layout/sizes"
import type { PanelConstraints, PanelSize } from "../layout/sizes"

export interface PanelDimensions {
  asPercentage: number
  inPixels: number
}

export interface PanelImperativeHandle {
  isCollapsed: () => boolean
  expand: () => void
  collapse: () => void
  resize: (pixels: number) => void
  getSize: () => PanelDimensions
}

export interface PanelProps extends PanelConstraints {
  children?: ReactNode
  defaultSize?: PanelSize
  onResize?: (size: PanelDimensions) => void
  panelRef?: Ref<PanelImperativeHandle>
  style?: StyleDesc
  id?: string
  testId?: string
}

export function Panel({
  children,
  defaultSize,
  onResize,
  panelRef,
  style,
  id,
  testId,
  collapsible,
}: PanelProps) {
  const group = usePanelGroup()
  const index = useContext(SlotContext)
  const pixels = group.sizes[index]
  const constraint = group.constraints[index]
  const restored = useRef<number | null>(null)
  const callback = useRef(onResize)
  useLayoutEffect(() => {
    callback.current = onResize
  }, [onResize])
  const collapsed = constraint
    ? constraint.collapsible && pixels === constraint.collapsed
    : collapsible && defaultSize === 0
  useLayoutEffect(() => {
    if (pixels === undefined) return
    if (!collapsed) restored.current = pixels
    callback.current?.({
      inPixels: pixels,
      asPercentage: group.total > 0 ? (pixels / group.total) * 100 : 0,
    })
  }, [pixels, group.total, collapsed])
  useImperativeHandle(panelRef, () => ({
    isCollapsed: () => Boolean(collapsed),
    getSize: () => ({
      inPixels: pixels ?? 0,
      asPercentage: group.total > 0 ? (pixels / group.total) * 100 : 0,
    }),
    resize: next => group.resizePanel(index, toPixels(next, group.total)),
    collapse: () => {
      if (constraint?.collapsible) group.resizePanel(index, constraint.collapsed)
    },
    expand: () => {
      if (!collapsed || !constraint) return
      const initial =
        defaultSize === undefined ? constraint.min : toPixels(defaultSize, group.total)
      group.resizePanel(index, Math.max(constraint.min, restored.current ?? initial))
    },
  }))
  const horizontal = group.orientation === "horizontal"
  const initialPixels = typeof defaultSize === "number" ? defaultSize : undefined
  const weighted =
    group.proportional && pixels !== undefined && initialPixels === undefined && !collapsed
  const extent = weighted ? 0 : (pixels ?? initialPixels)
  return (
    <div
      role="group"
      testId={testId ?? id}
      style={sx(style, {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
        minHeight: 0,
        flexShrink: 0,
        flexGrow: weighted
          ? pixels
          : pixels === undefined && initialPixels === undefined
            ? typeof defaultSize === "string"
              ? Number.parseFloat(defaultSize)
              : 1
            : 0,
        ...(horizontal ? { width: extent, height: "100%" } : { height: extent, width: "100%" }),
      })}
    >
      {children}
    </div>
  )
}
