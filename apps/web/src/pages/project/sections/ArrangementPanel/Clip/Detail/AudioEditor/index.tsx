import { useTranslation } from "@zoeymind/i18n"
import { DragPadNumber } from "@zoeymind/ui"
import type { AudioClip } from "@/pages/project/model/types"
import { DEFAULT_FADE_CURVE, fadeControls, fadePath } from "@/pages/project/model/fades"
import { projectActions } from "@/pages/project/adapters"

export function AudioEditor({ clip }: { clip: AudioClip }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 text-xs">
      <div className="truncate text-muted-foreground">
        {t("arrangement.sample")} · {clip.samplePath}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {(["gainDb", "fadeInBars", "fadeOutBars"] as const).map(field => (
          <label key={field} className="flex items-center gap-2">
            {t(`arrangement.${field}`)}
            <DragPadNumber
              size="compact"
              label={t(`arrangement.${field}`)}
              value={clip[field] ?? 0}
              min={field === "gainDb" ? -60 : 0}
              max={
                field === "gainDb"
                  ? 24
                  : Math.max(
                      0,
                      clip.lengthBars -
                        (clip.fadeInOffsetBars ?? 0) -
                        (clip.fadeOutOffsetBars ?? 0) -
                        (field === "fadeInBars" ? (clip.fadeOutBars ?? 0) : (clip.fadeInBars ?? 0))
                    )
              }
              step={field === "gainDb" ? 0.1 : 0.0625}
              defaultValue={0}
              format={value => value.toFixed(2)}
              onChange={value => projectActions.updateClip(clip.id, { [field]: value })}
              onGestureStart={projectActions.beginEdit}
              onGestureEnd={projectActions.endEdit}
              onGestureCancel={projectActions.cancelEdit}
            />
          </label>
        ))}
      </div>
      <div
        className="relative h-12 overflow-hidden rounded border border-border"
        style={{ background: clip.color ?? "var(--primary)" }}
      >
        {clip.waveformPeaks?.map((peak, index, peaks) => (
          <div
            key={index}
            className="absolute top-1/2 w-[1px] -translate-y-1/2 bg-foreground/70"
            style={{ left: `${(index / peaks.length) * 100}%`, height: `${peak * 95}%` }}
          />
        ))}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${clip.lengthBars} 100`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {(clip.fadeInBars ?? 0) > 0 && (
            <path
              d={fadePath(
                "in",
                fadeControls(clip, "in").start,
                clip.fadeInBars ?? 0,
                clip.fadeInCurve ?? DEFAULT_FADE_CURVE,
                clip.fadeInCurvePosition
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {(clip.fadeOutBars ?? 0) > 0 && (
            <path
              d={fadePath(
                "out",
                fadeControls(clip, "out").start,
                clip.fadeOutBars ?? 0,
                clip.fadeOutCurve ?? DEFAULT_FADE_CURVE,
                clip.fadeOutCurvePosition
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
    </div>
  )
}
