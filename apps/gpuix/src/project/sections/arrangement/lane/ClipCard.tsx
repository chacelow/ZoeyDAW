import { memo } from "react"
import { clipLabel } from "@/project/model/clip-label"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { RenderClipCard } from "./clip-card-projection"
import type { PeakReader } from "@/project/model/backend"
import { ClipContentsView } from "./ClipContents"

export const ClipCardView = memo(function ClipCardView({
  card,
  trackColor,
  viewportWidth,
  numerator,
  automationMode,
  readPeaks,
  onActivate,
}: {
  card: RenderClipCard
  trackColor: string
  viewportWidth: number
  numerator: number
  automationMode: boolean
  readPeaks: PeakReader
  onActivate: (id: string) => void
}) {
  const theme = useTheme()
  const g = card.geometry
  const clip = card.clip
  const visibleLeft = Math.max(0, g.left)
  const width = Math.max(0, Math.min(viewportWidth, g.left + g.width) - visibleLeft)
  return (
    <div
      testId={`${card.ghost ? "clip-ghost" : "clip-source"}-${clip.id}`}
      role="button"
      aria-label={clipLabel(clip)}
      aria-pressed={card.selected}
      tabIndex={card.ghost ? -1 : 0}
      onKeyDown={event => {
        if (event.key !== "enter") return
        event.preventDefault()
        event.stopPropagation()
        onActivate(clip.id)
      }}
      style={sx({
        position: "absolute",
        left: visibleLeft,
        top: g.top,
        width,
        height: g.height,
        overflow: "hidden",
        userSelect: "none",
        opacity: card.ghost ? 0.5 : 1,
        pointerEvents: "none",
        keyboardFocusDim: false,
        focusVisible: { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
      })}
    >
      <ClipContentsView
        card={card.content}
        trackColor={trackColor}
        numerator={numerator}
        automationMode={automationMode}
        readPeaks={readPeaks}
      />
    </div>
  )
})
