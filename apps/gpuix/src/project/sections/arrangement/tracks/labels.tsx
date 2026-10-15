import { createContext, useContext, useMemo } from "react"
import type { ReactNode } from "react"
import type { trackResources } from "./locales"

export type TrackLabels = {
  readonly [Key in keyof (typeof trackResources)["en-US"]["arrangement"]]: string
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
  return useMemo(() => ({ t: (key: keyof TrackLabels) => labels[key] }), [labels])
}
