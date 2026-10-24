import { useState } from "react"
import { DragPadNumber } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"

export function ControlSizingDemo() {
  const { t } = useTranslation()
  const [value, setValue] = useState(0.3)
  return (
    <>
      <DragPadNumber
        label={t("library.controls.decimal")}
        value={value}
        onChange={setValue}
        min={0}
        max={1}
        step={0.01}
        defaultValue={0.3}
      />
      <DragPadNumber
        label={t("library.controls.position")}
        value={value * 999}
        onChange={next => setValue(next / 999)}
        min={0}
        max={999}
        step={1}
        defaultValue={0}
      />
    </>
  )
}
