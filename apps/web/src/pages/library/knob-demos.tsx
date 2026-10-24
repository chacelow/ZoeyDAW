import { useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { AudioLines, Filter, Gauge, Volume2 } from "lucide-react"
import { Button, Knob, controlMetricStyle } from "@zoeymind/ui"
import { ValueEcho } from "./gallery-section"

const strictNumber = (raw: string) =>
  /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : Number.NaN

export function KnobDemos() {
  const { t } = useTranslation()
  const [cutoff, setCutoff] = useState(1800)
  const [pan, setPan] = useState(-0.25)
  const [mix, setMix] = useState(35)
  const [gain, setGain] = useState(0)
  const [strict, setStrict] = useState(12)
  const [active, setActive] = useState(true)
  return (
    <section
      aria-labelledby="gallery-knob-controls"
      data-testid="knob-demos"
      className="gap-control-gap flex flex-col py-3"
    >
      <h3 id="gallery-knob-controls" className="text-xs font-medium">
        {t("library.knobs.title")}
      </h3>
      <div className="gap-control-track-gap flex flex-wrap items-center py-3">
        <Knob
          label={t("library.knobs.cutoff")}
          value={cutoff}
          onChange={setCutoff}
          min={20}
          max={20000}
          step={10}
          defaultValue={1800}
          icon={<Filter />}
          format={value => `${Math.round(value)} Hz`}
          color="var(--chart-2)"
        />
        <Knob
          label={t("library.knobs.pan")}
          value={pan}
          onChange={setPan}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
          bipolar
          format={value => value.toFixed(2)}
          color="var(--chart-3)"
        />
        <Knob
          label={t("library.knobs.mix")}
          value={mix}
          onChange={setMix}
          min={0}
          max={100}
          step={1}
          defaultValue={50}
          format={value => `${Math.round(value)}%`}
          icon={<AudioLines />}
          color="var(--chart-4)"
        />
      </div>
      <ValueEcho
        pairs={[
          [t("library.knobs.cutoff"), `${cutoff} Hz`],
          [t("library.knobs.pan"), pan.toFixed(2)],
          [t("library.knobs.mix"), `${mix}%`],
        ]}
      />
      <div className="gap-control-track-gap flex flex-wrap items-center py-3">
        <span className="text-muted-foreground text-[11px]">{t("library.knobs.compact")}</span>
        <Knob
          label={t("library.knobs.compact")}
          size="compact"
          value={gain}
          onChange={setGain}
          min={-24}
          max={24}
          step={0.1}
          defaultValue={0}
          bipolar
          format={value => `${value.toFixed(1)} dB`}
          icon={<Volume2 />}
        />
        <span className="text-muted-foreground text-[11px]">{t("library.knobs.transport")}</span>
        <div style={{ display: "flex", ...controlMetricStyle("transport") }}>
          <Knob
            label={t("library.knobs.transport")}
            value={gain}
            onChange={setGain}
            min={-24}
            max={24}
            step={0.1}
            defaultValue={0}
            bipolar
            format={value => `${value.toFixed(1)} dB`}
            icon={<Volume2 />}
            color="var(--chart-5)"
          />
        </div>
      </div>
      <div className="gap-control-track-gap flex flex-wrap items-center">
        <Knob
          label={t("library.knobs.disabled")}
          disabled
          value={35}
          onChange={setMix}
          min={0}
          max={100}
        />
        <Knob
          label={t("library.knobs.readOnly")}
          readOnly
          value={35}
          onChange={setMix}
          min={0}
          max={100}
        />
        <Knob
          label={t("library.knobs.active")}
          active={active}
          value={mix}
          onChange={setMix}
          min={0}
          max={100}
          defaultValue={50}
          color="var(--chart-2)"
        />
        <Button
          size="control"
          variant="secondary"
          aria-pressed={active}
          onClick={() => setActive(value => !value)}
        >
          {t("library.knobs.active")}
        </Button>
        <Knob
          label={t("library.knobs.noHighlight")}
          highlight={false}
          value={mix}
          onChange={setMix}
          min={0}
          max={100}
          defaultValue={50}
        />
      </div>
      <div className="gap-control-track-gap flex flex-wrap items-center py-3">
        <Knob
          label={t("library.knobs.parse")}
          value={strict}
          onChange={setStrict}
          min={-99}
          max={99}
          step={0.1}
          defaultValue={12}
          parse={strictNumber}
          format={value => value.toFixed(1)}
          icon={<Gauge />}
          color="var(--chart-1)"
        />
        <span className="text-muted-foreground text-[11px]">{t("library.knobs.parse")}</span>
      </div>
    </section>
  )
}
