import { useTheme } from "@/shared/theme/ThemeProvider"
import { contentFill } from "@/shared/theme/content-color"
import type { GroupRail } from "@/project/model/track-groups"
import type { Track } from "@/project/model/types"

export function GroupRails({
  rails,
  track,
}: {
  readonly rails: readonly GroupRail[]
  readonly track: Track
}) {
  const theme = useTheme()
  const allRails =
    track.kind === "group"
      ? [
          ...rails,
          { group: track, closes: Boolean(track.collapsed || !track.childTrackIds?.length) },
        ]
      : rails
  return (
    <div
      aria-hidden="true"
      testId={`track-rails-${track.id}`}
      style={{
        display: "flex",
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        pointerEvents: "none",
      }}
    >
      {allRails.map(({ group, closes }) => (
        <div
          key={group.id}
          testId={`track-rail-${group.id}-${track.id}`}
          style={{
            width: theme.project.groupRailWidth,
            height: "100%",
            flexShrink: 0,
            backgroundColor: contentFill(
              group.color,
              theme.colors,
              theme.design.colorRecipes.contentPaperTint
            ),
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderTopWidth: group.id === track.id ? 1 : 0,
            borderBottomWidth: closes ? 1 : 0,
            borderColor: theme.colors.arrangementLine,
          }}
        />
      ))}
    </div>
  )
}
