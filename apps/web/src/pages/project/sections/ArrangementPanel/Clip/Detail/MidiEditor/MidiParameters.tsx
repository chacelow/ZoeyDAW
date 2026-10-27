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
    <label className="audio-detail-field">
      <span>{label}</span>
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

/**
MIDI clip settings sit in a side panel beside the piano roll, mirroring the
audio editor. Placement, loop length and grid state are real edits.
*/
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
    <aside className="audio-detail-parameters" aria-label={t("detailMidi.title")}>
      <ClipCardHeader clip={sourceClip} color={color} />
      <div className="audio-detail-parameter-scroll">
        <section className="audio-detail-parameter-column">
          <h3>{t("detailMidi.placement")}</h3>
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
          <p className="audio-detail-help">{t("detailMidi.placementHelp")}</p>
        </section>
        <section className="audio-detail-parameter-column">
          <h3>{t("detailMidi.loop")}</h3>
          <MidiNumber
            field="loopBars"
            clip={clip}
            label={t("detailMidi.loopBars")}
            value={clip.loopBars ?? clip.lengthBars}
            min={1 / 16}
            max={64}
            step={1 / 4}
          />
          <p className="audio-detail-help">{t("detailMidi.sourceWindowHelp")}</p>
          <h3>{t("detailMidi.editing")}</h3>
          <p className="audio-detail-help">
            {gridStep} · {selectedCount} {t("detailMidi.selected")}
          </p>
        </section>
      </div>
    </aside>
  )
}
