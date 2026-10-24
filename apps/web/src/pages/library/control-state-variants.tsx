import { useState } from "react"
import { Volume2 } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import {
  controlMetricStyle,
  DragPadBar,
  DragPadBipolar,
  DragPadNumber,
  DragPadToggle,
} from "@zoeymind/ui"

export function ControlStateVariants({
  kind,
}: {
  readonly kind: "numbers" | "bars" | "bipolar" | "toggles"
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(0.5)
  const [active, setActive] = useState(true)
  if (kind === "toggles")
    return (
      <div className="gap-control-gap flex flex-wrap items-end">
        <label className="space-y-1">
          <span className="text-muted-foreground block text-[10px]">
            {t("library.catalog.demo.compact")}
          </span>
          <DragPadToggle
            label={t("library.catalog.demo.compact")}
            value={active}
            onChange={setActive}
            size="compact"
            icon={<Volume2 />}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground block text-[10px]">
            {t("library.state.disabled")}
          </span>
          <DragPadToggle
            label={t("library.state.disabled")}
            value={false}
            onChange={setActive}
            disabled
            labelOff={t("library.state.disabled")}
          />
        </label>
      </div>
    )
  const Control = kind === "numbers" ? DragPadNumber : kind === "bars" ? DragPadBar : DragPadBipolar
  const min = kind === "bipolar" ? -1 : 0
  return (
    <div className="gap-control-gap flex flex-wrap items-end pt-2">
      <label className="space-y-1">
        <span className="text-muted-foreground block text-[10px]">
          {t("library.catalog.demo.compact")}
        </span>
        <Control
          value={value}
          onChange={setValue}
          min={min}
          max={1}
          step={0.01}
          defaultValue={0}
          size="compact"
          label={t("library.catalog.demo.compact")}
          icon={<Volume2 />}
        />
      </label>
      <label className="space-y-1">
        <span className="text-muted-foreground block text-[10px]">
          {t("library.catalog.demo.noTextEdit")}
        </span>
        <Control
          value={value}
          onChange={setValue}
          min={min}
          max={1}
          step={0.01}
          defaultValue={0}
          editable={false}
          label={t("library.catalog.demo.noTextEdit")}
        />
      </label>
      <label className="space-y-1">
        <span className="text-muted-foreground block text-[10px]">
          {t("library.state.disabled")}
        </span>
        <Control
          value={value}
          onChange={setValue}
          min={min}
          max={1}
          step={0.01}
          disabled
          label={t("library.state.disabled")}
        />
      </label>
      <label className="space-y-1">
        <span className="text-muted-foreground block text-[10px]">
          {t("library.catalog.states.readonly")}
        </span>
        <Control
          value={value}
          onChange={setValue}
          min={min}
          max={1}
          step={0.01}
          readOnly
          editable={false}
          label={t("library.catalog.states.readonly")}
        />
      </label>
      <label className="space-y-1" style={{ display: "block", ...controlMetricStyle("transport") }}>
        <span className="text-muted-foreground block text-[10px]">
          {t("library.catalog.demo.transport")}
        </span>
        <Control
          value={value}
          onChange={setValue}
          min={min}
          max={1}
          step={0.01}
          defaultValue={0}
          label={t("library.catalog.demo.transport")}
          icon={<Volume2 />}
        />
      </label>
    </div>
  )
}
