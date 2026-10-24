import { useProjectState } from "@/pages/project/adapters"
import type { RouteOption } from "./options"

/**
Compact stereo readout for routing menu rows: a narrow, tall square split into
left/right halves that fill from the bottom. Smaller than the track meter so it
reads as a menu variant rather than a duplicate meter.
*/
export function RouteMeter({ trackId }: { readonly trackId: string }) {
  const level = useProjectState(state => state.session.levels[trackId])
  const left = level?.[0] ?? -60
  const right = level?.[1] ?? -60
  return (
    <span aria-hidden className="flex h-3 w-3 shrink-0 items-stretch gap-px">
      {[left, right].map((value, index) => (
        <span key={index} className="bg-muted relative h-full flex-1 overflow-hidden">
          <span
            className="absolute inset-x-0 bottom-0 bg-[var(--arrangement-meter-good)]"
            style={{ height: `${Math.max(0, Math.min(100, ((value + 60) / 66) * 100))}%` }}
          />
        </span>
      ))}
    </span>
  )
}

export function withRouteMeters(items: RouteOption[], trackId: string) {
  return items.map(item => ({
    ...item,
    label: (
      <span className="flex min-w-0 items-center gap-1.5">
        <RouteMeter trackId={trackId} />
        <span className="min-w-0 truncate">{item.label}</span>
      </span>
    ),
  }))
}
