import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/controls"
import type { ReactNode } from "react"

export function GalleryCard({
  title,
  toggleLabel,
  testId,
  children,
  defaultExpanded = true,
}: {
  readonly title: string
  readonly toggleLabel: string
  readonly testId: string
  readonly children: ReactNode
  readonly defaultExpanded?: boolean
}) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <Card
      size="controls"
      testId={testId}
      aria-label={title}
      style={{ width: theme.layout.gallery.cardWidth, flexShrink: 0 }}
    >
      <CardHeader
        testId={`${testId}-header`}
        disclosure={{ expanded, onExpandedChange: setExpanded, label: toggleLabel }}
      >
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {expanded ? <CardContent testId={`${testId}-content`}>{children}</CardContent> : null}
    </Card>
  )
}
