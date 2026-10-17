import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { TruncatedText } from "@/ui/controls"
import { useMeasuredTextWidth } from "@/ui/controls/useMeasuredTextWidth"
import { snapControlWidth } from "@/ui/controls/grid"
import type { DisplayFormats } from "@/project/model/display-formats"
import type { ReactNode } from "react"
import type { Props } from "@gpuix/react"

export interface GallerySectionProps {
  readonly locale: "en" | "zh"
  readonly formats: DisplayFormats
  readonly t: (en: string, zh: string) => string
}

const GalleryGridContext = createContext<{
  labelWidth: number
  stateWidth: number | undefined
  measureState: (id: string, width: number | undefined) => void
} | null>(null)

export function GallerySection({
  id,
  title,
  description,
  children,
  columns,
}: {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
  readonly columns?: {
    readonly label: string
    readonly states: readonly string[]
    readonly width: number
  }
}) {
  const theme = useTheme()
  const unit = theme.control["--spacing-control-track"]
  const labels = Children.toArray(children).flatMap(child =>
    isValidElement<{ label: string }>(child) && child.type === GalleryVariant ? [child.props.label] : []
  )
  if (columns) labels.push(columns.label)
  const measurement = useMeasuredTextWidth(labels, { fontSize: theme.control["--text-control-track"] })
  const [stateWidths, setStateWidths] = useState<Record<string, number>>({})
  const measureState = useCallback((id: string, width: number | undefined) => {
    setStateWidths(current => {
      if (current[id] === width) return current
      const next = { ...current }
      if (width === undefined) delete next[id]
      else next[id] = width
      return next
    })
  }, [])
  const stateWidth = columns?.width ?? Math.max(0, ...Object.values(stateWidths))
  return (
    <GalleryGridContext.Provider value={{
      labelWidth: snapControlWidth(measurement.width, unit),
      stateWidth: stateWidth > 0 ? snapControlWidth(stateWidth, unit) : undefined,
      measureState,
    }}>
    <div
      testId={`gallery-section-${id}`}
      role="group"
      aria-label={title}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        flexShrink: 0,
        minWidth: 0,
        gap: theme.design.spacing.stackGap,
      }}
    >
      {measurement.sampleNodes}
      <div
        testId={`gallery-section-${id}-header`}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: theme.control["--spacing-control-track-gap"],
        }}
      >
        <text style={{ fontWeight: theme.design.typography.weights.semibold }}>{title}</text>
        {description ? (
          <text style={{ color: theme.colors.mutedForeground }}>{description}</text>
        ) : null}
      </div>
      <div
        testId={`gallery-section-${id}-content`}
        style={{ display: "flex", flexDirection: "column", gap: theme.design.spacing.stackGap }}
      >
        {columns ? (
          <GalleryVariant label={columns.label}>
            {columns.states.map((state, index) => (
              <TruncatedText
                key={state}
                testId={`gallery-section-${id}-column-${index}`}
                width={columns.width}
                style={{ flexShrink: 0 }}
              >
                {state}
              </TruncatedText>
            ))}
          </GalleryVariant>
        ) : null}
        {children}
      </div>
    </div>
    </GalleryGridContext.Provider>
  )
}

export function GalleryVariant({
  label,
  children,
  testId,
  block = false,
}: {
  readonly label: string
  readonly children: ReactNode
  readonly testId?: string
  /** Large demos: label above, content spans the full width instead of a grid row. */
  readonly block?: boolean
}) {
  const theme = useTheme()
  const grid = useContext(GalleryGridContext)
  return (
    <div
      testId={testId}
      role="group"
      aria-label={label}
      style={{
        display: "flex",
        flexDirection: block ? "column" : "row",
        alignItems: block ? "stretch" : "center",
        gap: block ? theme.control["--spacing-control-track-gap"] : theme.control["--spacing-control-track"],
        minWidth: 0,
      }}
    >
      <TruncatedText
        width={block ? undefined : grid?.labelWidth ?? theme.design.grid.labelWidthUnits * theme.control["--spacing-control-track"]}
        style={{ flexShrink: 0, color: theme.colors.mutedForeground }}
      >
        {label}
      </TruncatedText>
      {Children.map(children, child =>
        isValidElement(child) && child.type === GalleryState ? <GalleryCell>{child}</GalleryCell> : child
      )}
    </div>
  )
}

export function GalleryState({
  label,
  children,
  width,
}: {
  readonly label: string
  readonly children: ReactNode
  readonly width?: number
}) {
  const content = Children.map(children, child =>
    isValidElement<Props>(child) ? cloneElement(child, { "aria-description": label }) : child
  )
  return width === undefined ? (
    content
  ) : (
    <div style={{ display: "flex", width, flexShrink: 0, minWidth: 0 }}>{content}</div>
  )
}

function GalleryCell({ children }: { readonly children: ReactNode }) {
  const grid = useContext(GalleryGridContext)
  const id = useId()
  const measureState = grid?.measureState
  useEffect(() => () => measureState?.(id, undefined), [id, measureState])
  return (
    <div style={{ display: "flex", flexDirection: "row", width: grid?.stateWidth, flexShrink: 0, minWidth: 0 }}>
      <div
        onLayout={event => measureState?.(id, event.width)}
        style={{ display: "flex", flexDirection: "row", flexShrink: 0, alignItems: "center" }}
      >
        {children}
      </div>
    </div>
  )
}
