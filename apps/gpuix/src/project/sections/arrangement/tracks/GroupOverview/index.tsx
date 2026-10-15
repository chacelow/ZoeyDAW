import { useTheme } from "@/shared/theme/ThemeProvider"
import { clipRect } from "../../core/layout"
import { contentFill } from "@/shared/theme/content-color"
import { useTrackLabels } from "../labels"
import type { Track } from "@/project/model/types"
import type { ArrangementViewport } from "../../core/scene"

export function GroupOverview({
  track,
  descendants,
  viewport,
  height,
}: {
  readonly track: Track
  readonly descendants: readonly Track[]
  readonly viewport: ArrangementViewport
  readonly height: number
}) {
  const theme = useTheme()
  const { t } = useTrackLabels()
  const bandHeight = height / Math.max(1, descendants.length)
  const width = Math.max(0, viewport.width - theme.project.controlsWidth)
  return (
    <div
      role="img"
      aria-label={`${t("groupOverview")} ${track.name}`}
      testId={`track-group-overview-${track.id}`}
      style={{
        position: "relative",
        width: "100%",
        height,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {descendants.flatMap((descendant, index) =>
        descendant.clips.map(clip => {
          const rect = clipRect(
            clip,
            { track: descendant, top: index * bandHeight, height: bandHeight },
            viewport.pxPerBar,
            viewport.scrollX
          )
          if (rect.left + rect.width <= 0 || rect.left >= width) return null
          return (
            <div
              key={clip.id}
              testId={`track-summary-${clip.id}`}
              style={{
                position: "absolute",
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                backgroundColor: contentFill(clip.color ?? descendant.color, theme.colors),
                borderBottomWidth: 1,
                borderColor: theme.colors.arrangementLine,
              }}
            />
          )
        })
      )}
    </div>
  )
}
