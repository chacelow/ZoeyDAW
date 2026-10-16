import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { flushSync } from "@gpuix/react"
import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react"
import { useProjectState } from "@/project/adapters"
import { useAnimationFrame, useResumeFrame } from "@/platform/frame"
import { createMeterDecayDriver } from "./decay-driver"
import type { ReactNode } from "react"
import type { BackendTelemetry } from "@/project/model/backend"
import type { MeterDecayDriver } from "./decay-driver"

export type TelemetryReader = () => BackendTelemetry | null

export interface MeterEnvironment {
  readonly telemetry: TelemetryReader
  readonly driver: MeterDecayDriver
  readonly policy: ArrangementPolicy["meter"]
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
  const playing = useProjectState(state => state.session.playing)
  const [active, setActive] = useState(false)
  const driver = useMemo(() => createMeterDecayDriver(setActive), [])
  useAnimationFrame(timestampMs => driver.advance(timestampMs), active)
  useResumeFrame(timestampMs => {
    flushSync(() => {
      driver.wake()
      driver.advance(timestampMs)
    })
  }, playing || active)
  const environment = useMemo(
    () => ({ telemetry, driver, policy: ARRANGEMENT_DEFAULTS.meter }),
    [telemetry, driver]
  )
  useLayoutEffect(() => driver.wake(), [levels, epoch, telemetry, driver])
  return <TelemetryContext.Provider value={environment}>{children}</TelemetryContext.Provider>
}

export function useMeterEnvironment(): MeterEnvironment {
  const environment = useContext(TelemetryContext)
  if (!environment) throw new Error("Track meters require TrackTelemetryProvider")
  return environment
}
