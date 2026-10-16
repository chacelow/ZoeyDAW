import { memo } from "react"
import { clipLabel } from "@/project/model/clip-label"
import { sx } from "@/shared/theme/style"
import { useTheme } from "@/shared/theme/ThemeProvider"
import type { RenderClipCard } from "./clip-card-projection"
import type { PeakReader } from "@/project/model/backend"
import { ClipContentsView } from "./ClipContents"
import type { CreationNames } from "@/project/defaults/template"

export const ClipCardView = memo(function ClipCardView({
  card,
  trackColor,
  viewportWidth,
  numerator,
  automationMode,
  readPeaks,
  creationNames,
}: {
  card: RenderClipCard
  trackColor: string
  viewportWidth: number
  numerator: number
  automationMode: boolean
  readPeaks: PeakReader
  creationNames: Pick<CreationNames, "clip">
}) {
  const theme = useTheme()
  const g = card.geometry
  const clip = card.clip
  const visibleLeft = Math.max(0, g.left)
  const width = Math.max(0, Math.min(viewportWidth, g.left + g.width) - visibleLeft)
  return (
    <div
      testId={`${card.ghost ? "clip-ghost" : "clip-source"}-${clip.id}`}
      role="group"
      aria-label={clipLabel(clip, creationNames)}
      style={sx({
        position: "absolute",
        left: visibleLeft,
        top: g.top,
        width,
        height: g.height,
        overflow: "hidden",
        userSelect: "none",
        opacity: card.ghost ? theme.design.editor.clipGhostOpacity : 1,
        pointerEvents: "none",
      })}
    >
      <ClipContentsView
        card={card.content}
        trackColor={trackColor}
        numerator={numerator}
        automationMode={automationMode}
        readPeaks={readPeaks}
        creationNames={creationNames}
      />
    </div>
  )
})
