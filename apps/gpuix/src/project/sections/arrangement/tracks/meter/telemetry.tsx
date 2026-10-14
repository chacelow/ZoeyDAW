import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
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
  driver,
}: {
  readonly telemetry: TelemetryReader
  readonly children: ReactNode
  readonly driver?: MeterDecayDriver
}) {
  const levels = useProjectState(state => state.session.levels)
  const epoch = useProjectState(state => state.session.backend.sessionId)
  const nativeFrame = useRef<(() => void) | null>(null)
  const [active, setActive] = useState(false)
  const activeDriver = useMemo(
    () =>
      driver ??
      createMeterDecayDriver({
        subscribe(callback) {
          nativeFrame.current = callback
          setActive(true)
          return () => {
            nativeFrame.current = null
            setActive(false)
          }
        },
      }),
    [driver]
  )
  useAnimationFrame(() => nativeFrame.current?.(), active)
  const environment = useMemo(
    () => ({ telemetry, driver: activeDriver }),
    [telemetry, activeDriver]
  )
  useEffect(() => activeDriver.wake(), [levels, epoch, telemetry, activeDriver])
  return <TelemetryContext.Provider value={environment}>{children}</TelemetryContext.Provider>
}

export function useMeterEnvironment(): MeterEnvironment {
  const environment = useContext(TelemetryContext)
  if (!environment) throw new Error("Track meters require TrackTelemetryProvider")
  return environment
}
