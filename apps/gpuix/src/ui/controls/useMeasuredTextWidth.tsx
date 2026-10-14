import { useEffect, useMemo, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { NativeRenderer, PublicInstance, StyleDesc } from "@gpuix/react"
import type { FloatingAlign, FloatingSide } from "@gpuix/react/floating"
import type { RefObject } from "react"

const widths = new Map<string, number>()

type MeasuredElement =
  { id: number; props: { style?: StyleDesc } } | { id: number; style?: StyleDesc }

/**
 * gpuix 0.10 reports alignment-dependent padding origins but border-excluded size.
 * Upstream .changeset/bounds-include-padding.md fixes this to the real box.
 * 升级到含此修复的 gpuix 后整体删除此 shim，所有测量在此切回原生 API。
 */
export function readOuterBounds(
  renderer: NativeRenderer | null | undefined,
  instance: MeasuredElement | null | undefined
) {
  if (!instance) return null
  const bounds = renderer?.getElementBounds?.(instance.id)
  if (!bounds) return null
  const style = "props" in instance ? instance.props.style : instance.style
  const borderLeft = style?.borderLeftWidth ?? style?.borderWidth ?? 0
  const borderRight = style?.borderRightWidth ?? style?.borderWidth ?? 0
  const borderTop = style?.borderTopWidth ?? style?.borderWidth ?? 0
  const borderBottom = style?.borderBottomWidth ?? style?.borderWidth ?? 0
  const paddingLeft = style?.paddingLeft ?? style?.padding ?? 0
  const paddingRight = style?.paddingRight ?? style?.padding ?? 0
  const paddingTop = style?.paddingTop ?? style?.padding ?? 0
  const paddingBottom = style?.paddingBottom ?? style?.padding ?? 0
  const horizontal = style?.flexDirection === "row" ? style.justifyContent : style?.alignItems
  const vertical = style?.flexDirection === "row" ? style.alignItems : style?.justifyContent
  const offsetX =
    horizontal === "center"
      ? (paddingLeft - paddingRight) / 2
      : horizontal === "end" || horizontal === "flex-end"
        ? -paddingRight
        : paddingLeft
  const offsetY =
    vertical === "center"
      ? (paddingTop - paddingBottom) / 2
      : vertical === "end" || vertical === "flex-end"
        ? -paddingBottom
        : paddingTop
  return {
    x: bounds.x - offsetX - borderLeft,
    y: bounds.y - offsetY - borderTop,
    width: bounds.width + borderLeft + borderRight,
    height: bounds.height + borderTop + borderBottom,
  }
}

/** Measures the actual gpuix text layout once per font/sample set; never observes the live value. */
export function useMeasuredTextWidth(
  samples: readonly string[],
  textStyle: Pick<StyleDesc, "fontSize" | "fontFamily" | "fontWeight" | "lineHeight">
) {
  const { renderer } = useGpuix()
  const key = JSON.stringify([textStyle, samples])
  const sampleSet = useMemo(() => [...samples], [samples])
  const nodes = useRef<Array<PublicInstance | null>>([])
  const estimate = Math.ceil(
    Math.max(0, ...sampleSet.map(sample => [...sample].length)) * (textStyle.fontSize ?? 12) * 0.62
  )
  const [result, setResult] = useState<{ key: string; width: number } | null>(null)
  const cached = widths.get(key)
  const width = cached ?? (result?.key === key ? result.width : estimate)
  const measured = cached !== undefined || result?.key === key

  useEffect(() => {
    if (widths.has(key) || !renderer?.getElementBounds) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const measure = () => {
      if (disposed) return
      const cachedWidth = widths.get(key)
      if (cachedWidth !== undefined) {
        setResult({ key, width: cachedWidth })
        return
      }
      const bounds = sampleSet.map((_, index) => readOuterBounds(renderer, nodes.current[index]))
      if (bounds.some(bound => !bound || bound.height <= 0)) {
        timer = setTimeout(measure, 16)
        return
      }
      const next = Math.ceil(Math.max(0, ...bounds.map(bound => bound?.width ?? 0)))
      widths.set(key, next)
      setResult({ key, width: next })
    }
    timer = setTimeout(measure, 0)
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [key, renderer, sampleSet])

  const sampleNodes = measured ? null : (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        opacity: 0,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "start",
        userSelect: "none",
      }}
    >
      {sampleSet.map((sample, index) => (
        <text
          key={`${index}:${sample}`}
          ref={node => {
            nodes.current[index] = node
          }}
          style={{ ...textStyle, whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {sample}
        </text>
      ))}
    </div>
  )
  return { width, measured, sampleNodes }
}

/** gpuix 0.10 centers the surface end at the anchor midpoint; remove after upstream fixes center alignment. */
export function useFloatingCenterOffset({
  open,
  surface,
  side,
  align,
  style,
}: {
  open: boolean
  surface: RefObject<PublicInstance | null>
  side: FloatingSide
  align: FloatingAlign
  style: StyleDesc
}) {
  const { renderer } = useGpuix()
  const vertical = side === "left" || side === "right"
  const dimension = vertical ? style.height : style.width
  const maximum = vertical ? style.maxHeight : style.maxWidth
  const key = JSON.stringify([side, dimension, maximum, style.minWidth, style.minHeight])
  const fallback =
    typeof dimension === "number"
      ? Math.min(dimension, typeof maximum === "number" ? maximum : dimension) / 2
      : 0
  const [measurement, setMeasurement] = useState<{ key: string; value: number } | null>(null)
  useEffect(() => {
    if (!open || align !== "center") return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const sample = () => {
      if (disposed) return
      const bounds = readOuterBounds(renderer, surface.current)
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        timer = setTimeout(sample, 16)
        return
      }
      setMeasurement({ key, value: (vertical ? bounds.height : bounds.width) / 2 })
    }
    timer = setTimeout(sample, 0)
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [open, align, key, renderer, surface, vertical])
  return align === "center" ? (measurement?.key === key ? measurement.value : fallback) : 0
}
