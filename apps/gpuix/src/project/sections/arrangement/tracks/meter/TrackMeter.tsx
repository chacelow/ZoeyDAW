import { useLayoutEffect, useRef, useState } from "react"
import { useTrackLabels } from "../labels"
import { useTheme } from "../../../../../shared/theme/ThemeProvider"
import { useProjectState } from "../../../../adapters"
import {
  advanceMeterPeak,
  createMeterPeak,
  meterDb,
  METER_MIN_DB,
  METER_MAX_DB,
} from "../../core/meters/meter-peak"
import { meterDecayDriver } from "./decay-driver"
import type { MeterDecayDriver } from "./decay-driver"
import { useTrackTelemetry } from "./telemetry"

interface MeterDisplay {
  left: number
  right: number
  leftPeak: number
  rightPeak: number
}
const SILENT_DISPLAY: MeterDisplay = {
  left: METER_MIN_DB,
  right: METER_MIN_DB,
  leftPeak: METER_MIN_DB,
  rightPeak: METER_MIN_DB,
}

export function TrackMeter({
  trackId,
  trackName,
  height,
  driver = meterDecayDriver,
}: {
  readonly trackId: string
  readonly trackName: string
  readonly height: number
  readonly driver?: MeterDecayDriver
}) {
  const { t } = useTrackLabels()
  const theme = useTheme()
  const readTelemetry = useTrackTelemetry()
  const epoch = useProjectState(state => state.session.backend.sessionId)
  const peaks = useRef({ left: createMeterPeak(), right: createMeterPeak() })
  const [display, setDisplay] = useState(SILENT_DISPLAY)
  useLayoutEffect(() => {
    peaks.current = { left: createMeterPeak(), right: createMeterPeak() }
    setDisplay(SILENT_DISPLAY)
    return driver.subscribe(now => {
      const level = readTelemetry()?.levels[trackId]
      const left = meterDb(level?.[0] ?? METER_MIN_DB)
      const right = meterDb(level?.[1] ?? METER_MIN_DB)
      advanceMeterPeak(peaks.current.left, left, now)
      advanceMeterPeak(peaks.current.right, right, now)
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
      return leftPeak > METER_MIN_DB || rightPeak > METER_MIN_DB
    })
  }, [trackId, epoch, driver, readTelemetry])
  const width = theme.control["--spacing-control-track"]
  const channelWidth = Math.floor((width - 1) / 2)
  const zeroY = Math.min(
    height - 1,
    Math.round((height * METER_MAX_DB) / (METER_MAX_DB - METER_MIN_DB))
  )
  return (
    <div
      role="meter"
      aria-label={`${t("levelMeter")} ${trackName}`}
      aria-valuemin={METER_MIN_DB}
      aria-valuemax={METER_MAX_DB}
      aria-valuenow={Math.max(display.left, display.right)}
      aria-valuetext={`L ${display.left.toFixed(1)} dB, R ${display.right.toFixed(1)} dB`}
      testId={`track-meter-${trackId}`}
      style={{
        position: "relative",
        width,
        height,
        flexShrink: 0,
        backgroundColor: theme.colors.card,
      }}
    >
      {(["left", "right"] as const).map((channel, index) => {
        const level = display[channel]
        const peak = channel === "left" ? display.leftPeak : display.rightPeak
        const top = Math.round(
          height * (1 - (level - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB))
        )
        const peakY = Math.min(
          height - 1,
          Math.round(height * (1 - (peak - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)))
        )
        return (
          <div
            key={channel}
            testId={`track-meter-${channel}-${trackId}`}
            style={{
              position: "absolute",
              left: index === 0 ? 0 : channelWidth + 1,
              top: 0,
              width: index === 0 ? channelWidth : width - channelWidth - 1,
              height,
              overflow: "hidden",
              backgroundColor: theme.colors.meterGood,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: zeroY,
                bottom: 0,
                left: 0,
                right: 0,
                background: {
                  type: "linear-gradient",
                  angle: 180,
                  stops: [
                    { position: 0, color: theme.colors.meterWarn },
                    { position: 0.3, color: theme.colors.meterGood },
                  ],
                },
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                height: zeroY,
                left: 0,
                right: 0,
                backgroundColor: theme.colors.meterDanger,
              }}
            />
            <div
              aria-hidden="true"
              testId={`track-meter-floor-${channel}-${trackId}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: top,
                backgroundColor: theme.colors.muted,
              }}
            />
            {peak > METER_MIN_DB ? (
              <div
                aria-hidden="true"
                testId={`track-meter-peak-${channel}-${trackId}`}
                style={{
                  position: "absolute",
                  top: peakY,
                  left: 0,
                  right: 0,
                  height: 1,
                  backgroundColor: theme.colors.meterPeak,
                }}
              />
            ) : null}
          </div>
        )
      })}
      <div
        aria-hidden="true"
        testId={`track-meter-zero-${trackId}`}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: zeroY,
          height: 1,
          backgroundColor: theme.colors.card,
        }}
      />
    </div>
  )
}
