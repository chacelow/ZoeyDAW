import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, Tooltip, TooltipContent, TooltipTrigger, VolumeMeter } from "@zoeymind/ui"
import { ValueEcho } from "./gallery-section"

export type MeterSignalState = "silence" | "low" | "nominal" | "unity" | "overload"
type Stereo = [left: number, right: number]
interface MeterFrame {
  levels: Stereo
  peaks: Stereo
}
const FLOOR = -60
const SCENARIOS: Record<MeterSignalState, Stereo> = {
  silence: [-Infinity, -Infinity],
  low: [-42, -48],
  nominal: [-12, -18],
  unity: [0, -3],
  overload: [4, 1],
}
const CHANNELS: [0, 1] = [0, 1]
const SCENARIO_IDS: MeterSignalState[] = ["silence", "low", "nominal", "unity", "overload"]

export function MeterDemos() {
  const { t } = useTranslation()
  const [scenario, setScenario] = useState<MeterSignalState>("silence")
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState<MeterFrame>({ levels: [FLOOR, FLOOR], peaks: [FLOOR, FLOOR] })
  const current = useRef(frame)
  const heldUntil = useRef<Stereo>([0, 0])
  const clock = useRef(0)
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let timer: number | undefined
    let previous = performance.now()
    let disposed = false
    const tick = () => {
      if (disposed || document.hidden) return
      const now = performance.now()
      const elapsed = Math.max(0, now - previous)
      previous = now
      clock.current += elapsed
      const next: MeterFrame = {
        levels: [...current.current.levels],
        peaks: [...current.current.peaks],
      }
      const targets = SCENARIOS[scenario]
      for (const channel of CHANNELS) {
        const modulation =
          !motion.matches && (scenario === "low" || scenario === "nominal")
            ? 3 * (Math.sin(clock.current / (channel === 0 ? 180 : 270)) - 1)
            : 0
        const target = playing ? Math.max(FLOOR, targets[channel] + modulation) : FLOOR
        next.levels[channel] =
          target >= next.levels[channel]
            ? target
            : Math.max(target, next.levels[channel] - (48 * elapsed) / 1000)
        const level = next.levels[channel]
        if (level >= next.peaks[channel] && level > FLOOR) {
          next.peaks[channel] = level
          heldUntil.current[channel] = clock.current + 600
        } else {
          const decayMs = Math.max(
            0,
            clock.current - Math.max(clock.current - elapsed, heldUntil.current[channel])
          )
          next.peaks[channel] = Math.max(level, FLOOR, next.peaks[channel] - (24 * decayMs) / 1000)
        }
      }
      current.current = next
      setFrame(next)
      if (
        (playing && scenario !== "silence") ||
        next.levels.some(value => value > FLOOR) ||
        next.peaks.some(value => value > FLOOR)
      ) {
        timer = window.setTimeout(tick, motion.matches ? 100 : 33)
      }
    }
    const visibility = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      previous = performance.now()
      if (!document.hidden) tick()
    }
    tick()
    document.addEventListener("visibilitychange", visibility)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [scenario, playing])
  const levels: Stereo = [
    frame.levels[0] <= FLOOR ? -Infinity : frame.levels[0],
    frame.levels[1] <= FLOOR ? -Infinity : frame.levels[1],
  ]
  const peaks: Stereo = [
    frame.peaks[0] <= FLOOR ? -Infinity : frame.peaks[0],
    frame.peaks[1] <= FLOOR ? -Infinity : frame.peaks[1],
  ]
  const format = (values: readonly number[]) =>
    values.map(value => (Number.isFinite(value) ? `${value.toFixed(1)} dB` : "−∞ dB")).join(" / ")
  return (
    <section
      aria-labelledby="gallery-meter-controls"
      data-testid="meter-demos"
      className="gap-control-gap flex flex-col py-3"
    >
      <h3 id="gallery-meter-controls" className="text-xs font-medium">
        {t("library.meters.title")}
      </h3>
      <div
        className="gap-control-track-gap flex flex-wrap items-center py-2"
        role="group"
        aria-label={t("library.meters.signal")}
      >
        {SCENARIO_IDS.map(id => (
          <Button
            key={id}
            size="control"
            variant="secondary"
            aria-pressed={scenario === id}
            onClick={() => {
              setScenario(id)
              setPlaying(id !== "silence")
            }}
          >
            {t(`library.meters.${id}`)}
          </Button>
        ))}
        <Button
          size="control"
          variant="secondary"
          aria-pressed={playing}
          onClick={() => setPlaying(value => !value)}
        >
          {t(playing ? "library.meters.stop" : "library.meters.play")}
        </Button>
        <Button
          size="control"
          variant="secondary"
          onClick={() => {
            setPlaying(false)
            setScenario("silence")
            clock.current = 0
            heldUntil.current = [0, 0]
            const reset: MeterFrame = { levels: [FLOOR, FLOOR], peaks: [FLOOR, FLOOR] }
            current.current = reset
            setFrame(reset)
          }}
        >
          {t("library.meters.reset")}
        </Button>
      </div>
      <div className="gap-control-track-gap flex flex-wrap items-end py-3">
        <figure className="flex flex-col gap-2">
          <div className="h-40 w-2">
            <VolumeMeter
              levelDb={levels[0]}
              peakDb={peaks[0]}
              aria-label={t("library.meters.monoVertical")}
              aria-valuetext={format([levels[0]])}
              className="w-full"
            />
          </div>
          <figcaption className="text-muted-foreground text-[11px]">
            {t("library.meters.monoVertical")}
          </figcaption>
        </figure>
        <figure className="flex flex-col gap-2">
          <div className="h-40 w-5">
            <VolumeMeter
              levelDb={levels}
              peakDb={peaks}
              aria-label={t("library.meters.stereoVertical")}
              aria-valuetext={`${t("library.meters.signal")}: ${format(levels)}`}
              className="w-full"
            />
          </div>
          <figcaption className="text-muted-foreground text-[11px]">
            {t("library.meters.stereoVertical")}
          </figcaption>
        </figure>
        <figure className="flex flex-col gap-2">
          <div className="relative ml-9 h-40 w-7">
            <VolumeMeter
              appearance="track"
              levelDb={levels}
              peakDb={peaks}
              aria-label={t("library.meters.track")}
              aria-valuetext={`${t("library.meters.signal")}: ${format(levels)}`}
              className="w-full"
            />
            {[6, 0, -12, -24, -36, -48, -60].map(db => (
              <span
                key={db}
                className="text-muted-foreground absolute right-full mr-2 text-[9px] leading-none tabular-nums"
                style={{
                  bottom: `clamp(0px, calc(${((db + 60) / 66) * 100}% - 4px), calc(100% - 8px))`,
                }}
              >
                {db > 0 ? `+${db}` : db}
              </span>
            ))}
          </div>
          <figcaption className="text-muted-foreground text-[11px]">
            {t("library.meters.track")}
          </figcaption>
        </figure>
      </div>
      <div className="gap-control-track-gap flex max-w-lg flex-col py-3">
        <span className="text-muted-foreground text-[11px]">
          {t("library.meters.monoHorizontal")}
        </span>
        <VolumeMeter
          orientation="horizontal"
          levelDb={levels[0]}
          peakDb={peaks[0]}
          aria-label={t("library.meters.monoHorizontal")}
          aria-valuetext={format([levels[0]])}
          className="h-2"
        />
        <span className="text-muted-foreground text-[11px]">
          {t("library.meters.stereoHorizontal")}
        </span>
        <VolumeMeter
          orientation="horizontal"
          levelDb={levels}
          peakDb={peaks}
          aria-label={t("library.meters.stereoHorizontal")}
          aria-valuetext={`${t("library.meters.signal")}: ${format(levels)}`}
          className="h-5"
        />
        <VolumeMeter
          appearance="track"
          orientation="horizontal"
          levelDb={levels}
          peakDb={peaks}
          aria-label={`${t("library.meters.track")} — ${t("library.meters.stereoHorizontal")}`}
          aria-valuetext={`${t("library.meters.signal")}: ${format(levels)}`}
          className="h-5"
        />
        <div className="text-muted-foreground relative h-3 text-[9px] tabular-nums">
          {[-60, -36, -12, 0, 6].map(db => (
            <span
              key={db}
              className="absolute"
              style={{
                left: `${((db + 60) / 66) * 100}%`,
                transform:
                  db === -60 ? undefined : db === 6 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {db > 0 ? `+${db}` : db}
            </span>
          ))}
        </div>
      </div>
      <ValueEcho
        pairs={[
          [t("library.meters.signal"), format(levels)],
          [t("library.meters.peak"), format(peaks)],
        ]}
      />
      <Tooltip>
        <TooltipTrigger className="text-muted-foreground w-fit text-[11px]">
          {t("library.meters.status")}
        </TooltipTrigger>
        <TooltipContent>{t("library.meters.localOnly")}</TooltipContent>
      </Tooltip>
    </section>
  )
}
