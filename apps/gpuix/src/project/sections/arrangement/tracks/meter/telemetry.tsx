import { useArrangementPolicy } from "../../configuration"
import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { flushSync } from "@gpuix/react"
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useProjectState } from "@/project/adapters"
import { useAnimationFrame, useResumeFrame } from "@/platform/frame"
import { createMeterDecayDriver } from "./decay-driver"
import type { ReactNode } from "react"
import type { BackendTelemetry } from "@/project/model/backend"
import type { MeterDecayDriver } from "./decay-driver"
import type { LevelMeterChannel } from "@/ui/controls/LevelMeter"
import { advanceMeterPeak, createMeterPeak, meterDb } from "../../core/meters/meter-peak"
import { advanceMeterRms, createMeterRms } from "../../core/meters/meter-rms"

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
  const { meter: policy } = useArrangementPolicy()
  const levels = useProjectState(state => state.session.levels)
  const inputLevels = useProjectState(state => state.session.inputLevels)
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
  const environment = useMemo(() => ({ telemetry, driver, policy }), [telemetry, driver, policy])
  useLayoutEffect(() => driver.wake(), [levels, inputLevels, epoch, telemetry, driver, policy])
  return <TelemetryContext.Provider value={environment}>{children}</TelemetryContext.Provider>
}

export function useMeterEnvironment(): MeterEnvironment {
  const environment = useContext(TelemetryContext)
  if (!environment) throw new Error("Track meters require TrackTelemetryProvider")
  return environment
}

export function useInputChannelMeter(channelId: string) {
  const { telemetry, driver, policy } = useMeterEnvironment()
  const { minDb } = policy
  const epoch = useProjectState(state => state.session.backend.sessionId)
  const inputLevels = useProjectState(state => state.session.inputLevels)
  const reader = useMemo(() => () => telemetry()?.inputLevels[channelId], [telemetry, channelId])
  const level = inputLevels[channelId]
  const peaks = useRef({ left: createMeterPeak(policy), right: createMeterPeak(policy) })
  const rms = useRef({ left: createMeterRms(policy), right: createMeterRms(policy) })
  const silent = useMemo<readonly [LevelMeterChannel, LevelMeterChannel]>(
    () => [
      { rmsDb: minDb, peakDb: minDb, holdDb: minDb },
      { rmsDb: minDb, peakDb: minDb, holdDb: minDb },
    ],
    [minDb]
  )
  const [display, setDisplay] = useState(silent)
  useLayoutEffect(() => {
    peaks.current = { left: createMeterPeak(policy), right: createMeterPeak(policy) }
    rms.current = { left: createMeterRms(policy), right: createMeterRms(policy) }
    setDisplay(silent)
    return driver.subscribe({
      active() {
        const latest = reader()
        return (
          meterDb(latest?.peak[0] ?? minDb, policy) > minDb ||
          meterDb(latest?.peak[1] ?? minDb, policy) > minDb ||
          peaks.current.left.db > minDb || peaks.current.right.db > minDb ||
          rms.current.left.db > minDb || rms.current.right.db > minDb
        )
      },
      advance(now) {
        const latest = reader()
        const leftPeak = meterDb(latest?.peak[0] ?? minDb, policy)
        const rightPeak = meterDb(latest?.peak[1] ?? minDb, policy)
        advanceMeterPeak(peaks.current.left, leftPeak, now, policy)
        advanceMeterPeak(peaks.current.right, rightPeak, now, policy)
        advanceMeterRms(rms.current.left, latest?.rms[0] ?? minDb, now, policy)
        advanceMeterRms(rms.current.right, latest?.rms[1] ?? minDb, now, policy)
        const next: readonly [LevelMeterChannel, LevelMeterChannel] = [
          { rmsDb: rms.current.left.db, peakDb: leftPeak, holdDb: peaks.current.left.db },
          { rmsDb: rms.current.right.db, peakDb: rightPeak, holdDb: peaks.current.right.db },
        ]
        setDisplay(previous => previous.every((channel, index) => {
          const updated = next[index]
          return updated && channel.rmsDb === updated.rmsDb && channel.peakDb === updated.peakDb && channel.holdDb === updated.holdDb
        }) ? previous : next)
        return peaks.current.left.db > minDb || peaks.current.right.db > minDb ||
          rms.current.left.db > minDb || rms.current.right.db > minDb
      },
    })
  }, [channelId, epoch, driver, policy, minDb, silent, reader])
  useLayoutEffect(() => driver.wake(), [level, epoch, driver])
  return display
}
