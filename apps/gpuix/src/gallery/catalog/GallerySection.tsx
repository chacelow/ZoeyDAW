import { Children, cloneElement, isValidElement } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { TruncatedText } from "@/ui/controls"
import type { DisplayFormats } from "@/project/model/display-formats"
import type { ReactNode } from "react"
import type { Props } from "@gpuix/react"

export interface GallerySectionProps {
  readonly locale: "en" | "zh"
  readonly formats: DisplayFormats
  readonly t: (en: string, zh: string) => string
}

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
  return (
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
  )
}

export function GalleryVariant({
  label,
  children,
  testId,
}: {
  readonly label: string
  readonly children: ReactNode
  readonly testId?: string
}) {
  const theme = useTheme()
  return (
    <div
      testId={testId}
      role="group"
      aria-label={label}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: theme.control["--spacing-control-track"],
        minWidth: 0,
      }}
    >
      <TruncatedText
        width={theme.design.grid.labelWidthUnits * theme.control["--spacing-control-track"]}
        style={{ flexShrink: 0, color: theme.colors.mutedForeground }}
      >
        {label}
      </TruncatedText>
      {children}
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
