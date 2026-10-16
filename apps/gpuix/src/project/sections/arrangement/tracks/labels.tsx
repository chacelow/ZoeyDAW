import { createContext, useContext, useMemo } from "react"
import type { ReactNode } from "react"
import type { DisplayFormats } from "@/project/model/display-formats"
import type { Track } from "@/project/model/types"

export interface TrackTextLabels {
  readonly rename: string
  readonly expand: string
  readonly collapse: string
  readonly duplicate: string
  readonly group: string
  readonly ungroup: string
  readonly trackColor: string
  readonly addAudio: string
  readonly addMidi: string
  readonly addGroup: string
  readonly deleteTrack: string
  readonly trackIdentity: string
  readonly trackName: string
  readonly trackHeight: string
  readonly routing: string
  readonly input: string
  readonly output: string
  readonly inputChannel: string
  readonly outputChannel: string
  readonly externalInput: string
  readonly allChannels: string
  readonly cueOutput: string
  readonly cueVolume: string
  readonly send: string
  readonly noInput: string
  readonly allInputs: string
  readonly noOutput: string
  readonly externalOutput: string
  readonly monitor: string
  readonly monitorIn: string
  readonly monitorAuto: string
  readonly monitorOff: string
  readonly mixer: string
  readonly trackEnabled: string
  readonly recordArm: string
  readonly volume: string
  readonly pan: string
  readonly automationParameter: string
  readonly levelMeter: string
  readonly trackLane: string
  readonly solo: string
  readonly post: string
  readonly postShort: string
  readonly preShort: string
}

export interface TrackLabels extends TrackTextLabels {
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
      t: (key: keyof TrackTextLabels) => labels[key],
      formats: labels.formats,
      monitorModes: labels.monitorModes,
      monitorShortNames: labels.monitorShortNames,
    }),
    [labels]
  )
}
