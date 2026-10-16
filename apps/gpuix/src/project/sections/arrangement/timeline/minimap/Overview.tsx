import { memo } from "react"
import { useProjectState } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { resolveContentColor } from "@/shared/theme/content-color"
import { clipRect } from "../../core/layout"

export const Overview = memo(function Overview({
  bars,
  width,
  height,
}: {
  bars: number
  width: number
  height: number
}) {
  const theme = useTheme()
  const tracks = useProjectState(state => state.document.tracks)
  const markers = useProjectState(state => state.document.markers)
  const rows = tracks.filter(track => track.kind !== "return" && track.kind !== "main")
  const rowHeight = height / Math.max(1, rows.length)
  return (
    <>
      {rows.map((track, index) => (
        <div
          key={track.id}
          testId={`minimap-track-${track.id}`}
          style={sx({
            position: "absolute",
            left: 0,
            top: index * rowHeight,
            width,
            height: rowHeight,
            borderBottomWidth: 1,
            borderColor: theme.colors.arrangementLine,
            pointerEvents: "none",
          })}
        >
          {track.clips.map(clip => {
            const rect = clipRect(
              clip,
              { track, top: 0, height: rowHeight, trackGeometry: theme.layout.track },
              width / bars,
              0
            )
            return (
              <div
                key={clip.id}
                testId={`minimap-clip-${clip.id}`}
                style={sx({
                  position: "absolute",
                  left: rect.left,
                  top: 0,
                  width: rect.width,
                  height: Math.max(1, rowHeight - 1),
                  backgroundColor: resolveContentColor(clip.color ?? track.color, theme.colors),
                  pointerEvents: "none",
                })}
              />
            )
          })}
        </div>
      ))}
      {markers.map(marker => (
        <div
          key={marker.id}
          testId={`minimap-marker-${marker.id}`}
          style={sx({
            position: "absolute",
            top: 0,
            left: ((marker.bar - 1) / bars) * width,
            width: 1,
            height,
            backgroundColor: theme.colors.mutedForeground,
            pointerEvents: "none",
          })}
        />
      ))}
    </>
  )
})
