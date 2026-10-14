import { createContext, useContext, useEffect } from "react"
import { readProjectTelemetry, useProjectState } from "../../../../adapters"
import { meterDecayDriver } from "./decay-driver"
import type { ReactNode } from "react"
import type { BackendTelemetry } from "../../../../model/backend"

export type TelemetryReader = () => BackendTelemetry | null
const TelemetryContext = createContext<TelemetryReader>(readProjectTelemetry)

export function TrackTelemetryProvider({
  telemetry,
  children,
}: {
  readonly telemetry: TelemetryReader
  readonly children: ReactNode
}) {
  const levels = useProjectState(state => state.session.levels)
  const epoch = useProjectState(state => state.session.backend.sessionId)
  useEffect(() => meterDecayDriver.wake(), [levels, epoch, telemetry])
  return <TelemetryContext.Provider value={telemetry}>{children}</TelemetryContext.Provider>
}

export function useTrackTelemetry(): TelemetryReader {
  return useContext(TelemetryContext)
}
