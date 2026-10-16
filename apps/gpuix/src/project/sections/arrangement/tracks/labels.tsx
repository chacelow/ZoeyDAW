import { createContext, useContext, useMemo } from "react"
import type { ReactNode } from "react"
import type { trackResources } from "./locales"
import type { DisplayFormats } from "@/project/model/display-formats"
import type { Track } from "@/project/model/types"

type TrackTextKey = keyof (typeof trackResources)["en-US"]["arrangement"]

export type TrackLabels = Readonly<Record<TrackTextKey, string>> & {
  readonly formats: DisplayFormats
  readonly monitorModes: Readonly<Record<NonNullable<Track["monitor"]>, string>>
  readonly monitorShortNames: Readonly<Record<NonNullable<Track["monitor"]>, string>>
}

const TrackLabelsContext = createContext<TrackLabels | null>(null)

export function TrackLabelsProvider({
  labels,
  children,
}: {
  readonly labels: TrackLabels
  readonly children: ReactNode
}) {
  return <TrackLabelsContext.Provider value={labels}>{children}</TrackLabelsContext.Provider>
}

export function useTrackLabels() {
  const labels = useContext(TrackLabelsContext)
  if (!labels) throw new Error("Track controls require injected TrackLabels")
  return useMemo(
    () => ({
      t: (key: TrackTextKey) => labels[key],
      formats: labels.formats,
      monitorModes: labels.monitorModes,
      monitorShortNames: labels.monitorShortNames,
    }),
    [labels]
  )
}
