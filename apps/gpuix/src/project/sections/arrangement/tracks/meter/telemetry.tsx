import { createContext, useContext, useEffect, useMemo } from "react"
import { readProjectTelemetry, useProjectState } from "@/project/adapters"
import { meterDecayDriver } from "./decay-driver"
import type { ReactNode } from "react"
import type { BackendTelemetry } from "@/project/model/backend"
import type { MeterDecayDriver } from "./decay-driver"

export type TelemetryReader = () => BackendTelemetry | null

export interface MeterEnvironment {
  readonly telemetry: TelemetryReader
  readonly driver: MeterDecayDriver
}
const TelemetryContext = createContext<MeterEnvironment>({
  telemetry: readProjectTelemetry,
  driver: meterDecayDriver,
})

export function TrackTelemetryProvider({
  telemetry,
  children,
  driver = meterDecayDriver,
}: {
  readonly telemetry: TelemetryReader
  readonly children: ReactNode
  readonly driver?: MeterDecayDriver
}) {
  const levels = useProjectState(state => state.session.levels)
  const epoch = useProjectState(state => state.session.backend.sessionId)
  const environment = useMemo(() => ({ telemetry, driver }), [telemetry, driver])
  useEffect(() => driver.wake(), [levels, epoch, telemetry, driver])
  return <TelemetryContext.Provider value={environment}>{children}</TelemetryContext.Provider>
}

export function useMeterEnvironment(): MeterEnvironment {
  return useContext(TelemetryContext)
}
