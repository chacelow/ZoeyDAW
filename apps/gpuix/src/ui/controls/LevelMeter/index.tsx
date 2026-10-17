import { useTheme } from "@/shared/theme/ThemeProvider"
import type { Props } from "@gpuix/react"

export interface LevelMeterChannel {
  readonly db: number
  readonly peakDb: number
}

export interface LevelMeterProps extends Pick<Props, "aria-label" | "aria-valuetext"> {
  readonly channels: readonly [LevelMeterChannel, LevelMeterChannel]
  readonly minDb: number
  readonly maxDb: number
  readonly height: number
  readonly width?: number
  readonly testId?: (part: LevelMeterPart) => string
}

export type LevelMeterPart =
  "root" | "zero" | `${"" | "gradient-" | "floor-" | "peak-"}${"left" | "right"}`

const CHANNELS = ["left", "right"] as const

export function LevelMeter({
  channels,
  minDb,
  maxDb,
  height,
  width: providedWidth,
  testId,
  ...aria
}: LevelMeterProps) {
  const theme = useTheme()
  const width = providedWidth ?? theme.control["--spacing-control-track"]
  const { channelGap, peakWidth, zeroWidth, warningStop } = theme.design.editor.meter
  const channelWidth = Math.floor((width - channelGap) / 2)
  const range = maxDb - minDb
  const zeroY = Math.min(height - zeroWidth, Math.round((height * maxDb) / range))
  const id = (part: LevelMeterPart) => testId?.(part)
  return (
    <div
      {...aria}
      role="meter"
      aria-valuemin={minDb}
      aria-valuemax={maxDb}
      aria-valuenow={Math.max(channels[0].db, channels[1].db)}
      testId={id("root")}
      style={{
        position: "relative",
        pointerEvents: "none",
        width,
        height,
        flexShrink: 0,
        backgroundColor: theme.colors.arrangementSurfaceAlt,
      }}
    >
      {CHANNELS.map((channel, index) => {
        const { db, peakDb } = channels[index === 0 ? 0 : 1]
        const top = Math.round(height * (1 - (db - minDb) / range))
        const peakY = Math.min(
          height - peakWidth,
          Math.round(height * (1 - (peakDb - minDb) / range))
        )
        return (
          <div
            key={channel}
            testId={id(channel)}
            style={{
              position: "absolute",
              pointerEvents: "none",
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
              testId={id(`gradient-${channel}`)}
              style={{
                position: "absolute",
                pointerEvents: "none",
                top: zeroY,
                bottom: 0,
                left: 0,
                right: 0,
                background: {
                  type: "linear-gradient",
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
                pointerEvents: "none",
                top: 0,
                height: zeroY,
                left: 0,
                right: 0,
                backgroundColor: theme.colors.arrangementMeterDanger,
              }}
            />
            <div
              aria-hidden="true"
              testId={id(`floor-${channel}`)}
              style={{
                position: "absolute",
                pointerEvents: "none",
                top: 0,
                left: 0,
                right: 0,
                height: top,
                backgroundColor: theme.colors.muted,
              }}
            />
            {peakDb > minDb ? (
              <div
                aria-hidden="true"
                testId={id(`peak-${channel}`)}
                style={{
                  position: "absolute",
                  pointerEvents: "none",
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
        testId={id("zero")}
        style={{
          position: "absolute",
          pointerEvents: "none",
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
