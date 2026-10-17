import { useTheme } from "@/shared/theme/ThemeProvider"
import { PeakReadout } from "./PeakReadout"
import { visibleFaderTicks } from "../Fader/ticks"
import { meterPosition } from "./scale"
import type { LinearGradientStop, Props } from "@gpuix/react"

export { meterPosition, meterDbAtPosition } from "./scale"
export type { MeterScale } from "./scale"

export interface LevelMeterChannel {
  readonly rmsDb: number
  readonly peakDb: number
  readonly holdDb: number
}

export type LevelMeterVariant = "track" | "collapsed" | "mixer" | "inline"

export interface LevelMeterProps extends Pick<Props, "aria-label" | "aria-valuetext"> {
  readonly channels: readonly [LevelMeterChannel, LevelMeterChannel]
  readonly minDb: number
  readonly maxDb: number
  readonly height: number
  readonly width?: number
  readonly variant?: LevelMeterVariant
  /** Main/master output: any overload turns the whole bar red, like Live's Main track. */
  readonly main?: boolean
  readonly testId?: (part: LevelMeterPart) => string
}

export type LevelMeterPart =
  | "root"
  | "bars"
  | "zero"
  | "readout"
  | `tick-${number}`
  | `number-${number}`
  | `${"" | "rms-" | "peak-" | "hold-" | "clip-"}${"left" | "right"}`

const CHANNELS = ["left", "right"] as const

export function LevelMeter({
  channels,
  minDb,
  maxDb,
  height,
  width: providedWidth,
  variant = "track",
  main = false,
  testId,
  ...aria
}: LevelMeterProps) {
  const theme = useTheme()
  const unit = theme.control["--spacing-control-track"]
  const geometry = theme.design.editor.meter
  const { scale, channelGap, peakWidth, zeroWidth, clipDb } = geometry
  const widthUnits = {
    track: geometry.trackWidthUnits,
    collapsed: geometry.collapsedWidthUnits,
    mixer: geometry.mixerWidthUnits,
    inline: geometry.inlineWidthUnits,
  }
  const barWidth = providedWidth ?? widthUnits[variant] * unit
  const readoutSpace = geometry.readoutHeightUnits * unit + geometry.readoutGap
  const showReadout =
    variant === "mixer" && height - readoutSpace >= geometry.numbersMinHeightUnits * unit
  const readoutHeight = showReadout ? geometry.readoutHeightUnits * unit : 0
  const barsTop = showReadout ? readoutSpace : 0
  const meterHeight = Math.max(0, height - barsTop)
  const showTicks =
    (variant === "track" || variant === "mixer") &&
    meterHeight >= geometry.ticksMinHeightUnits * unit
  const showNumbers =
    variant === "mixer" && showTicks && meterHeight >= geometry.numbersMinHeightUnits * unit
  const tickSpace = showTicks ? geometry.tickWidth + geometry.tickGap : 0
  const numberSpace = showNumbers ? geometry.numberWidthUnits * unit : 0
  const width = tickSpace + barWidth + numberSpace
  const channelWidth = (barWidth - channelGap) / 2
  const zeroY = meterPosition(clipDb, scale) * meterHeight
  const warnY = meterPosition(geometry.warnDb, scale) * meterHeight
  const goodY = meterPosition(geometry.goodDb, scale) * meterHeight
  const colors = theme.colors
  const gradient: readonly {
    readonly top: number
    readonly height: number
    readonly color?: string
    readonly stops?: [LinearGradientStop, LinearGradientStop]
  }[] = [
    { top: 0, height: zeroY, color: colors.arrangementMeterClip },
    {
      top: zeroY,
      height: warnY - zeroY,
      stops: [
        { position: 0, color: colors.arrangementMeterClip },
        { position: 1, color: colors.arrangementMeterWarn },
      ],
    },
    {
      top: warnY,
      height: goodY - warnY,
      stops: [
        { position: 0, color: colors.arrangementMeterWarn },
        { position: 1, color: colors.arrangementMeterGood },
      ],
    },
  ]
  const id = (part: LevelMeterPart) => testId?.(part)
  const ticks = showTicks
    ? visibleFaderTicks(
        scale
          .filter(point => point.db > minDb && point.db <= maxDb)
          .map(point => ({ value: point.db, label: String(Math.abs(point.db)) })),
        { scale, travel: meterHeight, lineHeight: unit, min: minDb, max: maxDb }
      )
    : []
  return (
    <div
      {...aria}
      role="meter"
      aria-valuemin={minDb}
      aria-valuemax={maxDb}
      aria-valuenow={Math.max(channels[0].peakDb, channels[1].peakDb)}
      testId={id("root")}
      style={{ position: "relative", width, height, flexShrink: 0, userSelect: "none" }}
    >
      {showReadout ? (
        <PeakReadout
          channels={channels}
          minDb={minDb}
          label={aria["aria-label"]}
          testId={id("readout")}
          style={{ position: "absolute", top: 0, left: 0, width, height: readoutHeight }}
        />
      ) : null}
      <div
        testId={id("bars")}
        aria-hidden="true"
        style={{
          position: "absolute",
          pointerEvents: "none",
          top: barsTop,
          left: tickSpace,
          width: barWidth,
          height: meterHeight,
          backgroundColor: theme.colors.arrangementSurfaceAlt,
        }}
      >
        {CHANNELS.map((channel, index) => {
          const { rmsDb, peakDb, holdDb } = channels[index === 0 ? 0 : 1]
          const rmsTop = meterPosition(rmsDb, scale) * meterHeight
          const peakTop = meterPosition(Math.max(rmsDb, peakDb), scale) * meterHeight
          const holdY = Math.min(
            meterHeight - peakWidth,
            meterPosition(holdDb, scale) * meterHeight
          )
          const overloaded = holdDb > clipDb
          // Live colours the fill by position (red above 0 dB → yellow → green), and the
          // fill reaches only the real level. A Main overload turns the whole bar red.
          const fill = (top: number, opacity: number, part: LevelMeterPart) => (
            <div
              testId={id(part)}
              style={{
                position: "absolute",
                pointerEvents: "none",
                top,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: "hidden",
                opacity,
                backgroundColor:
                  main && overloaded
                    ? theme.colors.arrangementMeterClip
                    : theme.colors.arrangementMeterGood,
              }}
            >
              {main && overloaded
                ? null
                : gradient.map(segment => (
                    <div
                      key={segment.top}
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        pointerEvents: "none",
                        top: segment.top - top,
                        height: segment.height,
                        left: 0,
                        right: 0,
                        ...(segment.stops
                          ? {
                              background: {
                                type: "linear-gradient",
                                angle: 180,
                                stops: segment.stops,
                              },
                            }
                          : { backgroundColor: segment.color }),
                      }}
                    />
                  ))}
            </div>
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
                width: channelWidth,
                height: meterHeight,
                overflow: "hidden",
                backgroundColor: theme.colors.muted,
              }}
            >
              {fill(peakTop, geometry.peakOpacity, `peak-${channel}`)}
              {fill(rmsTop, 1, `rms-${channel}`)}
              {holdDb > minDb ? (
                <div
                  testId={id(`hold-${channel}`)}
                  style={{
                    position: "absolute",
                    pointerEvents: "none",
                    top: holdY,
                    left: 0,
                    right: 0,
                    height: peakWidth,
                    backgroundColor: theme.colors.arrangementMeterPeak,
                  }}
                />
              ) : null}
              {overloaded ? (
                <div
                  testId={id(`clip-${channel}`)}
                  style={{
                    position: "absolute",
                    pointerEvents: "none",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: geometry.clipMinHeight,
                    backgroundColor: theme.colors.arrangementMeterClip,
                  }}
                />
              ) : null}
            </div>
          )
        })}
        <div
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
      {ticks.map(tick => {
        const y = barsTop + meterPosition(tick.value, scale) * meterHeight
        return (
          <div key={tick.value} aria-hidden="true" style={{ pointerEvents: "none" }}>
            <div
              testId={id(`tick-${tick.value}`)}
              style={{
                position: "absolute",
                pointerEvents: "none",
                top: y,
                left: 0,
                width: geometry.tickWidth,
                height: zeroWidth,
                backgroundColor: theme.colors.mutedForeground,
              }}
            />
            {showNumbers ? (
              <text
                testId={id(`number-${tick.value}`)}
                style={{
                  position: "absolute",
                  pointerEvents: "none",
                  top: Math.max(barsTop, Math.min(height - unit, y - unit / 2)),
                  left: tickSpace + barWidth + geometry.tickGap,
                  width: numberSpace - geometry.tickGap,
                  height: unit,
                  color: theme.colors.mutedForeground,
                  fontFamily: theme.design.typography.numberFontFamily,
                  fontSize: theme.control["--text-control-track"],
                }}
              >
                {tick.label}
              </text>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
