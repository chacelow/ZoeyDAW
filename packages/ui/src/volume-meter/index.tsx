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
  readonly className?: string
  readonly "aria-label"?: string
}

const DEFAULT_MIN = -60
const DEFAULT_MAX = 6
const DEFAULT_CLIP = 0

function dbToRatio(db: number, min: number, max: number): number {
  return Number.isFinite(db) ? Math.max(0, Math.min(1, (db - min) / (max - min))) : 0
}

/**
单根柱,share by mono / stereo
*/
function Bar({
  ratio,
  peakRatio,
  clipRatio,
  orientation,
}: {
  readonly ratio: number
  readonly peakRatio: number | undefined
  readonly clipRatio: number
  readonly orientation: "vertical" | "horizontal"
}) {
  const isVertical = orientation === "vertical"
  // 填充色:低段 → 高段渐变,超 clip 阈值切 error
  const fillGradient = isVertical
    ? `linear-gradient(to top, var(--chart-2) 0%, var(--chart-2) ${clipRatio * 75}%, var(--chart-4) ${clipRatio * 100}%, var(--destructive) ${clipRatio * 100}%)`
    : `linear-gradient(to right, var(--chart-2) 0%, var(--chart-2) ${clipRatio * 75}%, var(--chart-4) ${clipRatio * 100}%, var(--destructive) ${clipRatio * 100}%)`
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
        isVertical ? "h-full w-1" : "h-1 w-full",
        isClipped && "ring-destructive/60 ring-1"
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
  className,
  "aria-label": ariaLabel = "Volume level",
}: VolumeMeterProps) {
  const isStereo = Array.isArray(levelDb)
  const [l, r] = isStereo ? levelDb : [levelDb, levelDb]
  const [pl, pr] = Array.isArray(peakDb) ? peakDb : [peakDb, peakDb]
  const clipRatio = dbToRatio(clipDb, minDb, maxDb)
  const isVertical = orientation === "vertical"

  return (
    <div
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={minDb}
      aria-valuemax={maxDb}
      aria-valuenow={Number.isFinite(Math.max(l, r)) ? Math.max(l, r) : minDb}
      className={cn(
        "inline-flex gap-px",
        isVertical ? "h-full flex-row" : "w-full flex-col",
        className
      )}
    >
      <Bar
        ratio={dbToRatio(l, minDb, maxDb)}
        peakRatio={pl === undefined ? undefined : dbToRatio(pl, minDb, maxDb)}
        clipRatio={clipRatio}
        orientation={orientation}
      />
      {isStereo ? (
        <Bar
          ratio={dbToRatio(r, minDb, maxDb)}
          peakRatio={pr === undefined ? undefined : dbToRatio(pr, minDb, maxDb)}
          clipRatio={clipRatio}
          orientation={orientation}
        />
      ) : null}
    </div>
  )
}
