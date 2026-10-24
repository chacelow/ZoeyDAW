import { useProjectState } from "@/pages/project/adapters"
import type { GroupRail } from "@zoeydaw/project-core/track-groups"

export function GroupRails({ rails }: { readonly rails: readonly GroupRail[] }) {
  const selectedIds = useProjectState(state => state.session.selectedTrackIds)
  const surface = useProjectState(state => state.session.trackSelectionSurface)
  return (
    <div className="arrangement-group-rails" aria-hidden="true">
      {rails.map(({ group, closes }) => (
        <span
          key={group.id}
          className="arrangement-group-rail"
          data-group-rail={group.id}
          data-selected={(surface === "header" && selectedIds.includes(group.id)) || undefined}
          data-closes={closes || undefined}
          style={{
            color:
              surface === "header" && selectedIds.includes(group.id)
                ? "var(--arrangement-clip-selected)"
                : `color-mix(in oklab, ${group.color}, var(--arrangement-clip-paper) var(--arrangement-clip-tint))`,
          }}
        />
      ))}
    </div>
  )
}
