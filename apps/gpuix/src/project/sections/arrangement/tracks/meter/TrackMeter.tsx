import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTrackLabels } from "../labels"
import { LevelMeter } from "@/ui/controls/LevelMeter"
import { useProjectState } from "@/project/adapters"
import { advanceMeterPeak, createMeterPeak, meterDb } from "../../core/meters/meter-peak"
import { useMeterEnvironment } from "./telemetry"

interface MeterDisplay {
  left: number
  right: number
  leftPeak: number
  rightPeak: number
}

export function TrackMeter({
  trackId,
  trackName,
  height,
}: {
  readonly trackId: string
  readonly trackName: string
  readonly height: number
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
  const silentDisplay = useMemo<MeterDisplay>(
    () => ({
      left: minDb,
      right: minDb,
      leftPeak: minDb,
      rightPeak: minDb,
    }),
    [minDb]
  )
  const [display, setDisplay] = useState(silentDisplay)
  useLayoutEffect(() => {
    peaks.current = { left: createMeterPeak(policy), right: createMeterPeak(policy) }
    setDisplay(silentDisplay)
    return driver.subscribe({
      active() {
        const level = reader.current()?.levels[trackId]
        return (
          meterDb(level?.[0] ?? minDb, policy) > minDb ||
          meterDb(level?.[1] ?? minDb, policy) > minDb ||
          peaks.current.left.db > minDb ||
          peaks.current.right.db > minDb
        )
      },
      advance(now) {
        const level = reader.current()?.levels[trackId]
        const left = meterDb(level?.[0] ?? minDb, policy)
        const right = meterDb(level?.[1] ?? minDb, policy)
        advanceMeterPeak(peaks.current.left, left, now, policy)
        advanceMeterPeak(peaks.current.right, right, now, policy)
        const leftPeak = peaks.current.left.db
        const rightPeak = peaks.current.right.db
        setDisplay(previous =>
          previous.left === left &&
          previous.right === right &&
          previous.leftPeak === leftPeak &&
          previous.rightPeak === rightPeak
            ? previous
            : { left, right, leftPeak, rightPeak }
        )
        return leftPeak > minDb || rightPeak > minDb
      },
    })
  }, [trackId, epoch, driver, policy, minDb, silentDisplay])
  return (
    <LevelMeter
      testId={part =>
        part === "root" ? `track-meter-${trackId}` : `track-meter-${part}-${trackId}`
      }
      aria-label={`${t("levelMeter")} ${trackName}`}
      aria-valuetext={formats.meter(display.left, display.right)}
      minDb={minDb}
      maxDb={maxDb}
      height={height}
      channels={[
        { db: display.left, peakDb: display.leftPeak },
        { db: display.right, peakDb: display.rightPeak },
      ]}
    />
  )
}
