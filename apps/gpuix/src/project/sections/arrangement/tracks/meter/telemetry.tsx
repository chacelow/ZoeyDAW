import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react"
import { useProjectState } from "@/project/adapters"
import { useAnimationFrame } from "@/platform/frame"
import { createMeterDecayDriver } from "./decay-driver"
import type { ReactNode } from "react"
import type { BackendTelemetry } from "@/project/model/backend"
import type { MeterDecayDriver } from "./decay-driver"

export type TelemetryReader = () => BackendTelemetry | null

export interface MeterEnvironment {
  readonly telemetry: TelemetryReader
  readonly driver: MeterDecayDriver
}
const TelemetryContext = createContext<MeterEnvironment | null>(null)

export function TrackTelemetryProvider({
  telemetry,
  children,
}: {
  readonly telemetry: TelemetryReader
  readonly children: ReactNode
}) {
  const levels = useProjectState(state => state.session.levels)
  const epoch = useProjectState(state => state.session.backend.sessionId)
  const [active, setActive] = useState(false)
  const driver = useMemo(() => createMeterDecayDriver(setActive), [])
  useAnimationFrame(timestampMs => driver.advance(timestampMs), active)
  const environment = useMemo(() => ({ telemetry, driver }), [telemetry, driver])
  useLayoutEffect(() => driver.wake(), [levels, epoch, telemetry, driver])
  return <TelemetryContext.Provider value={environment}>{children}</TelemetryContext.Provider>
}

export function useMeterEnvironment(): MeterEnvironment {
  const environment = useContext(TelemetryContext)
  if (!environment) throw new Error("Track meters require TrackTelemetryProvider")
  return environment
}
