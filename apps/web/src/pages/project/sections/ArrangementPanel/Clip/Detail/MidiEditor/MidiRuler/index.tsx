import { useTranslation } from "@zoeymind/i18n"
import { RULER_HEIGHT } from "../geometry"

export function MidiRuler({
  sourceOffsetBeats,
  totalBeats,
  numerator,
  width,
  loopBeats,
}: {
  readonly sourceOffsetBeats: number
  readonly totalBeats: number
  readonly numerator: number
  readonly width: number
  readonly loopBeats: number
}) {
  const { t } = useTranslation()
  const beatPixels = width / totalBeats
  const step =
    beatPixels < 12
      ? Math.ceil(40 / beatPixels / numerator) * numerator
      : beatPixels < 40
        ? numerator
        : 1
  const first = Math.ceil(sourceOffsetBeats / step) * step
  const count = Math.ceil(totalBeats / step) + 1
  const loopStep = loopBeats * Math.max(1, Math.ceil(24 / (loopBeats * beatPixels)))
  const firstLoop = Math.ceil(sourceOffsetBeats / loopStep) * loopStep
  return (
    <div
      className="border-border bg-background relative border-b"
      style={{ width, height: RULER_HEIGHT }}
    >
      <div
        className="bg-primary/20 text-muted-foreground border-primary absolute inset-x-0 top-0 h-4 truncate border-x-2 px-1 text-[9px]"
        title={t("detailMidi.sourceWindowHelp")}
      >
        {t("detailMidi.sourceWindow")} · {sourceOffsetBeats.toFixed(2)} —{" "}
        {(sourceOffsetBeats + totalBeats).toFixed(2)}
      </div>
      {Array.from(
        { length: Math.ceil(totalBeats / loopStep) + 1 },
        (_, index) => firstLoop + index * loopStep
      ).map(beat =>
        beat < sourceOffsetBeats + totalBeats ? (
          <span
            key={beat}
            className="border-primary text-primary pointer-events-none absolute top-0 h-4 border-l pl-0.5 text-[10px]"
            style={{ left: ((beat - sourceOffsetBeats) / totalBeats) * width }}
            title={t("detailMidi.loopBoundary")}
          >
            ↻
          </span>
        ) : null
      )}
      {Array.from({ length: count }, (_, index) => first + index * step).map(beat => {
        if (beat >= sourceOffsetBeats + totalBeats) return null
        const bar = Math.floor(beat / numerator) + 1
        const subdivision = (beat % numerator) + 1
        return (
          <div
            key={beat}
            className="border-border text-muted-foreground absolute bottom-0 h-6 border-l pt-1 pl-1 text-[10px]"
            style={{ left: ((beat - sourceOffsetBeats) / totalBeats) * width }}
          >
            {bar}.{subdivision}
          </div>
        )
      })}
    </div>
  )
}
