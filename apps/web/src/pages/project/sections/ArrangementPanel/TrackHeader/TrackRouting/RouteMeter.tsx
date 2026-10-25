import { ProjectMeter } from "@/pages/project/components/ProjectMeter"
import type { RouteOption } from "./options"
import type { ProjectMeterSource } from "@/pages/project/adapters/realtime"

export function withRouteMeters(items: RouteOption[], source: (id: string) => ProjectMeterSource) {
  return items.map(item => ({
    ...item,
    label: (
      <span className="flex min-w-0 items-center gap-1.5 text-left">
        <ProjectMeter source={source(item.id)} />
        <span className="min-w-0 truncate">{item.label}</span>
      </span>
    ),
  }))
}
