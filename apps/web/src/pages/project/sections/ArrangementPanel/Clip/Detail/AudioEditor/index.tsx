import { useTranslation } from "@zoeymind/i18n"
import { DragPadNumber } from "@zoeymind/ui"
import { DEFAULT_FADE_CURVE, fadeControls, fadePath } from "@/pages/project/model/fades"
import { projectActions, useProjectEditGesture } from "@/pages/project/adapters"
import type { AudioClip } from "@/pages/project/model/types"

type AudioField = "gainDb" | "fadeInBars" | "fadeOutBars"

function AudioFieldControl({
  clip,
  field,
  label,
}: {
  readonly clip: AudioClip
  readonly field: AudioField
  readonly label: string
}) {
  const gesture = useProjectEditGesture((value: number) =>
    projectActions.updateClip(clip.id, { [field]: value })
  )
  return (
    <label className="flex items-center gap-2">
      {label}
      <DragPadNumber
        size="compact"
        label={label}
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
        {...gesture}
      />
    </label>
  )
}

export function AudioEditor({ clip }: { readonly clip: AudioClip }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 text-xs">
      <div className="text-muted-foreground truncate">
        {t("arrangement.sample")} · {clip.samplePath}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {(["gainDb", "fadeInBars", "fadeOutBars"] as const).map(field => (
          <AudioFieldControl
            key={field}
            clip={clip}
            field={field}
            label={t(`arrangement.${field}`)}
          />
        ))}
      </div>
      <div
        className="border-border relative h-12 overflow-hidden rounded border"
        style={{ background: clip.color ?? "var(--primary)" }}
      >
        {clip.waveformPeaks?.map((peak, index, peaks) => (
          <div
            key={index}
            className="bg-foreground/70 absolute top-1/2 w-[1px] -translate-y-1/2"
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
