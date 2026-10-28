import { useTranslation } from "@zoeymind/i18n"
import { DragPadNumber } from "@zoeymind/ui"
import { projectActions, useProjectEditGesture } from "@/pages/project/adapters"
import { ClipCardHeader } from "../ClipCardHeader"
import type { MidiClipContent, PatternClipContent } from "@zoeydaw/project-core/types"

function MidiNumber({
  field,
  clip,
  label,
  value,
  min,
  max,
  step,
}: {
  readonly field: "startBar" | "lengthBars" | "sourceOffsetBars" | "loopBars"
  readonly clip: MidiClipContent
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
}) {
  const gesture = useProjectEditGesture((next: number) =>
    projectActions.updateClip(clip.id, { [field]: Math.max(min, Math.min(max, next)) })
  )
  return (
    <label className="gap-control-gap flex min-w-0 flex-col">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <DragPadNumber
        size="compact"
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        format={number => number.toFixed(3)}
        {...gesture}
      />
    </label>
  )
}

export function MidiParameters({
  clip,
  sourceClip = clip,
  color,
  gridStep,
  selectedCount,
}: {
  readonly clip: MidiClipContent
  readonly sourceClip?: MidiClipContent | PatternClipContent
  readonly color: string
  readonly gridStep: string
  readonly selectedCount: number
}) {
  const { t } = useTranslation()
  return (
    <aside
      className="border-border @container flex min-h-0 min-w-0 flex-col overflow-hidden border-b @lg:border-r @lg:border-b-0"
      aria-label={t("detailMidi.title")}
    >
      <ClipCardHeader clip={sourceClip} color={color} />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <section className="gap-control-gap p-control-gap flex min-w-0 flex-col border-b @lg:grid @lg:grid-cols-2">
          <h3 className="text-muted-foreground text-[length:var(--text-control)] font-medium">
            {t("detailMidi.placement")}
          </h3>
          {"startBar" in sourceClip && typeof sourceClip.startBar === "number" && (
            <MidiNumber
              field="startBar"
              clip={clip}
              label={t("detailMidi.start")}
              value={sourceClip.startBar}
              min={1}
              max={512}
              step={1 / 64}
            />
          )}
          <MidiNumber
            field="lengthBars"
            clip={clip}
            label={t("detailMidi.length")}
            value={clip.lengthBars}
            min={1 / 64}
            max={512}
            step={1 / 64}
          />
          <MidiNumber
            field="sourceOffsetBars"
            clip={clip}
            label={t("detailMidi.sourceOffset")}
            value={clip.sourceOffsetBars ?? 0}
            min={0}
            max={512}
            step={1 / 64}
          />
          <p className="text-muted-foreground mt-control-gap col-span-full text-[length:var(--text-control)] leading-relaxed">
            {t("detailMidi.placementHelp")}
          </p>
        </section>
        <section className="gap-control-gap p-control-gap flex min-w-0 flex-col border-b @lg:grid @lg:grid-cols-2">
          <h3 className="text-muted-foreground text-[length:var(--text-control)] font-medium">
            {t("detailMidi.loop")}
          </h3>
          <MidiNumber
            field="loopBars"
            clip={clip}
            label={t("detailMidi.loopBars")}
            value={clip.loopBars ?? clip.lengthBars}
            min={1 / 16}
            max={64}
            step={1 / 4}
          />
          <p className="text-muted-foreground mt-control-gap col-span-full text-[length:var(--text-control)] leading-relaxed">
            {t("detailMidi.sourceWindowHelp")}
          </p>
          <h3 className="text-muted-foreground text-[length:var(--text-control)] font-medium">
            {t("detailMidi.editing")}
          </h3>
          <p className="text-muted-foreground text-[length:var(--text-control)] leading-relaxed">
            {gridStep} · {selectedCount} {t("detailMidi.selected")}
          </p>
        </section>
      </div>
    </aside>
  )
}
