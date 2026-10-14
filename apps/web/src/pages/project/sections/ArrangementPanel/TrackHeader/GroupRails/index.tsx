import type { GroupRail } from "@/pages/project/model/track-groups"

export function GroupRails({ rails }: { readonly rails: readonly GroupRail[] }) {
  return (
    <div className="arrangement-group-rails" aria-hidden="true">
      {rails.map(({ group, closes }) => (
        <span
          key={group.id}
          className="arrangement-group-rail"
          data-closes={closes || undefined}
          style={{
            backgroundColor: `color-mix(in oklab, ${group.color}, var(--arrangement-clip-paper) var(--arrangement-clip-tint))`,
          }}
        />
      ))}
    </div>
  )
}
