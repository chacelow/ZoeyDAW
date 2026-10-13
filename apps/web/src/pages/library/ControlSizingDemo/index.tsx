import { useState } from "react"
import { DragPadNumber, DragPadToggle } from "@zoeymind/ui"

export function ControlSizingDemo() {
  const [value, setValue] = useState(0.3)
  const [active, setActive] = useState(false)
  return (
    <>
      <DragPadNumber
        label="默认小数"
        value={value}
        onChange={setValue}
        min={0}
        max={1}
        step={0.01}
        defaultValue={0.3}
      />
      <DragPadToggle label="默认开关" value={active} onChange={setActive} />
    </>
  )
}
