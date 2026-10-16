import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTrackLabels } from "../labels"
import { useTheme } from "@/shared/theme/ThemeProvider"
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
  const { t } = useTrackLabels()
  const theme = useTheme()
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
  const width = theme.control["--spacing-control-track"]
  const { channelGap, peakWidth, zeroWidth, warningStop } = theme.design.editor.meter
  // Stereo has two channels; level ratios remain normalized independently of visual metrics.
  const channelWidth = Math.floor((width - channelGap) / 2)
  const zeroY = Math.min(height - zeroWidth, Math.round((height * maxDb) / (maxDb - minDb)))
  return (
    <div
      role="meter"
      aria-label={`${t("levelMeter")} ${trackName}`}
      aria-valuemin={minDb}
      aria-valuemax={maxDb}
      aria-valuenow={Math.max(display.left, display.right)}
      aria-valuetext={`L ${display.left.toFixed(1)} dB, R ${display.right.toFixed(1)} dB`}
      testId={`track-meter-${trackId}`}
      style={{
        position: "relative",
        width,
        height,
        flexShrink: 0,
        backgroundColor: theme.colors.arrangementSurfaceAlt,
      }}
    >
      {(["left", "right"] as const).map((channel, index) => {
        const level = display[channel]
        const peak = channel === "left" ? display.leftPeak : display.rightPeak
        const top = Math.round(height * (1 - (level - minDb) / (maxDb - minDb)))
        const peakY = Math.min(
          height - peakWidth,
          Math.round(height * (1 - (peak - minDb) / (maxDb - minDb)))
        )
        return (
          <div
            key={channel}
            testId={`track-meter-${channel}-${trackId}`}
            style={{
              position: "absolute",
              left: index === 0 ? 0 : channelWidth + channelGap,
              top: 0,
              width: index === 0 ? channelWidth : width - channelWidth - channelGap,
              height,
              overflow: "hidden",
              backgroundColor: theme.colors.arrangementMeterGood,
            }}
          >
            <div
              aria-hidden="true"
              testId={`track-meter-gradient-${channel}-${trackId}`}
              style={{
                position: "absolute",
                top: zeroY,
                bottom: 0,
                left: 0,
                right: 0,
                background: {
                  type: "linear-gradient",
                  // A half turn directs the normalized gradient downward; this is geometry, not style.
                  angle: 180,
                  stops: [
                    { position: 0, color: theme.colors.arrangementMeterWarn },
                    { position: warningStop, color: theme.colors.arrangementMeterGood },
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
                backgroundColor: theme.colors.arrangementMeterDanger,
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
            {peak > minDb ? (
              <div
                aria-hidden="true"
                testId={`track-meter-peak-${channel}-${trackId}`}
                style={{
                  position: "absolute",
                  top: peakY,
                  left: 0,
                  right: 0,
                  height: peakWidth,
                  backgroundColor: theme.colors.arrangementMeterPeak,
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
          height: zeroWidth,
          backgroundColor: theme.colors.arrangementSurfaceAlt,
        }}
      />
    </div>
  )
}
