import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTrackLabels } from "../labels"
import { LevelMeter } from "@/ui/controls/LevelMeter"
import type { LevelMeterChannel, LevelMeterVariant } from "@/ui/controls/LevelMeter"
import { useProjectState } from "@/project/adapters"
import { advanceMeterPeak, createMeterPeak, meterDb } from "../../core/meters/meter-peak"
import { advanceMeterRms, createMeterRms } from "../../core/meters/meter-rms"
import { useMeterEnvironment } from "./telemetry"

export function TrackMeter({
  trackId,
  trackName,
  height,
  variant = "track",
  main = false,
}: {
  readonly trackId: string
  readonly trackName: string
  readonly height: number
  readonly variant?: LevelMeterVariant
  readonly main?: boolean
}) {
  const { t, formats } = useTrackLabels()
  const { telemetry: readTelemetry, driver, policy } = useMeterEnvironment()
  const { minDb, maxDb } = policy
  const reader = useRef(readTelemetry)
  useLayoutEffect(() => {
    reader.current = readTelemetry
  }, [readTelemetry])
  const epoch = useProjectState(state => state.session.backend.sessionId)
  const peaks = useRef({ left: createMeterPeak(policy), right: createMeterPeak(policy) })
  const rms = useRef({ left: createMeterRms(policy), right: createMeterRms(policy) })
  const silentDisplay = useMemo<readonly [LevelMeterChannel, LevelMeterChannel]>(
    () => [
      { rmsDb: minDb, peakDb: minDb, holdDb: minDb },
      { rmsDb: minDb, peakDb: minDb, holdDb: minDb },
    ],
    [minDb]
  )
  const [display, setDisplay] = useState(silentDisplay)
  useLayoutEffect(() => {
    peaks.current = { left: createMeterPeak(policy), right: createMeterPeak(policy) }
    rms.current = { left: createMeterRms(policy), right: createMeterRms(policy) }
    setDisplay(silentDisplay)
    return driver.subscribe({
      active() {
        const level = reader.current()?.levels[trackId]
        return (
          meterDb(level?.peak[0] ?? minDb, policy) > minDb ||
          meterDb(level?.peak[1] ?? minDb, policy) > minDb ||
          peaks.current.left.db > minDb ||
          peaks.current.right.db > minDb ||
          rms.current.left.db > minDb ||
          rms.current.right.db > minDb
        )
      },
      advance(now) {
        const level = reader.current()?.levels[trackId]
        const leftPeak = meterDb(level?.peak[0] ?? minDb, policy)
        const rightPeak = meterDb(level?.peak[1] ?? minDb, policy)
        advanceMeterPeak(peaks.current.left, leftPeak, now, policy)
        advanceMeterPeak(peaks.current.right, rightPeak, now, policy)
        advanceMeterRms(rms.current.left, level?.rms[0] ?? minDb, now, policy)
        advanceMeterRms(rms.current.right, level?.rms[1] ?? minDb, now, policy)
        const channels: readonly [LevelMeterChannel, LevelMeterChannel] = [
          { rmsDb: rms.current.left.db, peakDb: leftPeak, holdDb: peaks.current.left.db },
          { rmsDb: rms.current.right.db, peakDb: rightPeak, holdDb: peaks.current.right.db },
        ]
        setDisplay(previous =>
          previous.every((channel, index) => {
            const next = channels[index]
            return (
              next &&
              channel.rmsDb === next.rmsDb &&
              channel.peakDb === next.peakDb &&
              channel.holdDb === next.holdDb
            )
          })
            ? previous
            : channels
        )
        return (
          peaks.current.left.db > minDb ||
          peaks.current.right.db > minDb ||
          rms.current.left.db > minDb ||
          rms.current.right.db > minDb
        )
      },
    })
  }, [trackId, epoch, driver, policy, minDb, silentDisplay])
  return (
    <LevelMeter
      testId={part => {
        const prefix = variant === "inline" ? "track-inline-meter" : "track-meter"
        return part === "root" ? `${prefix}-${trackId}` : `${prefix}-${part}-${trackId}`
      }}
      aria-label={`${t("levelMeter")} ${trackName}`}
      aria-valuetext={formats.meter(display[0].peakDb, display[1].peakDb)}
      minDb={minDb}
      maxDb={maxDb}
      height={height}
      variant={variant}
      main={main}
      channels={display}
    />
  )
}
