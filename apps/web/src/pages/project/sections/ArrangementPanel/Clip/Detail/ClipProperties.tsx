import { useTranslation } from "@zoeymind/i18n"
import { DragPadNumber } from "@zoeymind/ui"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import type {
  AudioClipContent,
  Clip,
  PatternClipContent,
  MidiClipContent,
} from "@zoeydaw/project-core/types"

type SharedClip = AudioClipContent | MidiClipContent | PatternClipContent

type NumberFieldProps = {
  readonly clipId: string
  readonly field: keyof Clip
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly format?: (value: number) => string
}

function NumberField({
  clipId,
  field,
  label,
  value,
  min,
  max,
  step,
  format = number => number.toFixed(3),
}: NumberFieldProps) {
  const gesture = useProjectEditGesture((next: number) =>
    projectActions.updateClip(clipId, {
      [field]: Math.max(min, Math.min(max, next)),
    } as Partial<Clip>)
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
        format={format}
        {...gesture}
      />
    </label>
  )
}

function SelectField({
  clipId,
  field,
  label,
  value,
  options,
}: {
  readonly clipId: string
  readonly field: keyof Clip
  readonly label: string
  readonly value: number
  readonly options: readonly number[]
}) {
  return (
    <label className="gap-control-gap flex min-w-0 flex-col">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <select
        aria-label={label}
        className="border-border bg-input/30 text-foreground h-control-h px-control-pad-x rounded-sm border"
        value={value}
        onChange={event =>
          projectActions.updateClip(clipId, {
            [field]: Number(event.currentTarget.value),
          } as Partial<Clip>)
        }
      >
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function TextSelectField({
  clipId,
  field,
  label,
  value,
  options,
}: {
  readonly clipId: string
  readonly field: "scaleRoot" | "scaleMode"
  readonly label: string
  readonly value: string
  readonly options: readonly string[]
}) {
  return (
    <label className="gap-control-gap flex min-w-0 flex-col">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <select
        aria-label={label}
        className="border-border bg-input/30 text-foreground h-control-h px-control-pad-x rounded-sm border"
        value={value}
        onChange={event =>
          projectActions.updateClip(clipId, { [field]: event.currentTarget.value })
        }
      >
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function ReadonlyField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="gap-control-gap flex min-w-0 flex-col">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <span className="border-border bg-muted/45 text-foreground min-h-control-h px-control-pad-x flex items-center border tabular-nums">
        {value}
      </span>
    </div>
  )
}

export function ClipProperties({
  clip,
  placementClip,
}: {
  readonly clip: SharedClip
  readonly placementClip?: Clip
}) {
  const { t } = useTranslation()
  const transport = useProjectState(state => state.document.transport)
  const document = useProjectState(state => state.document)
  const startBar = placementClip && "startBar" in placementClip ? placementClip.startBar : 1
  const lengthBars = placementClip?.lengthBars ?? clip.lengthBars
  const endBar = startBar + lengthBars
  const clipId = placementClip?.id ?? clip.id
  return (
    <section className="border-border gap-control-gap p-control-gap flex min-w-0 flex-col border-b">
      <h3 className="text-muted-foreground text-[length:var(--text-control)] font-medium">
        {t("detailMidi.clip")}
      </h3>
      <div className="gap-control-gap grid min-w-0 grid-cols-2">
        {placementClip && "startBar" in placementClip ? (
          <>
            <NumberField
              clipId={clipId}
              field="startBar"
              label={t("detailMidi.start")}
              value={startBar}
              min={1}
              max={512}
              step={1 / 64}
            />
            <ReadonlyField label={t("detailMidi.end")} value={endBar.toFixed(3)} />
          </>
        ) : null}
        <NumberField
          clipId={clipId}
          field="sourceOffsetBars"
          label={t("detailMidi.position")}
          value={clip.sourceOffsetBars ?? 0}
          min={-512}
          max={512}
          step={1 / 64}
        />
        <NumberField
          clipId={clipId}
          field="lengthBars"
          label={t("detailMidi.length")}
          value={lengthBars}
          min={1 / 64}
          max={512}
          step={1 / 64}
        />
        <NumberField
          clipId={clipId}
          field="signatureNumerator"
          label={t("detailMidi.signature")}
          value={clip.signatureNumerator ?? transport.numerator}
          min={1}
          max={32}
          step={1}
          format={number => `${number}/${clip.signatureDenominator ?? transport.denominator}`}
        />
        <SelectField
          clipId={clipId}
          field="signatureDenominator"
          label={t("detailMidi.signatureDenominator")}
          value={clip.signatureDenominator ?? transport.denominator}
          options={[1, 2, 4, 8, 16, 32]}
        />
        <NumberField
          clipId={clipId}
          field="groove"
          label={t("detailMidi.groove")}
          value={clip.groove ?? document.groove}
          min={0}
          max={100}
          step={1}
          format={number => `${number}%`}
        />
        <TextSelectField
          clipId={clipId}
          field="scaleRoot"
          label={t("detailMidi.scaleRoot")}
          value={clip.scaleRoot ?? document.scaleRoot}
          options={["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]}
        />
        <TextSelectField
          clipId={clipId}
          field="scaleMode"
          label={t("detailMidi.scaleMode")}
          value={clip.scaleMode ?? document.scaleMode}
          options={["Major", "Minor", "Dorian", "Mixolydian", "Lydian", "Phrygian", "Locrian"]}
        />
      </div>
      <p className="text-muted-foreground text-[length:var(--text-control)] leading-relaxed">
        {t("detailMidi.clipHelp")}
      </p>
    </section>
  )
}
