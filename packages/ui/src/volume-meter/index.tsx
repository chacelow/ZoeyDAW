/**
 * dB 电平显示支持单声道、立体声及横纵布局。 电平和峰值由调用方推进；组件不持有播放时钟或峰值保持状态。
 */
import { cn } from "../cn"

export interface VolumeMeterProps {
  /**
  当前电平 dB(可为 -Infinity 代表静默)
  */
  readonly levelDb: number | [left: number, right: number]
  /**
  峰值保持 dB(可选,渲染为一根高亮细线)
  */
  readonly peakDb?: number | [left: number, right: number]
  /**
  显示范围下限 dB,低于此值当 silent
  */
  readonly minDb?: number
  /**
  显示范围上限 dB(柱满)
  */
  readonly maxDb?: number
  /**
  超过此 dB 切红色,通常 0 dB 为 unity
  */
  readonly clipDb?: number
  readonly orientation?: "vertical" | "horizontal"
  readonly appearance?: "compact" | "track"
  readonly className?: string
  readonly "aria-label"?: string
  readonly "aria-valuetext"?: string
}

const DEFAULT_MIN = -60
const DEFAULT_MAX = 6
const DEFAULT_CLIP = 0

function dbToRatio(db: number, min: number, max: number): number {
  return Number.isNaN(db) ? 0 : Math.max(0, Math.min(1, (db - min) / (max - min)))
}

/**
单根柱,share by mono / stereo
*/
function Bar({
  ratio,
  peakRatio,
  clipRatio,
  orientation,
  appearance,
}: {
  readonly ratio: number
  readonly peakRatio: number | undefined
  readonly clipRatio: number
  readonly orientation: "vertical" | "horizontal"
  readonly appearance: "compact" | "track"
}) {
  const isVertical = orientation === "vertical"
  const warningColor = "light-dark(var(--chart-4), var(--chart-3))"
  const hotColor = `color-mix(in srgb, var(--destructive) 75%, ${warningColor})`
  const stops = `var(--chart-2) 0%, var(--chart-2) ${clipRatio * 45}%, ${warningColor} ${clipRatio * 75}%, ${hotColor} ${clipRatio * 100}%, var(--destructive) ${clipRatio * 100}%`
  const fillGradient = `linear-gradient(${isVertical ? "to top" : "to right"}, ${stops})`
  const peakStyle =
    peakRatio !== undefined && peakRatio > 0
      ? isVertical
        ? {
            bottom: `calc(${peakRatio * 100}% - 1px)`,
            left: 0,
            right: 0,
            height: "1px",
          }
        : {
            left: `calc(${peakRatio * 100}% - 1px)`,
            top: 0,
            bottom: 0,
            width: "1px",
          }
      : null
  const isClipped = ratio > 0 && ratio >= clipRatio
  return (
    <div
      className={cn(
        "bg-muted relative overflow-hidden",
        appearance === "track"
          ? isVertical
            ? "h-full min-w-1 flex-1"
            : "min-h-1 w-full flex-1"
          : isVertical
            ? "h-full w-1"
            : "h-1 w-full",
        appearance === "track" && "bg-card",
        appearance === "compact" && isClipped && "ring-destructive/60 ring-1"
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: fillGradient,
          clipPath: isVertical
            ? `inset(${(1 - ratio) * 100}% 0 0 0)`
            : `inset(0 ${(1 - ratio) * 100}% 0 0)`,
        }}
      />
      {peakStyle ? <div aria-hidden className="bg-foreground absolute" style={peakStyle} /> : null}
      {appearance === "track" ? (
        <div
          aria-hidden
          className="bg-card absolute"
          style={
            isVertical
              ? { bottom: `calc(${clipRatio * 100}% - 1px)`, left: 0, right: 0, height: 1 }
              : { left: `calc(${clipRatio * 100}% - 1px)`, top: 0, bottom: 0, width: 1 }
          }
        />
      ) : null}
    </div>
  )
}

export function VolumeMeter({
  levelDb,
  peakDb,
  minDb = DEFAULT_MIN,
  maxDb = DEFAULT_MAX,
  clipDb = DEFAULT_CLIP,
  orientation = "vertical",
  appearance = "compact",
  className,
  "aria-label": ariaLabel = "Volume level",
  "aria-valuetext": ariaValueText,
}: VolumeMeterProps) {
  const isStereo = Array.isArray(levelDb)
  const [l, r] = isStereo ? levelDb : [levelDb, levelDb]
  const [pl, pr] = Array.isArray(peakDb) ? peakDb : [peakDb, peakDb]
  const clipRatio = dbToRatio(clipDb, minDb, maxDb)
  const isVertical = orientation === "vertical"
  const leftText = Number.isFinite(l) ? String(l) : l === Infinity ? "+∞" : "−∞"
  const rightText = Number.isFinite(r) ? String(r) : r === Infinity ? "+∞" : "−∞"

  return (
    <div
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={minDb}
      aria-valuemax={maxDb}
      aria-valuenow={minDb + dbToRatio(Math.max(l, r), minDb, maxDb) * (maxDb - minDb)}
      aria-valuetext={
        ariaValueText ?? (isStereo ? `${leftText} / ${rightText} dB` : `${leftText} dB`)
      }
      className={cn(
        "inline-flex gap-px",
        appearance === "track" && "bg-card",
        isVertical ? "h-full flex-row" : "w-full flex-col",
        className
      )}
    >
      <Bar
        ratio={dbToRatio(l, minDb, maxDb)}
        peakRatio={pl === undefined ? undefined : dbToRatio(pl, minDb, maxDb)}
        clipRatio={clipRatio}
        orientation={orientation}
        appearance={appearance}
      />
      {isStereo ? (
        <Bar
          ratio={dbToRatio(r, minDb, maxDb)}
          peakRatio={pr === undefined ? undefined : dbToRatio(pr, minDb, maxDb)}
          clipRatio={clipRatio}
          orientation={orientation}
          appearance={appearance}
        />
      ) : null}
    </div>
  )
}
